import { useMemo, useState } from 'react'
import { useAccount, usePublicClient, useReadContract } from 'wagmi'
import { useQuery } from '@tanstack/react-query'
import { type PublicClient, erc20Abi, formatUnits, parseUnits } from 'viem'
import { computeMarketId, morphoAbi, navOracleAbi, readPositionHealth, subscriptionManagerAbi } from '@lien/sdk'
import { deployment as d } from '../deployments'
import { useTx } from '../tx'
import { HealthGauge } from './Widgets'

function TxStatusLine({ status, message }: { status: string; message?: string }) {
  if (status === 'idle') return null
  return <div className={`txline ${status}`}>{status}{message ? ` · ${message}` : ''}</div>
}

export function SubscribeRedeem() {
  const { address } = useAccount()
  const { state, run } = useTx()
  const [usdcIn, setUsdcIn] = useState('')
  const [rwaIn, setRwaIn] = useState('')

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
    await run({ address: d.usdc, abi: erc20Abi, functionName: 'approve', args: [d.subscriptionManager, usdcAmt] })
    await run({ address: d.subscriptionManager, abi: subscriptionManagerAbi, functionName: 'subscribe', args: [usdcAmt] })
  }
  async function redeem() {
    await run({ address: d.subscriptionManager, abi: subscriptionManagerAbi, functionName: 'requestRedemption', args: [rwaAmt] })
  }

  return (
    <div className="card">
      <div className="label">Subscribe / Redeem</div>
      <div className="row">
        <input placeholder="USDC amount" value={usdcIn} onChange={(e) => setUsdcIn(e.target.value)} />
        <button disabled={disabled || usdcAmt === 0n} onClick={subscribe}>Subscribe</button>
      </div>
      <div className="sub">{previewRwa !== undefined ? `→ ${formatUnits(previewRwa, d.rwaDecimals)} tBILL` : ''}</div>
      <div className="row">
        <input placeholder="tBILL amount" value={rwaIn} onChange={(e) => setRwaIn(e.target.value)} />
        <button disabled={disabled || rwaAmt === 0n} onClick={redeem}>Request redeem</button>
      </div>
      <div className="sub">{previewUsdc !== undefined ? `→ $${formatUnits(previewUsdc, d.usdcDecimals)} (settles T+N)` : ''}</div>
      <TxStatusLine status={state.status} message={state.error?.message} />
    </div>
  )
}

export function BorrowPanel() {
  const { address } = useAccount()
  const publicClient = usePublicClient()
  const { state, run } = useTx()
  const [collIn, setCollIn] = useState('')
  const [borrowIn, setBorrowIn] = useState('')

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

  async function supplyCollateral() {
    await run({ address: d.rwaToken, abi: erc20Abi, functionName: 'approve', args: [d.morpho, collAmt] })
    await run({
      address: d.morpho,
      abi: morphoAbi,
      functionName: 'supplyCollateral',
      args: [d.marketParams, collAmt, address as `0x${string}`, '0x'],
    })
  }
  async function borrow() {
    await run({
      address: d.morpho,
      abi: morphoAbi,
      functionName: 'borrow',
      args: [d.marketParams, borrowAmt, 0n, address as `0x${string}`, address as `0x${string}`],
    })
  }

  return (
    <div className="card">
      <div className="label">Borrow against RWA {health ? <HealthGauge hfWad={health.healthFactorWad} debt={health.debt} /> : null}</div>
      <div className="sub">
        {health
          ? `collateral ${formatUnits(health.collateral, d.rwaDecimals)} tBILL · debt $${formatUnits(health.debt, d.usdcDecimals)}`
          : 'no position'}
      </div>
      <div className="row">
        <input placeholder="tBILL collateral" value={collIn} onChange={(e) => setCollIn(e.target.value)} />
        <button disabled={disabled || collAmt === 0n} onClick={supplyCollateral}>Supply collateral</button>
      </div>
      <div className="row">
        <input placeholder="USDC to borrow" value={borrowIn} onChange={(e) => setBorrowIn(e.target.value)} />
        <button disabled={disabled || borrowAmt === 0n} onClick={borrow}>Borrow</button>
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
