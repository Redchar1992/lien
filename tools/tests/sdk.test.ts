import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sendWrite, decodeTxError, type TxState } from '../../packages/sdk/src/index.ts'
import type { PublicClient, WalletClient } from 'viem'
const account = { address: '0x1111111111111111111111111111111111111111' }
const hash = `0x${'ab'.repeat(32)}`
const req = { address: account.address, abi: [], functionName: 'deposit', args: [] } as any
function clients() {
  const calls: string[] = []
  const pub = { chain: { id: 84532 }, getBlockNumber: async () => 100n, estimateContractGas: async () => 200_000n, simulateContract: async () => { calls.push('simulate'); return { request: {} } }, waitForTransactionReceipt: async () => ({ status: 'success', transactionHash: hash }) }
  const wallet = { account, getChainId: async () => 84532, getAddresses: async () => [account.address], writeContract: async () => { calls.push('write'); return hash } }
  return { pub, wallet, calls, run: (onState?: (s: TxState) => void) => sendWrite(pub as any as PublicClient, wallet as any as WalletClient, req, onState) }
}
test('SDK verifies chain before simulation or signature', async () => {
  const c = clients(); c.wallet.getChainId = async () => 1
  const r = await c.run(); assert.equal(r.error?.code, 'WRONG_NETWORK'); assert.deepEqual(c.calls, [])
})
test('SDK verifies current account before simulation', async () => {
  const c = clients(); c.wallet.getAddresses = async () => ['0x2222222222222222222222222222222222222222']
  assert.equal((await c.run()).error?.code, 'ACCOUNT_CHANGED'); assert.deepEqual(c.calls, [])
})
test('SDK exposes the ordered confirmed lifecycle', async () => {
  const c = clients(); const states: string[] = []
  assert.equal((await c.run(s => states.push(s.status))).hash, hash)
  assert.deepEqual(states, ['building', 'signing', 'pending', 'confirmed'])
})
test('wallet rejection stops before receipt wait', async () => {
  const c = clients(); c.wallet.writeContract = async () => { throw new Error('User rejected the request') }
  const r = await c.run(); assert.equal(r.status, 'failed'); assert.equal(r.error?.code, 'USER_REJECTED'); assert.equal(r.hash, undefined)
})
test('post-broadcast timeout retains hash and reports unknown rather than failed', async () => {
  const c = clients(); c.pub.waitForTransactionReceipt = async () => { throw new Error('Network timeout') }
  const r = await c.run(); assert.equal(r.status, 'unknown'); assert.equal(r.hash, hash); assert.match(r.error!.message, /勿重复提交/)
})
test('reverted receipt is an actual failed transaction with hash', async () => {
  const c = clients(); c.pub.waitForTransactionReceipt = async () => ({ status: 'reverted', transactionHash: hash })
  const r = await c.run(); assert.equal(r.status, 'failed'); assert.equal(r.hash, hash)
})
test('SDK distinguishes protocol and transport errors', () => {
  for (const [message, code] of [['RWA: recipient not verified', 'NOT_KYC'], ['NAV: stale', 'NAV_STALE'], ['insufficient liquidity', 'INSUFFICIENT_LIQUIDITY'], ['Failed to fetch', 'NETWORK']]) assert.equal(decodeTxError(new Error(message)).code, code)
})

test('repriced replacement reports the actual mined hash', async () => {
  const c = clients(); const replacementHash = `0x${'cd'.repeat(32)}`
  c.pub.waitForTransactionReceipt = async (options: any) => {
    options.onReplaced({ reason: 'repriced', transaction: { hash: replacementHash } })
    return { status: 'success', transactionHash: replacementHash }
  }
  const r = await c.run(); assert.equal(r.status, 'confirmed'); assert.equal(r.hash, replacementHash)
})
test('cancelled or altered transaction is not reported as the original action succeeding', async () => {
  for (const reason of ['cancelled', 'replaced']) {
    const c = clients()
    c.pub.waitForTransactionReceipt = async (options: any) => {
      options.onReplaced({ reason, transaction: { hash } })
      return { status: 'success', transactionHash: hash }
    }
    assert.equal((await c.run()).status, 'failed')
  }
})

test('preflight is anchored at or after the approval block even if RPC head lags', async () => {
  const c = clients(); let observed: bigint | undefined
  c.pub.simulateContract = async (options: any) => { observed = options.blockNumber; return { request: {} } }
  await sendWrite(c.pub as any, c.wallet as any, { ...req, minimumBlock: 105n })
  assert.equal(observed, 105n)
})


test('wallet receives buffered gas rather than a brittle exact estimate', async () => {
  const c = clients(); let gas: bigint | undefined
  c.wallet.writeContract = async (request: any) => { gas = request.gas; return hash }
  assert.equal((await c.run()).status, 'confirmed')
  assert.equal(gas, 310_000n)
})
