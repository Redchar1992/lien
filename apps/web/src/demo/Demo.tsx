import { useReducer, useState } from 'react'
import { amount, display, initialState, transition, myAssets, vaultLiquid, borrowLimit, type Action } from './model'

function AmountRow({ label, unit = 'USDC', button, onSubmit }: { label: string; unit?: string; button: string; onSubmit: (value: bigint) => void }) {
  const [value, setValue] = useState('')
  return <form className="demo-form" onSubmit={e => { e.preventDefault(); onSubmit(amount(value, unit === 'tBILL' ? 18 : 6)) }}>
    <label>{label}<span className="row"><input aria-label={label} inputMode="decimal" placeholder={`0.00 ${unit}`} value={value} onChange={e => setValue(e.target.value)} /><button>{button}</button></span></label>
  </form>
}
export function Demo() {
  const [s, dispatch] = useReducer(transition, undefined, initialState)
  const act = (type: 'subscribe' | 'redeem' | 'collateral' | 'borrow' | 'repay' | 'deposit' | 'withdraw') => (value: bigint) => dispatch({ type, value } as Action)
  const maximum = myAssets(s) < vaultLiquid(s) ? myAssets(s) : vaultLiquid(s)
  return <main className="app demo">
    <header className="topbar"><div className="brand"><span className="logo">lien</span><span className="tagline">RWA 信贷 · 技术实践</span></div><a className="link" href="https://github.com/Redchar1992/lien">查看源码 ↗</a></header>
    <div className="demo-hero"><div><span className="eyebrow">PERMISSIONED ASSETS. COMPOSABLE CREDIT.</span><h1>看见资产背后的<br /><em>规则与资金流。</em></h1><p>从 NAV 申购、抵押借款到 T+2 赎回，<br />再到 ERC-4626 金库的份额与流动性。</p><a className="cta" href="#demo-subscribe">开始体验 ↓</a></div><div className="flow-map" aria-label="资产流向"><div>USDC <small>模拟资金</small></div><span>↓ NAV 定价 / 身份限制</span><div>tBILL <small>受限代币</small></div><span>↙ T+2 赎回　　抵押借款 ↘</span><div>USDC <small>借款 / 领取</small></div></div></div>
    <div className="banner demo-disclaimer"><strong>模拟模式 · 无需钱包</strong><br />所有余额、身份、NAV 与时间均为虚构，只保存在当前页面内存；刷新或切换模式会重置。无真实资产背书，不产生链上交易或真实收益，不构成投资建议。</div>
    <section className="stats" aria-label="模拟账户概览">
      <div className="stat"><div className="stat-label">可用 USDC · 模拟</div><div className="stat-value" data-testid="usdc-balance">{display(s.usdc)}</div></div>
      <div className="stat"><div className="stat-label">持有 tBILL · 模拟</div><div className="stat-value">{display(s.rwa, 18)}</div></div>
      <div className="stat"><div className="stat-label">NAV / 份 · 模拟固定值</div><div className="stat-value">$1.02 <span className={`badge ${s.stale ? 'danger' : 'ok'}`}>{s.stale ? '已过期' : '有效'}</span></div></div>
    </section>
    <section className="card scenario"><div><h2>风险控制台</h2><p className="sub">先做一次正常操作，再切换异常场景。每次拒绝都有明确原因。</p></div><div className="scenario-buttons">
      <button className="secondary" aria-pressed={!s.kyc} onClick={() => dispatch({ type: 'kyc' })}>KYC：{s.kyc ? '已验证' : '未验证'}</button>
      <button className="secondary" aria-pressed={s.stale} onClick={() => dispatch({ type: 'stale' })}>NAV：{s.stale ? '过期' : '有效'}</button>
      <button className="secondary" aria-pressed={s.stressedCash > 0n} onClick={() => dispatch({ type: 'liquidity' })}>{s.stressedCash > 0n ? '恢复流动性' : '耗尽市场流动性'}</button>
      <button className="secondary" onClick={() => dispatch({ type: 'day' })}>推进 1 天 · D+{s.day}</button>
      <button className="secondary" onClick={() => dispatch({ type: 'reset' })}>重置演示</button>
    </div></section>
    <div className={`demo-feedback ${s.error ? 'error' : ''}`} role="status" aria-live="polite">{s.error ? '↳ 已阻止' : '✓ 模拟反馈'} · {s.message}</div>
    <div className="grid section">
      <section className="card" id="demo-subscribe"><span className="eyebrow">01 / PRIMARY MARKET</span><h2>申购与到期赎回</h2><p className="sub">6 位 USDC ↔ 18 位 tBILL；申请时锁定 NAV。</p>
        <AmountRow label="申购金额" button="申购 tBILL" onSubmit={act('subscribe')} />
        <AmountRow label="赎回数量" unit="tBILL" button="申请赎回" onSubmit={act('redeem')} />
        <div className="pending"><h3>赎回队列 · T+2</h3>{s.requests.length === 0 && <p className="sub">暂无申请。先申购，再发起赎回。</p>}
        {s.requests.map(r => <div className="redemption" key={r.id}><span>#{r.id} · {display(r.owed)} USDC<br /><small>{r.claimed ? '已领取' : `D+${r.ready} 到期`}</small></span><button disabled={r.claimed || s.day < r.ready} onClick={() => dispatch({ type: 'claim', id: r.id })}>{r.claimed ? '已领取' : '领取'}</button></div>)}</div>
      </section>
      <section className="card"><span className="eyebrow">02 / ISOLATED CREDIT</span><h2>抵押借款</h2><p className="sub">复用隔离借贷的约束；LLTV 86%，不模拟计息或清算。</p>
        <div className="metrics"><span>抵押品<strong>{display(s.collateral, 18)} tBILL</strong></span><span>债务<strong>{display(s.debt)} USDC</strong></span><span>健康因子<strong>{s.debt > 0n ? `${borrowLimit(s) * 100n / s.debt / 100n}.${(borrowLimit(s) * 100n / s.debt % 100n).toString().padStart(2, '0')}` : '— 无债务'}</strong></span></div>
        <AmountRow label="添加抵押品" unit="tBILL" button="存入抵押品" onSubmit={act('collateral')} />
        <AmountRow label="借款金额" button="借款" onSubmit={act('borrow')} />
        <AmountRow label="还款金额" button="还款" onSubmit={act('repay')} />
      </section>
    </div>
    <section className="card vault-demo section"><div><span className="eyebrow">03 / ERC-4626 VAULT</span><h2>USDC 策略金库</h2><p className="sub">份额是资产请求权，不是随时可提承诺。演示只配置一个市场，不宣称已分散风险。</p></div>
      <div className="metrics"><span>金库总资产<strong>{display(s.vaultAssets)} USDC</strong></span><span>我的份额<strong data-testid="vault-shares">{display(s.myShares)} lienUSDC</strong></span><span>当前可提<strong data-testid="vault-available">{display(maximum)} USDC</strong></span><span>市场 cap / 闲置<strong>{display(s.cap)} / {display(s.vaultAssets - s.vaultSupply)}</strong></span></div>
      <div className="grid"><AmountRow label="金库存入金额" button="存入金库" onSubmit={act('deposit')} /><AmountRow label="金库提取金额" button="提取 USDC" onSubmit={act('withdraw')} /></div>
      <p className="sub">存入按份额比例向下取整；提取所需份额向上取整。超出 cap 的资金留存；市场借出后，账面资产与可用现金分开显示。</p>
    </section>
    <section className="card section"><h2>可解释的操作记录</h2><p className="sub">仅为当前页面的模拟日志，不是链上审计证据。最多保留 30 条。</p><ol className="activity">{s.log.map((line, i) => <li key={`${i}-${line}`}>{line}</li>)}</ol></section>
    <footer className="foot"><strong>信任边界是产品的一部分。</strong><p>白名单不等于法律合规；NAV 不证明底层资产真实存在；金库不保证收益或即时退出。测试网模式使用 mock USDC / tBILL，也不代表真实证券。</p><div className="foot-links"><a href="https://github.com/Redchar1992/lien/blob/main/docs/architecture-and-risks.md">架构与风险边界 ↗</a><a href="https://github.com/Redchar1992/lien/blob/main/docs/demo-runbook.md">演示与验证指南 ↗</a></div></footer>
  </main>
}
