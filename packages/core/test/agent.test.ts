import assert from 'node:assert/strict'
import test from 'node:test'
import {
  addAgentArtifact,
  approveVaultDepositPlan,
  createAgentSession,
  createVaultDepositPlan,
  digestVaultDepositPlan,
  evaluateVaultDepositPolicy,
  isVaultDepositApprovalValid,
  parseVaultDepositIntent,
  type AgentPolicyContext,
  type VaultDepositTarget,
} from '../src/agent'

const target: VaultDepositTarget = {
  chainId: 84532,
  vault: '0xc4ca6BbC70C429F96d19577B641fbe126a0CA93B',
  asset: '0xd11cC6B62825fFa10Cf96Dd630D2eD48263636e5',
  assetSymbol: 'USDC',
  shareSymbol: 'lienUSDC',
}
const account = '0x0000000000000000000000000000000000000001'
const context: AgentPolicyContext = {
  actualChainId: 84532,
  actualAccount: account,
  allowedChainId: 84532,
  allowedVault: target.vault,
  allowedAsset: target.asset,
  maxAmountBaseUnits: 1_000n * 10n ** 6n,
  availableBalanceBaseUnits: 25_000n * 10n ** 6n,
}

function planFor(text = '帮我把 100 USDC 存入金库') {
  return createVaultDepositPlan(parseVaultDepositIntent(text), target, {
    planId: 'plan-test-1',
    receiver: account,
    createdAt: 1_000,
  })
}

test('parses an exact decimal amount without floating point rounding', () => {
  assert.equal(parseVaultDepositIntent('请存入 12.345678 USDC').amountBaseUnits, 12_345_678n)
  assert.throws(() => parseVaultDepositIntent('把 1.1234567 USDC 存入金库'))
  assert.throws(() => parseVaultDepositIntent('查看我的余额'))
})

test('allows only a bounded, target-bound deposit plan', () => {
  const result = evaluateVaultDepositPolicy(planFor(), context, 2_000)
  assert.equal(result.passed, true)
  assert.equal(result.checks.every(check => check.passed), true)
})

test('blocks amount, chain, target, account, and balance violations', () => {
  assert.equal(evaluateVaultDepositPolicy(planFor('存入 1001 USDC'), context).passed, false)
  assert.equal(evaluateVaultDepositPolicy(planFor(), { ...context, actualChainId: 11155111 }).passed, false)
  assert.equal(evaluateVaultDepositPolicy(planFor(), { ...context, allowedVault: '0x0000000000000000000000000000000000000002' }).passed, false)
  assert.equal(evaluateVaultDepositPolicy(planFor(), { ...context, actualAccount: '0x0000000000000000000000000000000000000003' }).passed, false)
  assert.equal(evaluateVaultDepositPolicy(planFor(), { ...context, availableBalanceBaseUnits: 99n * 10n ** 6n }).passed, false)
})

test('approval is bound to the exact plan, account, chain, and expiry', async () => {
  const plan = planFor()
  const approval = await approveVaultDepositPlan(plan, { account, chainId: 84532, approvedAt: 10_000, ttlMs: 1_000 })
  assert.equal(await isVaultDepositApprovalValid(plan, approval, { actualAccount: account, actualChainId: 84532 }, 10_500), true)
  assert.equal(await isVaultDepositApprovalValid(plan, approval, { actualAccount: account, actualChainId: 84532 }, 11_000), false)
  assert.equal(await isVaultDepositApprovalValid(plan, approval, { actualAccount: account, actualChainId: 11155111 }, 10_500), false)
  assert.equal(await isVaultDepositApprovalValid({ ...plan, amountBaseUnits: 101n * 10n ** 6n }, approval, { actualAccount: account, actualChainId: 84532 }, 10_500), false)
})

test('session artifacts are append-only and retain the audit sequence', () => {
  const session = createAgentSession('session-test', 1)
  const withPlan = addAgentArtifact(session, { kind: 'plan', summary: '生成存款计划', payload: '{}', createdAt: 2 })
  const withApproval = addAgentArtifact(withPlan, { kind: 'approval', summary: '绑定精确审批', payload: '{}', createdAt: 3 })
  assert.deepEqual(withApproval.artifacts.map(artifact => artifact.id), [
    'session-test-artifact-1',
    'session-test-artifact-2',
  ])
  assert.equal(withApproval.artifacts[0].kind, 'plan')
})

test('plan digest changes when an execution parameter changes', async () => {
  const first = await digestVaultDepositPlan(planFor())
  const second = await digestVaultDepositPlan(planFor('存入 101 USDC'))
  assert.notEqual(first, second)
})
