import { VaultPanel } from './components/VaultPanel'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { KycBadge, NavCard, PortfolioCard, StatsBar } from './components/Widgets'
import { SubscribeRedeem, BorrowPanel } from './components/Actions'
import { Hero, HowItWorks } from './components/Hero'
import { Hint } from './components/Hint'
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

      <div className="banner"><strong>Base Sepolia · 真实测试网调用 / Testnet</strong><br />使用 mock USDC / tBILL，无真实资产背书。钱包需测试币；RWA 申购需管理员白名单。NAV 可能已过期，读取失败不代表有效。不会自动切换网络或发送交易。</div>
      <Hero />
      <HowItWorks />

      <div className="subbar">
        <span className="chip">Base Sepolia · testnet</span>
        <span className="dot">·</span>
        <a className="link" href={REPO} target="_blank" rel="noreferrer">GitHub ↗</a>
        <a className="link" href={`${EXPLORER}${d.morpho}`} target="_blank" rel="noreferrer">{t('subbar.contracts')}</a>
      </div>

      {!d.isDeployed && <div className="banner">{t('banner')}</div>}

      <StatsBar />

      <section className="section">
        <div className="section-title">{t('section.account')}</div>
        <div className="grid">
          <NavCard />
          <PortfolioCard />
        </div>
      </section>

      <section className="section" id="actions">
        <div className="section-title">{t('section.actions')}</div>
        <div className="grid">
          <SubscribeRedeem />
          <BorrowPanel />
        </div>
      </section>

      <VaultPanel />

      <footer className="foot">
        <p>
          {t('footer.sdk')}
          <Hint text={t('footer.sdkHint')} />
        </p>
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
