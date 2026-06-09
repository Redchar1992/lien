import { createContext, useContext, useState, type ReactNode } from 'react'

export type Lang = 'en' | 'zh'

/** Flat dictionary: key → { en, zh(繁中) }. Technical/proper nouns are left untranslated. */
export const DICT = {
  tagline: { en: 'tokenized RWA you can borrow against', zh: '可抵押借貸的代幣化真實資產' },
  'subbar.note': {
    en: 'RWA credit: subscribe → use as collateral → borrow → liquidation, all on-chain & permissioned.',
    zh: 'RWA 信貸:申購 → 作為抵押 → 借款 → 清算,全程鏈上且許可制。',
  },
  'subbar.contracts': { en: 'contracts ↗', zh: '合約 ↗' },
  banner: {
    en: 'Contracts not yet deployed. Set addresses in src/deployments.ts (filled by the deploy script).',
    zh: '合約尚未部署。在 src/deployments.ts 填入地址(部署腳本會自動填)。',
  },
  'section.account': { en: 'Your account', zh: '你的帳戶' },
  'section.actions': { en: 'Actions', zh: '操作' },
  'stats.liquidity': { en: 'Available market liquidity', zh: '可用市場流動性' },
  'stats.outstanding': { en: 'tBILL outstanding', zh: 'tBILL 流通量' },
  'stats.maxltv': { en: 'Max loan-to-value', zh: '最大抵押率' },
  'kyc.verified': { en: 'KYC verified', zh: 'KYC 已驗證' },
  'kyc.notVerified': { en: 'Not verified — request access', zh: '未驗證 — 申請准入' },
  'kyc.connect': { en: 'Connect wallet', zh: '連接錢包' },
  'kyc.hint': {
    en: 'This RWA token is permissioned (ERC-3643-style): only KYC-allowlisted addresses may hold it or subscribe. Eligibility is enforced on-chain by an IdentityRegistry, not just in the UI.',
    zh: '此 RWA 代幣為許可制(ERC-3643 式):只有通過 KYC 白名單的地址才能持有或申購。資格由鏈上 IdentityRegistry 強制,而非僅在介面層。',
  },
  'nav.label': { en: 'NAV / share', zh: 'NAV / 每股' },
  'nav.hint': {
    en: 'Net Asset Value of one tBILL share, pushed on-chain by the oracle. Yield shows up as NAV rising above $1.00 (e.g. a T-bill accruing interest).',
    zh: '每一份 tBILL 的資產淨值,由預言機上鏈。收益體現為 NAV 漲過 $1.00(例如國債計息)。',
  },
  'nav.live': { en: 'live', zh: '即時' },
  'nav.liveHint': {
    en: 'Oracle price is fresh and within its allowed deviation. If it went stale, the market would freeze (fail-safe).',
    zh: '預言機價格新鮮且在容許偏差內。若過期,市場會凍結(故障安全)。',
  },
  'nav.stale': { en: 'feed stale · market frozen', zh: '價格過期 · 市場凍結' },
  'nav.staleHint': {
    en: "The oracle hasn't updated within its staleness window (or is circuit-broken). The whole market freezes — a fail-safe, so positions are never priced off a dead feed.",
    zh: '預言機未在過期窗口內更新(或觸發熔斷)。整個市場凍結 —— 故障安全機制,避免用死掉的價格為部位定價。',
  },
  'portfolio.label': { en: 'Your RWA position', zh: '你的 RWA 部位' },
  'portfolio.hint': {
    en: 'Your tBILL balance × current NAV. tBILL is the tokenized real-world asset (e.g. a T-bill fund share).',
    zh: '你的 tBILL 餘額 × 當前 NAV。tBILL 是代幣化的真實資產(例如國債基金份額)。',
  },
  'health.noDebt': { en: 'No debt · HF ∞', zh: '無債務 · HF ∞' },
  'subredeem.label': { en: 'Subscribe / Redeem', zh: '申購 / 贖回' },
  'subredeem.hint': {
    en: 'Primary market. Subscribe: deposit USDC → mint tBILL at the current NAV. Redeem: burn tBILL → USDC at NAV, paid out after a T+N settlement delay (like a real fund — not instant).',
    zh: '一級市場。申購:存入 USDC → 按當前 NAV 鑄造 tBILL。贖回:銷毀 tBILL → 按 NAV 換回 USDC,經 T+N 結算延遲後付款(像真實基金,非即時)。',
  },
  'subredeem.usdcPh': { en: 'USDC amount', zh: 'USDC 數量' },
  'subredeem.subscribe': { en: 'Subscribe', zh: '申購' },
  'subredeem.tbillPh': { en: 'tBILL amount', zh: 'tBILL 數量' },
  'subredeem.requestRedeem': { en: 'Request redeem', zh: '申請贖回' },
  'subredeem.settlesTN': { en: '(settles T+N)', zh: '(T+N 結算)' },
  'pending.title': { en: 'Pending redemptions (T+N queue):', zh: '待領贖回(T+N 隊列):' },
  'pending.ready': { en: 'ready to claim', zh: '可領取' },
  'pending.claimableIn': { en: 'claimable in', zh: '可領取倒數' },
  'pending.claim': { en: 'Claim', zh: '領取' },
  'borrow.label': { en: 'Borrow against RWA', zh: '以 RWA 抵押借款' },
  'borrow.hint': {
    en: 'Borrow USDC against your tBILL without selling it — the protocol takes a lien on the collateral. HF (Health Factor) = LTV-weighted collateral ÷ debt. Above 1.0 is safe; below 1.0 can be liquidated. Supplying collateral raises it; borrowing lowers it.',
    zh: '用 tBILL 抵押借出 USDC,不必賣掉資產 —— 協議對抵押品取得留置權。HF(健康因子)= 加權抵押 ÷ 債務。高於 1.0 安全,低於 1.0 可被清算。增加抵押會升高,借款會降低。',
  },
  'borrow.collateral': { en: 'collateral', zh: '抵押' },
  'borrow.debt': { en: 'debt', zh: '債務' },
  'borrow.noPosition': { en: 'no position', zh: '無部位' },
  'borrow.collateralPh': { en: 'tBILL collateral', zh: 'tBILL 抵押' },
  'borrow.supply': { en: 'Supply collateral', zh: '存入抵押' },
  'borrow.borrowPh': { en: 'USDC to borrow', zh: '欲借 USDC' },
  'borrow.borrow': { en: 'Borrow', zh: '借款' },
  'footer.sdk': {
    en: 'EVM-native (viem/wagmi). The tx-lifecycle SDK is ported from the TRON sibling — same state machine + error taxonomy; TronWeb→viem is an interface swap, not a rewrite.',
    zh: 'EVM 原生(viem/wagmi)。交易生命週期 SDK 由 TRON 版移植 —— 同一套狀態機 + 錯誤碼;TronWeb→viem 是介面替換,而非重寫。',
  },
  'footer.source': { en: 'source', zh: '原始碼' },
  balance: { en: 'Balance', zh: '餘額' },
  max: { en: 'Max', zh: '最大' },
  'borrow.available': { en: 'Available to borrow', zh: '可借額度' },
}

export type I18nKey = keyof typeof DICT

interface I18nValue {
  lang: Lang
  setLang: (l: Lang) => void
  t: (key: I18nKey) => string
}

const Ctx = createContext<I18nValue | null>(null)

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    try {
      return (localStorage.getItem('lien.lang') as Lang) || 'en'
    } catch {
      return 'en'
    }
  })
  const setLang = (l: Lang) => {
    setLangState(l)
    try {
      localStorage.setItem('lien.lang', l)
    } catch {
      /* ignore */
    }
  }
  const t = (key: I18nKey) => DICT[key][lang]
  return <Ctx.Provider value={{ lang, setLang, t }}>{children}</Ctx.Provider>
}

export function useI18n(): I18nValue {
  const c = useContext(Ctx)
  if (!c) throw new Error('useI18n must be used within LangProvider')
  return c
}
