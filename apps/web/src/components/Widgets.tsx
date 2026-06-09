import { useAccount, useReadContract } from 'wagmi'
import { erc20Abi, formatUnits } from 'viem'
import { computeMarketId, identityRegistryAbi, morphoAbi, navOracleAbi } from '@lien/sdk'
import { deployment as d } from '../deployments'
import { Hint } from './Hint'
import { useI18n } from '../i18n'

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
    query: { enabled: Boolean(address) && d.isDeployed },
  })
  const { data: nav } = useReadContract({
    address: d.navOracle,
    abi: navOracleAbi,
    functionName: 'nav',
    query: { enabled: d.isDeployed },
  })
  const usdValueWad = balance !== undefined && nav !== undefined ? (balance * nav) / 10n ** 18n : undefined
  return (
    <div className="card">
      <div className="label">
        {t('portfolio.label')}
        <Hint text={t('portfolio.hint')} />
      </div>
      <div className="value">{balance !== undefined ? `${formatUnits(balance, d.rwaDecimals)} tBILL` : '—'}</div>
      <div className="sub">{usdValueWad !== undefined ? `≈ $${formatUnits(usdValueWad, 18)}` : ''}</div>
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
        <div className="stat-value">{liquidity !== undefined ? `$${formatUnits(liquidity, d.usdcDecimals)}` : '—'}</div>
      </div>
      <div className="stat">
        <div className="stat-label">{t('stats.outstanding')}</div>
        <div className="stat-value">{supply !== undefined ? `${formatUnits(supply, d.rwaDecimals)}` : '—'}</div>
      </div>
      <div className="stat">
        <div className="stat-label">{t('stats.maxltv')}</div>
        <div className="stat-value">{ltvPct}%</div>
      </div>
    </div>
  )
}

export function HealthGauge({ hfWad, debt }: { hfWad: bigint; debt: bigint }) {
  const { t } = useI18n()
  if (debt === 0n) return <span className="badge ok">{t('health.noDebt')}</span>
  const hf = Number(hfWad) / 1e18
  const cls = hf >= 1.5 ? 'ok' : hf >= 1.1 ? 'warn' : 'danger'
  return <span className={`badge ${cls}`}>HF {hf.toFixed(3)}</span>
}
