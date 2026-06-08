import { useAccount, useReadContract } from 'wagmi'
import { erc20Abi, formatUnits } from 'viem'
import { identityRegistryAbi, navOracleAbi } from '@lien/sdk'
import { deployment as d } from '../deployments'

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
  return verified ? (
    <span className="badge ok">KYC verified</span>
  ) : (
    <span className="badge warn">Not verified — request access</span>
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
      <div className="label">NAV / share</div>
      <div className="value">{nav !== undefined ? `$${formatUnits(nav, 18)}` : '—'}</div>
      {stale ? <div className="badge warn">feed stale · market frozen</div> : <div className="badge ok">live</div>}
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
      <div className="label">Your RWA position</div>
      <div className="value">{balance !== undefined ? `${formatUnits(balance, d.rwaDecimals)} tBILL` : '—'}</div>
      <div className="sub">{usdValueWad !== undefined ? `≈ $${formatUnits(usdValueWad, 18)}` : ''}</div>
    </div>
  )
}

export function HealthGauge({ hfWad, debt }: { hfWad: bigint; debt: bigint }) {
  if (debt === 0n) return <span className="badge ok">No debt · HF ∞</span>
  const hf = Number(hfWad) / 1e18
  const cls = hf >= 1.5 ? 'ok' : hf >= 1.1 ? 'warn' : 'danger'
  return <span className={`badge ${cls}`}>HF {hf.toFixed(3)}</span>
}
