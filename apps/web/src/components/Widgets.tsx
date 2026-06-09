import { useAccount, useReadContract } from 'wagmi'
import { erc20Abi, formatUnits } from 'viem'
import { computeMarketId, identityRegistryAbi, morphoAbi, navOracleAbi, type PositionHealth } from '@lien/sdk'
import { deployment as d } from '../deployments'
import { Hint } from './Hint'
import { useI18n } from '../i18n'
import { fmt } from '../format'

export function KycBadge() {
  const { address } = useAccount()
  const { data: verified } = useReadContract({
    address: d.identityRegistry,
    abi: identityRegistryAbi,
    functionName: 'isVerified',
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address) && d.isDeployed },
  })
  const { t } = useI18n()
  if (!address) return <span className="badge muted">{t('kyc.connect')}</span>
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center' }}>
      {verified ? (
        <span className="badge ok">{t('kyc.verified')}</span>
      ) : (
        <span className="badge warn">{t('kyc.notVerified')}</span>
      )}
      <Hint text={t('kyc.hint')} />
    </span>
  )
}

export function NavCard() {
  const { t } = useI18n()
  const { data: nav } = useReadContract({
    address: d.navOracle,
    abi: navOracleAbi,
    functionName: 'nav',
    query: { enabled: d.isDeployed, refetchInterval: 12_000 },
  })
  const { data: stale } = useReadContract({
    address: d.navOracle,
    abi: navOracleAbi,
    functionName: 'isStale',
    query: { enabled: d.isDeployed, refetchInterval: 12_000 },
  })
  return (
    <div className="card">
      <div className="label">
        {t('nav.label')}
        <Hint text={t('nav.hint')} />
      </div>
      <div className="value">{nav !== undefined ? `$${formatUnits(nav, 18)}` : '—'}</div>
      {stale ? (
        <div className="badge warn">
          {t('nav.stale')}
          <Hint text={t('nav.staleHint')} />
        </div>
      ) : (
        <div className="badge ok">
          {t('nav.live')}
          <Hint text={t('nav.liveHint')} />
        </div>
      )}
    </div>
  )
}

export function PortfolioCard() {
  const { t } = useI18n()
  const { address } = useAccount()
  const { data: balance } = useReadContract({
    address: d.rwaToken,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address) && d.isDeployed, refetchInterval: 8000 },
  })
  const { data: nav } = useReadContract({
    address: d.navOracle,
    abi: navOracleAbi,
    functionName: 'nav',
    query: { enabled: d.isDeployed, refetchInterval: 12000 },
  })
  const usdValueWad = balance !== undefined && nav !== undefined ? (balance * nav) / 10n ** 18n : undefined
  return (
    <div className="card">
      <div className="label">
        {t('portfolio.label')}
        <Hint text={t('portfolio.hint')} />
      </div>
      <div className="value">{balance !== undefined ? `${fmt(balance, d.rwaDecimals)} tBILL` : '—'}</div>
      <div className="sub">{usdValueWad !== undefined ? `≈ $${fmt(usdValueWad, 18)}` : ''}</div>
    </div>
  )
}

/** A strip of live protocol stats above the action cards. */
export function StatsBar() {
  const { t } = useI18n()
  const marketId = computeMarketId(d.marketParams)
  const { data: market } = useReadContract({
    address: d.morpho,
    abi: morphoAbi,
    functionName: 'market',
    args: [marketId],
    query: { enabled: d.isDeployed, refetchInterval: 15_000 },
  })
  const { data: supply } = useReadContract({
    address: d.rwaToken,
    abi: erc20Abi,
    functionName: 'totalSupply',
    query: { enabled: d.isDeployed, refetchInterval: 15_000 },
  })
  const m = market as readonly bigint[] | undefined
  const liquidity = m ? m[0] - m[2] : undefined // totalSupply − totalBorrow = available USDC
  const ltvPct = Number(d.marketParams.lltv / 10n ** 16n)

  return (
    <div className="stats">
      <div className="stat">
        <div className="stat-label">{t('stats.liquidity')}</div>
        <div className="stat-value">{liquidity !== undefined ? `$${fmt(liquidity, d.usdcDecimals)}` : '—'}</div>
      </div>
      <div className="stat">
        <div className="stat-label">{t('stats.outstanding')}</div>
        <div className="stat-value">{supply !== undefined ? `${fmt(supply, d.rwaDecimals)}` : '—'}</div>
      </div>
      <div className="stat">
        <div className="stat-label">{t('stats.maxltv')}</div>
        <div className="stat-value">{ltvPct}%</div>
      </div>
    </div>
  )
}

export function HealthGauge({
  health,
  ltvPct,
  usdcDecimals,
}: {
  health: PositionHealth
  ltvPct: number
  usdcDecimals: number
}) {
  const { t } = useI18n()
  const noDebt = health.debt === 0n
  const hf = noDebt ? Infinity : Number(health.healthFactorWad) / 1e18
  const cls = noDebt || hf >= 1.5 ? 'ok' : hf >= 1.1 ? 'warn' : 'danger'
  const hint = noDebt
    ? `${t('hf.title')} · ${t('hf.bands')}`
    : `${t('hf.title')} = (${t('hf.collateral')} $${fmt(health.collateralValue, usdcDecimals)} × ${t('hf.ltv')} ${ltvPct}%) ÷ ${t('hf.debt')} $${fmt(health.debt, usdcDecimals)} = ${hf.toFixed(3)} · ${t('hf.bands')}`
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center' }}>
      <span className={`badge ${cls}`}>{noDebt ? t('health.noDebt') : `HF ${hf.toFixed(3)}`}</span>
      <Hint text={hint} />
    </span>
  )
}
