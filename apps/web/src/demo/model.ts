/** Deterministic teaching model. No RPC, keys, persistent balances or real yield. */
export const USD = 10n ** 6n
export const RWA = 10n ** 18n
const MAX_UINT = (1n << 256n) - 1n
export function amount(text: string, decimals = 6): bigint {
  if (!new RegExp(`^\\d+(?:\\.\\d{1,${decimals}})?$`).test(text.trim())) return 0n
  const [whole, part = ''] = text.trim().split('.')
  const value = BigInt(whole) * 10n ** BigInt(decimals) + BigInt(part.padEnd(decimals, '0'))
  return value <= MAX_UINT ? value : 0n
}
export function display(value: bigint, decimals = 6): string {
  const unit = 10n ** BigInt(decimals)
  return `${(value / unit).toLocaleString('en-US')}.${((value % unit) * 100n / unit).toString().padStart(2, '0')}`
}
export interface DemoState {
  day: number; kyc: boolean; stale: boolean; nav: bigint
  usdc: bigint; rwa: bigint; collateral: bigint; debt: bigint
  vaultAssets: bigint; vaultSupply: bigint; shares: bigint; myShares: bigint
  marketCash: bigint; stressedCash: bigint; cap: bigint
  requests: { id: number; owed: bigint; ready: number; claimed: boolean }[]
  log: string[]; message: string; error: boolean
}
export function initialState(): DemoState {
  return { day: 0, kyc: true, stale: false, nav: 102n * RWA / 100n,
    usdc: 25_000n * USD, rwa: 0n, collateral: 0n, debt: 0n,
    vaultAssets: 10_000n * USD, vaultSupply: 10_000n * USD, shares: 10_000n * USD, myShares: 0n,
    marketCash: 60_000n * USD, stressedCash: 0n, cap: 18_000n * USD,
    requests: [], log: ['D+0 · 初始化模拟账户；所有余额均为虚构。'], message: '从申购开始，或直接体验金库存取。', error: false }
}
export type Action =
  | { type: 'subscribe' | 'redeem' | 'collateral' | 'borrow' | 'repay' | 'deposit' | 'withdraw'; value: bigint }
  | { type: 'claim'; id: number }
  | { type: 'reset' | 'day' | 'kyc' | 'stale' | 'liquidity' }
const min = (a: bigint, b: bigint) => a < b ? a : b
export const vaultLiquid = (s: DemoState) => s.vaultAssets - s.vaultSupply + min(s.vaultSupply, s.marketCash)
export const myAssets = (s: DemoState) => s.myShares * (s.vaultAssets + 1n) / (s.shares + 1n)
export const borrowLimit = (s: DemoState) => s.collateral * s.nav * 86n * USD / (RWA * RWA * 100n)
export function transition(previous: DemoState, action: Action): DemoState {
  if (action.type === 'reset') return initialState()
  const s = { ...previous, requests: previous.requests.map(r => ({ ...r })), log: [...previous.log], error: false }
  const require = (ok: boolean, message: string) => { if (!ok) throw new Error(message) }
  let message = ''
  try {
    if ('value' in action) require(action.value > 0n && action.value <= MAX_UINT, '请输入有效正数，USDC 最多 6 位小数，tBILL 最多 18 位。')
    switch (action.type) {
      case 'kyc': s.kyc = !s.kyc; message = `模拟 KYC：${s.kyc ? '已验证' : '未验证'}（仅演示权限，不是真实身份审核）`; break
      case 'stale': s.stale = !s.stale; message = `模拟 NAV：${s.stale ? '过期，申购 / 赎回申请 / 借款被阻止' : '恢复有效'}`; break
      case 'day': s.day++; message = '模拟时钟推进 1 天；不产生真实收益，不改变测试网时间。'; break
      case 'liquidity':
        if (s.stressedCash > 0n) { s.marketCash += s.stressedCash; s.stressedCash = 0n; message = '模拟外部借款归还，流动性恢复。' }
        else { s.stressedCash = s.marketCash; s.marketCash = 0n; message = '模拟外部借款耗尽市场现金；金库只能提取闲置余额。' }
        break
      case 'subscribe': {
        require(s.kyc, 'KYC 拒绝：未验证账户不能接收 tBILL。')
        require(!s.stale, 'NAV 已过期：拒绝申购，不能使用旧价格。')
        require(s.usdc >= action.value, 'USDC 余额不足。')
        const out = action.value * RWA * RWA / (USD * s.nav)
        require(out > 0n, '金额低于最小可铸造单位。')
        s.usdc -= action.value; s.rwa += out
        message = `申购完成：${display(action.value)} USDC → ${display(out, 18)} tBILL。`; break
      }
      case 'redeem': {
        require(!s.stale, 'NAV 已过期：拒绝赎回申请；既有到期申请仍可领取。')
        require(s.rwa >= action.value, 'tBILL 余额不足。')
        const owed = action.value * s.nav * USD / (RWA * RWA)
        require(owed > 0n, '金额低于最小结算单位。')
        s.rwa -= action.value
        s.requests.push({ id: s.requests.length, owed, ready: s.day + 2, claimed: false })
        message = `赎回申请已锁定 ${display(owed)} USDC，D+${s.day + 2} 可领取。`; break
      }
      case 'claim': {
        const r = s.requests.find(r => r.id === action.id)
        require(Boolean(r), '赎回申请不存在。')
        require(!r!.claimed, '该申请已领取，禁止重复领取。')
        require(s.day >= r!.ready, 'T+2 尚未到期，不能提前领取。')
        r!.claimed = true; s.usdc += r!.owed
        message = `领取完成：${display(r!.owed)} USDC；同一申请不能重复领取。`; break
      }
      case 'collateral':
        require(s.kyc, 'KYC 拒绝：不能转移受限抵押品。'); require(s.rwa >= action.value, 'tBILL 余额不足。')
        s.rwa -= action.value; s.collateral += action.value; message = 'tBILL 已转入模拟抵押仓位。'; break
      case 'borrow':
        require(!s.stale, 'NAV 已过期：拒绝借款，偿还仍可进行。')
        require(s.debt + action.value <= borrowLimit(s), '抵押不足：借款将超过 86% LLTV。')
        require(s.marketCash >= action.value, '市场流动性不足。')
        s.debt += action.value; s.usdc += action.value; s.marketCash -= action.value; message = '借款完成；模拟不自动计息，请观察健康因子。'; break
      case 'repay':
        require(action.value <= s.debt, '还款超过当前债务。'); require(action.value <= s.usdc, 'USDC 余额不足。')
        s.debt -= action.value; s.usdc -= action.value; s.marketCash += action.value; message = '债务已减少；偿还不依赖有效 NAV。'; break
      case 'deposit': {
        require(action.value <= s.usdc, 'USDC 余额不足。')
        const minted = action.value * (s.shares + 1n) / (s.vaultAssets + 1n)
        require(minted > 0n, '金额低于最小份额。')
        const allocated = min(action.value, s.cap > s.vaultSupply ? s.cap - s.vaultSupply : 0n)
        s.usdc -= action.value; s.vaultAssets += action.value; s.shares += minted; s.myShares += minted
        s.vaultSupply += allocated; s.marketCash += allocated
        message = `存入成功：获得 ${display(minted)} lienUSDC；超出市场 cap 的资金留在金库。`; break
      }
      case 'withdraw': {
        require(action.value <= myAssets(s), '超过所持份额对应的资产。')
        require(action.value <= vaultLiquid(s), '流动性不足：账面资产不等于当前可提金额。')
        const burned = (action.value * (s.shares + 1n) + s.vaultAssets) / (s.vaultAssets + 1n)
        const idle = s.vaultAssets - s.vaultSupply
        const pulled = action.value > idle ? action.value - idle : 0n
        s.vaultSupply -= pulled; s.marketCash -= pulled; s.vaultAssets -= action.value
        s.shares -= burned; s.myShares -= burned; s.usdc += action.value
        message = `提取成功：到账 ${display(action.value)} USDC，份额已销毁。`; break
      }
    }
    s.message = message
    s.log = [`D+${s.day} · ${message}`, ...s.log].slice(0, 30)
    return s
  } catch (error) {
    // Failed actions are atomic: never retain partial mutations.
    const message = (error as Error).message
    return { ...previous, error: true, message, log: [`D+${previous.day} · 拒绝 · ${message}`, ...previous.log].slice(0, 30) }
  }
}
