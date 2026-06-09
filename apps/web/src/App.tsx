import { ConnectButton } from '@rainbow-me/rainbowkit'
import { KycBadge, NavCard, PortfolioCard, StatsBar } from './components/Widgets'
import { SubscribeRedeem, BorrowPanel } from './components/Actions'
import { deployment as d } from './deployments'
import { useI18n } from './i18n'

const REPO = 'https://github.com/Redchar1992/lien'
const EXPLORER = 'https://sepolia.basescan.org/address/'

export function App() {
  const { lang, setLang, t } = useI18n()
  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo">lien</span>
          <span className="tagline">{t('tagline')}</span>
        </div>
        <div className="topbar-right">
          <button className="lang-toggle" onClick={() => setLang(lang === 'en' ? 'zh' : 'en')}>
            {lang === 'en' ? '繁中' : 'EN'}
          </button>
          <KycBadge />
          <ConnectButton />
        </div>
      </header>

      <div className="subbar">
        <span className="chip">Base Sepolia · testnet</span>
        <span className="dot">·</span>
        <a className="link" href={REPO} target="_blank" rel="noreferrer">GitHub ↗</a>
        <a className="link" href={`${EXPLORER}${d.morpho}`} target="_blank" rel="noreferrer">{t('subbar.contracts')}</a>
        <span className="subbar-note">{t('subbar.note')}</span>
      </div>

      {!d.isDeployed && (
        <div className="banner">
          {t('banner')}
        </div>
      )}

      <StatsBar />

      <section className="section">
        <div className="section-title">{t('section.account')}</div>
        <div className="grid">
          <NavCard />
          <PortfolioCard />
        </div>
      </section>

      <section className="section">
        <div className="section-title">{t('section.actions')}</div>
        <div className="grid">
          <SubscribeRedeem />
          <BorrowPanel />
        </div>
      </section>

      <footer className="foot">
        <p>{t('footer.sdk')}</p>
        <p className="foot-links">
          <a href={REPO} target="_blank" rel="noreferrer">{t('footer.source')}</a>
          <a href={`${EXPLORER}${d.subscriptionManager}`} target="_blank" rel="noreferrer">SubscriptionManager</a>
          <a href={`${EXPLORER}${d.morpho}`} target="_blank" rel="noreferrer">Morpho engine</a>
          <a href={`${EXPLORER}${d.liquidationRouter}`} target="_blank" rel="noreferrer">LiquidationRouter</a>
          <a href={`${EXPLORER}${d.navOracle}`} target="_blank" rel="noreferrer">NavOracle</a>
        </p>
      </footer>
    </div>
  )
}
