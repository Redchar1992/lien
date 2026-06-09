import { ConnectButton } from '@rainbow-me/rainbowkit'
import { KycBadge, NavCard, PortfolioCard, StatsBar } from './components/Widgets'
import { SubscribeRedeem, BorrowPanel } from './components/Actions'
import { deployment as d } from './deployments'

const REPO = 'https://github.com/Redchar1992/lien'
const EXPLORER = 'https://sepolia.basescan.org/address/'

export function App() {
  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo">lien</span>
          <span className="tagline">tokenized RWA you can borrow against</span>
        </div>
        <div className="topbar-right">
          <KycBadge />
          <ConnectButton />
        </div>
      </header>

      <div className="subbar">
        <span className="chip">Base Sepolia · testnet</span>
        <span className="dot">·</span>
        <a className="link" href={REPO} target="_blank" rel="noreferrer">GitHub ↗</a>
        <a className="link" href={`${EXPLORER}${d.morpho}`} target="_blank" rel="noreferrer">contracts ↗</a>
        <span className="subbar-note">RWA credit: subscribe → use as collateral → borrow → liquidation, all on-chain & permissioned.</span>
      </div>

      {!d.isDeployed && (
        <div className="banner">
          Contracts not yet deployed. This UI is wired to the M5 Base Sepolia deployment — set
          addresses in <code>src/deployments.ts</code> (filled automatically by the deploy script).
        </div>
      )}

      <StatsBar />

      <section className="section">
        <div className="section-title">Your account</div>
        <div className="grid">
          <NavCard />
          <PortfolioCard />
        </div>
      </section>

      <section className="section">
        <div className="section-title">Actions</div>
        <div className="grid">
          <SubscribeRedeem />
          <BorrowPanel />
        </div>
      </section>

      <footer className="foot">
        <p>
          EVM-native (viem/wagmi). The tx-lifecycle SDK is ported from the TRON sibling — same
          state machine + error taxonomy; TronWeb→viem is an interface swap, not a rewrite.
        </p>
        <p className="foot-links">
          <a href={REPO} target="_blank" rel="noreferrer">source</a>
          <a href={`${EXPLORER}${d.subscriptionManager}`} target="_blank" rel="noreferrer">SubscriptionManager</a>
          <a href={`${EXPLORER}${d.morpho}`} target="_blank" rel="noreferrer">Morpho engine</a>
          <a href={`${EXPLORER}${d.liquidationRouter}`} target="_blank" rel="noreferrer">LiquidationRouter</a>
          <a href={`${EXPLORER}${d.navOracle}`} target="_blank" rel="noreferrer">NavOracle</a>
        </p>
      </footer>
    </div>
  )
}
