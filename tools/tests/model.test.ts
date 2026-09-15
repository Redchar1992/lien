import { test } from 'node:test'
import assert from 'node:assert/strict'
import { amount, initialState, transition as step, USD, RWA, myAssets, vaultLiquid } from '../../apps/web/src/demo/model.ts'

test('rejects overprecision, negatives, scientific notation and uint256 overflow', () => {
  for (const input of ['-1', '1e6', '1.0000001', 'Infinity', 'NaN', '1'+'0'.repeat(78)]) assert.equal(amount(input), 0n)
  assert.equal(amount('1.000001'), 1_000_001n)
})
test('KYC and stale NAV failures preserve balances', () => {
  for (const guard of ['kyc', 'stale'] as const) {
    const s = step(initialState(), { type: guard })
    const next = step(s, { type: 'subscribe', value: 100n * USD })
    assert.equal(next.error, true); assert.equal(next.usdc, s.usdc); assert.equal(next.rwa, 0n)
  }
})
test('redemption locks value, cannot claim early or twice, works with stale NAV at maturity', () => {
  let s = step(initialState(), { type: 'subscribe', value: 102n * USD })
  assert.equal(s.rwa, 100n * RWA)
  s = step(s, { type: 'redeem', value: 100n * RWA })
  assert.equal(s.requests[0].owed, 102n * USD)
  assert.equal(step(s, { type: 'claim', id: 0 }).error, true)
  s = step(step(step(s, { type: 'day' }), { type: 'day' }), { type: 'stale' })
  s = step(s, { type: 'claim', id: 0 })
  assert.equal(s.usdc, initialState().usdc)
  const twice = step(s, { type: 'claim', id: 0 })
  assert.equal(twice.error, true); assert.equal(twice.usdc, s.usdc)
})
test('vault shares round trip; cap leaves idle; low cash limits withdrawal, not book value', () => {
  let s = step(initialState(), { type: 'deposit', value: 10_000n * USD })
  assert.equal(s.myShares, 10_000n * USD); assert.equal(s.vaultAssets - s.vaultSupply, 2_000n * USD)
  s = step(s, { type: 'liquidity' })
  assert.equal(myAssets(s), 10_000n * USD); assert.equal(vaultLiquid(s), 2_000n * USD)
  assert.equal(step(s, { type: 'withdraw', value: 3_000n * USD }).error, true)
  s = step(s, { type: 'withdraw', value: 2_000n * USD })
  assert.equal(s.error, false); assert.equal(s.myShares, 8_000n * USD)
  s = step(step(s, { type: 'liquidity' }), { type: 'withdraw', value: 8_000n * USD })
  assert.equal(s.myShares, 0n); assert.equal(s.usdc, initialState().usdc)
})
test('collateral constrains borrowing; stale NAV does not stop repayment', () => {
  let s = step(initialState(), { type: 'subscribe', value: 1_020n * USD })
  s = step(s, { type: 'collateral', value: 1_000n * RWA })
  assert.equal(step(s, { type: 'borrow', value: 900n * USD }).error, true)
  s = step(s, { type: 'borrow', value: 500n * USD })
  assert.equal(s.debt, 500n * USD)
  s = step(step(s, { type: 'stale' }), { type: 'repay', value: 500n * USD })
  assert.equal(s.debt, 0n)
})
