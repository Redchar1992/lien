import { useMemo, useState } from 'react'
import { useAccount, usePublicClient, useReadContract } from 'wagmi'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { type PublicClient, erc20Abi, formatUnits, parseUnits } from 'viem'
import { computeMarketId, morphoAbi, navOracleAbi, readPositionHealth, subscriptionManagerAbi } from '@lien/sdk'
import { deployment as d } from '../deployments'
import { useTx } from '../tx'
import { HealthGauge } from './Widgets'
import { Hint } from './Hint'
import { useI18n } from '../i18n'
import { fmt, exact } from '../format'

/** A "Balance: X [Max]" row above an input. `prefix` lets it read e.g. "Available to borrow". */
function BalanceRow({
  prefix,
  label,
  balance,
  decimals,
  onMax,
}: {
  prefix?: string
  label: string
  balance?: bigint
  decimals: number
  onMax: () => void
}) {
  const { t } = useI18n()
  return (
    <div className="balrow">
      <span>
        {prefix ?? t('balance')}: {balance !== undefined ? `${fmt(balance, decimals)} ${label}` : '—'}
      </span>
      <button className="maxbtn" disabled={!balance} onClick={onMax}>
        {t('max')}
      </button>
    </div>
  )
}

function TxStatusLine({ status, message }: { status: string; message?: string }) {
  if (status === 'idle') return null
  return <div className={`txline ${status}`}>{status}{message ? ` · ${message}` : ''}</div>
}

interface PendingItem {
  id: number
  usdcOwed: bigint
  claimableAt: number
}

/** The user's queued redemptions + a Claim button (enabled once the T+N delay passes). */
function PendingRedemptions() {
  const { t } = useI18n()
  const { address } = useAccount()
  const publicClient = usePublicClient()
  const { state, run } = useTx()

  const { data: pending, refetch } = useQuery({
    queryKey: ['pending-redemptions', address],
    enabled: Boolean(address) && d.isDeployed && Boolean(publicClient),
    refetchInterval: 5000,
    queryFn: async (): Promise<PendingItem[]> => {
      const client = publicClient as unknown as PublicClient
      const len = (await client.readContract({
        address: d.subscriptionManager,
        abi: subscriptionManagerAbi,
        functionName: 'requestsLength',
      })) as bigint
      const items: PendingItem[] = []
      for (let i = 0n; i < len; i++) {
        const r = (await client.readContract({
          address: d.subscriptionManager,
          abi: subscriptionManagerAbi,
          functionName: 'requests',
          args: [i],
        })) as readonly [`0x${string}`, bigint, bigint, boolean]
        const [user, usdcOwed, claimableAt, claimed] = r
        if (!claimed && user.toLowerCase() === (address as string).toLowerCase()) {
          items.push({ id: Number(i), usdcOwed, claimableAt: Number(claimableAt) })
        }
      }
      return items
    },
  })

  if (!pending || pending.length === 0) return null
  const now = Math.floor(Date.now() / 1000)

  async function claim(id: number) {
    const r = await run({
      address: d.subscriptionManager,
      abi: subscriptionManagerAbi,
      functionName: 'claimRedemption',
      args: [BigInt(id)],
    })
    if (r?.status === 'confirmed') refetch()
  }

  return (
    <div className="pending">
      <div className="sub">{t('pending.title')}</div>
      {pending.map((p) => {
        const ready = now >= p.claimableAt
        const secs = Math.max(0, p.claimableAt - now)
        return (
          <div className="row" key={p.id}>
            <span className="sub">
              ${formatUnits(p.usdcOwed, d.usdcDecimals)} USDC · {ready ? t('pending.ready') : `${t('pending.claimableIn')} ~${secs}s`}
            </span>
            <button disabled={!ready} onClick={() => claim(p.id)}>{t('pending.claim')}</button>
          </div>
        )
      })}
      <TxStatusLine status={state.status} message={state.error?.message} />
    </div>
  )
}

export function SubscribeRedeem() {
  const { t } = useI18n()
  const { address } = useAccount()
  const { state, run } = useTx()
  const queryClient = useQueryClient()
  const [usdcIn, setUsdcIn] = useState('')
  const [rwaIn, setRwaIn] = useState('')

  const { data: usdcBalance } = useReadContract({
    address: d.usdc,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address) && d.isDeployed, refetchInterval: 8000 },
  })
  const { data: tbillBalance } = useReadContract({
    address: d.rwaToken,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address) && d.isDeployed, refetchInterval: 8000 },
  })

  const usdcAmt = safeParse(usdcIn, d.usdcDecimals)
  const rwaAmt = safeParse(rwaIn, d.rwaDecimals)

  const { data: previewRwa } = useReadContract({
    address: d.subscriptionManager,
    abi: subscriptionManagerAbi,
    functionName: 'previewSubscribe',
    args: [usdcAmt],
    query: { enabled: d.isDeployed && usdcAmt > 0n },
  })
  const { data: previewUsdc } = useReadContract({
    address: d.subscriptionManager,
    abi: subscriptionManagerAbi,
    functionName: 'previewRedeem',
    args: [rwaAmt],
    query: { enabled: d.isDeployed && rwaAmt > 0n },
  })

  const disabled = !address || !d.isDeployed

  async function subscribe() {
    const approved = await run({ address: d.usdc, abi: erc20Abi, functionName: 'approve', args: [d.subscriptionManager, usdcAmt] })
    if (approved?.status !== 'confirmed') return // don't fire the action if approve failed/was rejected
    const r = await run({ address: d.subscriptionManager, abi: subscriptionManagerAbi, functionName: 'subscribe', args: [usdcAmt] })
    if (r?.status === 'confirmed') {
      setUsdcIn('')
      queryClient.invalidateQueries()
    }
  }
  async function redeem() {
    const r = await run({ address: d.subscriptionManager, abi: subscriptionManagerAbi, functionName: 'requestRedemption', args: [rwaAmt] })
    if (r?.status === 'confirmed') {
      setRwaIn('')
      queryClient.invalidateQueries()
    }
  }

  return (
    <div className="card" id="subscribe">
      <div className="label">
        {t('subredeem.label')}
        <Hint text={t('subredeem.hint')} />
      </div>
      <BalanceRow
        label="USDC"
        balance={usdcBalance}
        decimals={d.usdcDecimals}
        onMax={() => setUsdcIn(usdcBalance ? exact(usdcBalance, d.usdcDecimals) : '')}
      />
      <div className="row">
        <input placeholder={t('subredeem.usdcPh')} value={usdcIn} onChange={(e) => setUsdcIn(e.target.value)} />
        <button disabled={disabled || usdcAmt === 0n} onClick={subscribe}>{t('subredeem.subscribe')}</button>
      </div>
      <div className="sub">{previewRwa !== undefined ? `→ ${fmt(previewRwa, d.rwaDecimals)} tBILL` : ''}</div>
      <BalanceRow
        label="tBILL"
        balance={tbillBalance}
        decimals={d.rwaDecimals}
        onMax={() => setRwaIn(tbillBalance ? exact(tbillBalance, d.rwaDecimals) : '')}
      />
      <div className="row">
        <input placeholder={t('subredeem.tbillPh')} value={rwaIn} onChange={(e) => setRwaIn(e.target.value)} />
        <button disabled={disabled || rwaAmt === 0n} onClick={redeem}>{t('subredeem.requestRedeem')}</button>
      </div>
      <div className="sub">{previewUsdc !== undefined ? `→ $${fmt(previewUsdc, d.usdcDecimals)} ${t('subredeem.settlesTN')}` : ''}</div>
      <PendingRedemptions />
      <TxStatusLine status={state.status} message={state.error?.message} />
    </div>
  )
}

export function BorrowPanel() {
  const { t } = useI18n()
  const { address } = useAccount()
  const publicClient = usePublicClient()
  const { state, run } = useTx()
  const queryClient = useQueryClient()
  const [collIn, setCollIn] = useState('')
  const [borrowIn, setBorrowIn] = useState('')

  const { data: tbillBalance } = useReadContract({
    address: d.rwaToken,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address) && d.isDeployed, refetchInterval: 8000 },
  })

  const marketId = useMemo(() => computeMarketId(d.marketParams), [])

  const { data: nav } = useReadContract({
    address: d.navOracle,
    abi: navOracleAbi,
    functionName: 'nav',
    query: { enabled: d.isDeployed },
  })

  const { data: health } = useQuery({
    queryKey: ['health', address, marketId, nav?.toString()],
    enabled: Boolean(address) && d.isDeployed && nav !== undefined && Boolean(publicClient),
    refetchInterval: 12_000,
    queryFn: () =>
      readPositionHealth({
        client: publicClient as unknown as PublicClient,
        morpho: d.morpho,
        marketId,
        user: address as `0x${string}`,
        navWad: nav as bigint,
        lltvWad: d.marketParams.lltv,
        loanDecimals: d.usdcDecimals,
        collateralDecimals: d.rwaDecimals,
      }),
  })

  const collAmt = safeParse(collIn, d.rwaDecimals)
  const borrowAmt = safeParse(borrowIn, d.usdcDecimals)
  const disabled = !address || !d.isDeployed

  // spare borrowing power (USDC units), with a 5% margin so a Max-borrow keeps HF > 1
  const spareBorrow = health && health.weightedCollateral > health.debt ? health.weightedCollateral - health.debt : 0n
  const maxBorrow = (spareBorrow * 95n) / 100n
  const ltvPct = Number(d.marketParams.lltv / 10n ** 16n)

  async function supplyCollateral() {
    const approved = await run({ address: d.rwaToken, abi: erc20Abi, functionName: 'approve', args: [d.morpho, collAmt] })
    if (approved?.status !== 'confirmed') return
    const r = await run({
      address: d.morpho,
      abi: morphoAbi,
      functionName: 'supplyCollateral',
      args: [d.marketParams, collAmt, address as `0x${string}`, '0x'],
    })
    if (r?.status === 'confirmed') {
      setCollIn('')
      queryClient.invalidateQueries()
    }
  }
  async function borrow() {
    const r = await run({
      address: d.morpho,
      abi: morphoAbi,
      functionName: 'borrow',
      args: [d.marketParams, borrowAmt, 0n, address as `0x${string}`, address as `0x${string}`],
    })
    if (r?.status === 'confirmed') {
      setBorrowIn('')
      queryClient.invalidateQueries()
    }
  }

  return (
    <div className="card" id="borrow">
      <div className="label">
        {t('borrow.label')}
        <Hint text={t('borrow.hint')} />
        {health ? <HealthGauge health={health} ltvPct={ltvPct} usdcDecimals={d.usdcDecimals} /> : null}
      </div>
      <div className="sub">
        {health
          ? `${t('borrow.collateral')} ${fmt(health.collateral, d.rwaDecimals)} tBILL · ${t('borrow.debt')} $${fmt(health.debt, d.usdcDecimals)}`
          : t('borrow.noPosition')}
      </div>
      <BalanceRow
        label="tBILL"
        balance={tbillBalance}
        decimals={d.rwaDecimals}
        onMax={() => setCollIn(tbillBalance ? exact(tbillBalance, d.rwaDecimals) : '')}
      />
      <div className="row">
        <input placeholder={t('borrow.collateralPh')} value={collIn} onChange={(e) => setCollIn(e.target.value)} />
        <button disabled={disabled || collAmt === 0n} onClick={supplyCollateral}>{t('borrow.supply')}</button>
      </div>
      <BalanceRow
        prefix={t('borrow.available')}
        label="USDC"
        balance={maxBorrow}
        decimals={d.usdcDecimals}
        onMax={() => setBorrowIn(maxBorrow > 0n ? exact(maxBorrow, d.usdcDecimals) : '')}
      />
      <div className="row">
        <input placeholder={t('borrow.borrowPh')} value={borrowIn} onChange={(e) => setBorrowIn(e.target.value)} />
        <button disabled={disabled || borrowAmt === 0n} onClick={borrow}>{t('borrow.borrow')}</button>
      </div>
      <TxStatusLine status={state.status} message={state.error?.message} />
    </div>
  )
}

function safeParse(v: string, decimals: number): bigint {
  try {
    if (!v || Number.isNaN(Number(v))) return 0n
    return parseUnits(v as `${number}`, decimals)
  } catch {
    return 0n
  }
}
