import { useAccount, useReadContract } from 'wagmi'
import { erc20Abi, formatUnits } from 'viem'
import { computeMarketId, identityRegistryAbi, morphoAbi, navOracleAbi } from '@lien/sdk'
import { deployment as d } from '../deployments'
import { Hint } from './Hint'

export function KycBadge() {
  const { address } = useAccount()
  const { data: verified } = useReadContract({
    address: d.identityRegistry,
    abi: identityRegistryAbi,
    functionName: 'isVerified',
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address) && d.isDeployed },
  })
  if (!address) return <span className="badge muted">Connect wallet</span>
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center' }}>
      {verified ? (
        <span className="badge ok">KYC verified</span>
      ) : (
        <span className="badge warn">Not verified — request access</span>
      )}
      <Hint text="This RWA token is permissioned (ERC-3643-style): only KYC-allowlisted addresses may hold it or subscribe. Eligibility is enforced on-chain by an IdentityRegistry, not just in the UI." />
    </span>
  )
}

export function NavCard() {
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
        NAV / share
        <Hint text="Net Asset Value of one tBILL share, pushed on-chain by the oracle. Yield shows up as NAV rising above $1.00 (e.g. a T-bill accruing interest)." />
      </div>
      <div className="value">{nav !== undefined ? `$${formatUnits(nav, 18)}` : '—'}</div>
      {stale ? (
        <div className="badge warn">
          feed stale · market frozen
          <Hint text="The oracle hasn't updated within its staleness window (or is circuit-broken). The whole market freezes — a fail-safe, so positions are never priced off a dead feed." />
        </div>
      ) : (
        <div className="badge ok">
          live
          <Hint text="Oracle price is fresh and within its allowed deviation. If it went stale, the market would freeze (fail-safe)." />
        </div>
      )}
    </div>
  )
}

export function PortfolioCard() {
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
        Your RWA position
        <Hint text="Your tBILL balance × current NAV. tBILL is the tokenized real-world asset (e.g. a T-bill fund share)." />
      </div>
      <div className="value">{balance !== undefined ? `${formatUnits(balance, d.rwaDecimals)} tBILL` : '—'}</div>
      <div className="sub">{usdValueWad !== undefined ? `≈ $${formatUnits(usdValueWad, 18)}` : ''}</div>
    </div>
  )
}

/** A strip of live protocol stats above the action cards. */
export function StatsBar() {
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
        <div className="stat-label">Available market liquidity</div>
        <div className="stat-value">{liquidity !== undefined ? `$${formatUnits(liquidity, d.usdcDecimals)}` : '—'}</div>
      </div>
      <div className="stat">
        <div className="stat-label">tBILL outstanding</div>
        <div className="stat-value">{supply !== undefined ? `${formatUnits(supply, d.rwaDecimals)}` : '—'}</div>
      </div>
      <div className="stat">
        <div className="stat-label">Max loan-to-value</div>
        <div className="stat-value">{ltvPct}%</div>
      </div>
    </div>
  )
}

export function HealthGauge({ hfWad, debt }: { hfWad: bigint; debt: bigint }) {
  if (debt === 0n) return <span className="badge ok">No debt · HF ∞</span>
  const hf = Number(hfWad) / 1e18
  const cls = hf >= 1.5 ? 'ok' : hf >= 1.1 ? 'warn' : 'danger'
  return <span className={`badge ${cls}`}>HF {hf.toFixed(3)}</span>
}
