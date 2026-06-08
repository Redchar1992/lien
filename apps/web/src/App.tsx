import { ConnectButton } from '@rainbow-me/rainbowkit'
import { KycBadge, NavCard, PortfolioCard } from './components/Widgets'
import { SubscribeRedeem, BorrowPanel } from './components/Actions'
import { deployment as d } from './deployments'

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

      {!d.isDeployed && (
        <div className="banner">
          Contracts not yet deployed. This UI is wired to the M5 Base Sepolia deployment — set
          addresses in <code>src/deployments.ts</code> (filled automatically by the deploy script).
        </div>
      )}

      <main className="grid">
        <NavCard />
        <PortfolioCard />
        <SubscribeRedeem />
        <BorrowPanel />
      </main>

      <footer className="foot">
        EVM-native (viem/wagmi). The tx-lifecycle SDK is ported from the TRON sibling — same
        state machine + error taxonomy, TronWeb→viem is an interface swap.
      </footer>
    </div>
  )
}
