import assert from 'node:assert/strict'
import test from 'node:test'
import {
  executeApprovedVaultDeposit,
  type TxState,
} from '../src/index'
import {
  approveVaultDepositPlan,
  createVaultDepositPlan,
  parseVaultDepositIntent,
  type AgentPolicyContext,
  type VaultDepositTarget,
} from '@lien/core'

const target: VaultDepositTarget = {
  chainId: 84532,
  vault: '0xc4ca6BbC70C429F96d19577B641fbe126a0CA93B',
  asset: '0xd11cC6B62825fFa10Cf96Dd630D2eD48263636e5',
  assetSymbol: 'USDC',
  shareSymbol: 'lienUSDC',
}
const account = '0x0000000000000000000000000000000000000001'
const plan = createVaultDepositPlan(parseVaultDepositIntent('存入 100 USDC'), target, {
  planId: 'sdk-plan-1',
  receiver: account,
  createdAt: 1_000,
})
const context: AgentPolicyContext = {
  actualChainId: 84532,
  actualAccount: account,
  allowedChainId: 84532,
  allowedVault: target.vault,
  allowedAsset: target.asset,
  maxAmountBaseUnits: 1_000n * 10n ** 6n,
  availableBalanceBaseUnits: 25_000n * 10n ** 6n,
}

test('runtime adapter blocks policy failures before touching the wallet', async () => {
  let states: TxState[] = []
  const result = await executeApprovedVaultDeposit(
    {} as never,
    {} as never,
    plan,
    { planDigest: 'not-used', account, chainId: 84532, approvedAt: 1, expiresAt: 2 },
    { ...context, maxAmountBaseUnits: 1n },
    state => { states = [...states, state] },
  )
  assert.equal(result.error?.code, 'POLICY_BLOCKED')
  assert.deepEqual(states, [result])
})

test('runtime adapter blocks a stale or mismatched approval before signing', async () => {
  const approval = await approveVaultDepositPlan(plan, { account, chainId: 84532, approvedAt: 10_000, ttlMs: 1_000 })
  const result = await executeApprovedVaultDeposit(
    {} as never,
    {} as never,
    { ...plan, amountBaseUnits: 101n * 10n ** 6n },
    approval,
    context,
  )
  assert.equal(result.error?.code, 'APPROVAL_INVALID')
})
