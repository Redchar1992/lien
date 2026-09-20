/**
 * Controlled vault-agent domain model.
 *
 * The model may propose a plan, but it never receives a signer and never
 * decides whether the plan is allowed. Policy evaluation and approval binding
 * stay deterministic and outside the model/runtime adapter.
 */

export type AgentOperation = 'vault_deposit'

export interface AgentIntent {
  operation: AgentOperation
  amountBaseUnits: bigint
  assetSymbol: string
  rawText: string
}

export interface VaultDepositTarget {
  chainId: number
  vault: string
  asset: string
  assetSymbol: string
  shareSymbol: string
}

export interface VaultDepositPlan {
  schemaVersion: 'lien.agent.vault-deposit.v1'
  planId: string
  operation: AgentOperation
  rawRequest: string
  chainId: number
  vault: string
  asset: string
  receiver: string
  assetSymbol: string
  shareSymbol: string
  amountBaseUnits: bigint
  method: 'deposit(uint256,address)'
  simulationOnly: boolean
  createdAt: number
}

export interface AgentPolicyContext {
  actualChainId: number
  actualAccount: string
  allowedChainId: number
  allowedVault: string
  allowedAsset: string
  maxAmountBaseUnits: bigint
  maxAmountLabel?: string
  availableBalanceBaseUnits: bigint
}

export interface AgentPolicyCheck {
  id: string
  label: string
  passed: boolean
  blocking: boolean
  detail: string
}

export interface AgentPolicyResult {
  passed: boolean
  checks: AgentPolicyCheck[]
  evaluatedAt: number
}

export interface AgentApproval {
  planDigest: string
  account: string
  chainId: number
  approvedAt: number
  expiresAt: number
}

export type AgentArtifactKind = 'intent' | 'plan' | 'policy' | 'approval' | 'execution'

export interface AgentArtifact {
  id: string
  kind: AgentArtifactKind
  summary: string
  payload: string
  createdAt: number
}

export type AgentSessionStatus = 'ready' | 'blocked' | 'awaiting_approval' | 'approved' | 'executed'

export interface AgentSession {
  id: string
  createdAt: number
  status: AgentSessionStatus
  artifacts: AgentArtifact[]
}

const MAX_UINT = (1n << 256n) - 1n

function sameAddress(left: string, right: string): boolean {
  return left.trim().toLowerCase() === right.trim().toLowerCase()
}

/** Parse a human decimal amount without floating point rounding. */
export function parseUnitsDecimal(value: string, decimals: number): bigint {
  const trimmed = value.trim()
  const pattern = new RegExp(`^\\d+(?:\\.\\d{1,${decimals}})?$`)
  if (!pattern.test(trimmed)) throw new Error(`金额格式无效：最多 ${decimals} 位小数。`)
  const [whole, fraction = ''] = trimmed.split('.')
  const result = BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, '0'))
  if (result > MAX_UINT) throw new Error('金额超出 uint256 范围。')
  return result
}

/**
 * Deliberately narrow local intent parser. It is a demo seam for a real model:
 * the parser can propose only a vault deposit, never arbitrary calldata.
 */
export function parseVaultDepositIntent(rawText: string, decimals = 6): AgentIntent {
  const raw = rawText.trim()
  if (!raw || !/(存入|投入|金库|deposit|vault)/i.test(raw)) {
    throw new Error('当前 Agent 只支持“把 USDC 存入指定金库”。')
  }
  const amountMatch = raw.match(/\d+(?:\.\d+)?/)
  if (!amountMatch) throw new Error('没有识别到 USDC 金额。')
  return {
    operation: 'vault_deposit',
    amountBaseUnits: parseUnitsDecimal(amountMatch[0], decimals),
    assetSymbol: 'USDC',
    rawText: raw,
  }
}

export function createVaultDepositPlan(
  intent: AgentIntent,
  target: VaultDepositTarget,
  options: { planId: string; receiver: string; createdAt?: number; simulationOnly?: boolean },
): VaultDepositPlan {
  if (intent.operation !== 'vault_deposit') throw new Error('不支持的 Agent 操作。')
  return {
    schemaVersion: 'lien.agent.vault-deposit.v1',
    planId: options.planId,
    operation: intent.operation,
    rawRequest: intent.rawText,
    chainId: target.chainId,
    vault: target.vault,
    asset: target.asset,
    receiver: options.receiver,
    assetSymbol: target.assetSymbol,
    shareSymbol: target.shareSymbol,
    amountBaseUnits: intent.amountBaseUnits,
    method: 'deposit(uint256,address)',
    simulationOnly: options.simulationOnly ?? true,
    createdAt: options.createdAt ?? Date.now(),
  }
}

export function evaluateVaultDepositPolicy(
  plan: VaultDepositPlan,
  context: AgentPolicyContext,
  evaluatedAt = Date.now(),
): AgentPolicyResult {
  const checks: AgentPolicyCheck[] = [
    {
      id: 'operation-allowlist',
      label: '操作在白名单内',
      passed: plan.operation === 'vault_deposit' && plan.method === 'deposit(uint256,address)',
      blocking: true,
      detail: '只允许调用预定义的 ERC-4626 deposit 方法。',
    },
    {
      id: 'chain-binding',
      label: '网络绑定',
      passed: plan.chainId === context.allowedChainId && context.actualChainId === plan.chainId,
      blocking: true,
      detail: `计划网络 ${plan.chainId}，当前网络 ${context.actualChainId}。`,
    },
    {
      id: 'target-binding',
      label: '金库地址白名单',
      passed: sameAddress(plan.vault, context.allowedVault),
      blocking: true,
      detail: '不允许 Agent 将目标替换成任意合约。',
    },
    {
      id: 'asset-binding',
      label: '资产地址绑定',
      passed: sameAddress(plan.asset, context.allowedAsset),
      blocking: true,
      detail: '只允许使用策略配置的 USDC。',
    },
    {
      id: 'account-binding',
      label: '接收账户绑定',
      passed: sameAddress(plan.receiver, context.actualAccount),
      blocking: true,
      detail: '计划必须绑定当前账户，账户切换后需要重新生成计划。',
    },
    {
      id: 'amount-positive',
      label: '金额为正数',
      passed: plan.amountBaseUnits > 0n,
      blocking: true,
      detail: '拒绝零金额或负数金额。',
    },
    {
      id: 'amount-limit',
      label: '金额未超过 Agent 上限',
      passed: plan.amountBaseUnits <= context.maxAmountBaseUnits,
      blocking: true,
      detail: `单次上限 ${context.maxAmountLabel ?? `${context.maxAmountBaseUnits.toString()} base units`}。`,
    },
    {
      id: 'balance-check',
      label: '余额足够',
      passed: plan.amountBaseUnits <= context.availableBalanceBaseUnits,
      blocking: true,
      detail: '余额检查在批准和执行前都必须重新进行。',
    },
  ]
  return { passed: checks.every(check => !check.blocking || check.passed), checks, evaluatedAt }
}

/** Stable, explicit serialization prevents BigInt and key-order ambiguity. */
export function serializeVaultDepositPlan(plan: VaultDepositPlan): string {
  return JSON.stringify({
    schemaVersion: plan.schemaVersion,
    planId: plan.planId,
    operation: plan.operation,
    rawRequest: plan.rawRequest,
    chainId: plan.chainId,
    vault: plan.vault.toLowerCase(),
    asset: plan.asset.toLowerCase(),
    receiver: plan.receiver.toLowerCase(),
    assetSymbol: plan.assetSymbol,
    shareSymbol: plan.shareSymbol,
    amountBaseUnits: plan.amountBaseUnits.toString(),
    method: plan.method,
    simulationOnly: plan.simulationOnly,
    createdAt: plan.createdAt,
  })
}

/** Bind approval to the exact plan; the digest is never model supplied. */
export async function digestVaultDepositPlan(plan: VaultDepositPlan): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error('当前环境不支持 Web Crypto，无法绑定审批。')
  const bytes = new TextEncoder().encode(serializeVaultDepositPlan(plan))
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes)
  const hex = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
  return `sha256:${hex}`
}

export async function approveVaultDepositPlan(
  plan: VaultDepositPlan,
  input: { account: string; chainId: number; approvedAt?: number; ttlMs?: number },
): Promise<AgentApproval> {
  const approvedAt = input.approvedAt ?? Date.now()
  return {
    planDigest: await digestVaultDepositPlan(plan),
    account: input.account,
    chainId: input.chainId,
    approvedAt,
    expiresAt: approvedAt + (input.ttlMs ?? 5 * 60 * 1000),
  }
}

export async function isVaultDepositApprovalValid(
  plan: VaultDepositPlan,
  approval: AgentApproval,
  context: Pick<AgentPolicyContext, 'actualAccount' | 'actualChainId'>,
  now = Date.now(),
): Promise<boolean> {
  return approval.planDigest === await digestVaultDepositPlan(plan) &&
    sameAddress(approval.account, context.actualAccount) &&
    approval.chainId === context.actualChainId &&
    approval.approvedAt <= now &&
    now < approval.expiresAt
}

export function createAgentSession(id = `session-${Date.now()}`, createdAt = Date.now()): AgentSession {
  return { id, createdAt, status: 'ready', artifacts: [] }
}

export function addAgentArtifact(
  session: AgentSession,
  artifact: Omit<AgentArtifact, 'id'>,
): AgentSession {
  return {
    ...session,
    artifacts: [...session.artifacts, { ...artifact, id: `${session.id}-artifact-${session.artifacts.length + 1}` }],
  }
}

export function withAgentSessionStatus(session: AgentSession, status: AgentSessionStatus): AgentSession {
  return { ...session, status }
}
