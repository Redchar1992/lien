import { useState } from 'react'
import {
  addAgentArtifact,
  approveVaultDepositPlan,
  createAgentSession,
  createVaultDepositPlan,
  evaluateVaultDepositPolicy,
  isVaultDepositApprovalValid,
  parseVaultDepositIntent,
  serializeVaultDepositPlan,
  withAgentSessionStatus,
  type AgentApproval,
  type AgentPolicyResult,
  type AgentSession,
  type VaultDepositPlan,
} from '@lien/core'
import { deployment } from '../deployments'
import { display, type DemoState } from './model'

const DEMO_ACCOUNT = '0x0000000000000000000000000000000000000001'
const MAX_DEPOSIT = 1_000n * 10n ** 6n
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

function short(value: string): string {
  return value.length > 18 ? `${value.slice(0, 10)}…${value.slice(-6)}` : value
}

function timeLabel(value: number): string {
  return new Date(value).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Agent 请求无法处理。'
}

interface AgentConsoleProps {
  state: DemoState
  onExecuteDeposit: (value: bigint) => void
}

/**
 * Wallet-free interview demo for the controlled-agent boundary. The local
 * parser stands in for a real model; no model output is allowed to call a signer.
 */
export function AgentConsole({ state, onExecuteDeposit }: AgentConsoleProps) {
  const [request, setRequest] = useState('帮我把 100 USDC 存入指定金库')
  const [session, setSession] = useState<AgentSession>(() => createAgentSession(`demo-${Date.now()}`))
  const [plan, setPlan] = useState<VaultDepositPlan | null>(null)
  const [policy, setPolicy] = useState<AgentPolicyResult | null>(null)
  const [approval, setApproval] = useState<AgentApproval | null>(null)
  const [notice, setNotice] = useState('输入一个业务请求，Agent 只会生成受控的金库存款计划。')
  const [executed, setExecuted] = useState(false)
  const target = {
    chainId: deployment.chainId,
    vault: deployment.vault ?? ZERO_ADDRESS,
    asset: deployment.usdc,
    assetSymbol: 'USDC',
    shareSymbol: 'lienUSDC',
  }

  const context = () => ({
    actualChainId: deployment.chainId,
    actualAccount: DEMO_ACCOUNT,
    allowedChainId: deployment.chainId,
    allowedVault: target.vault,
    allowedAsset: target.asset,
    maxAmountBaseUnits: MAX_DEPOSIT,
    maxAmountLabel: '1,000 USDC',
    availableBalanceBaseUnits: state.usdc,
  })

  const record = (
    current: AgentSession,
    kind: 'intent' | 'plan' | 'policy' | 'approval' | 'execution',
    summary: string,
    payload: string,
    createdAt = Date.now(),
  ) => addAgentArtifact(current, { kind, summary, payload, createdAt })

  const handlePlan = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    try {
      const intent = parseVaultDepositIntent(request)
      const nextPlan = createVaultDepositPlan(intent, target, {
        planId: `${session.id}-plan-${session.artifacts.length + 1}`,
        receiver: DEMO_ACCOUNT,
        simulationOnly: true,
      })
      const nextPolicy = evaluateVaultDepositPolicy(nextPlan, context())
      let nextSession = record(session, 'intent', '解析用户意图', JSON.stringify({
        operation: intent.operation,
        amountBaseUnits: intent.amountBaseUnits.toString(),
        asset: intent.assetSymbol,
        rawText: intent.rawText,
      }))
      nextSession = record(nextSession, 'plan', '生成结构化存款计划', serializeVaultDepositPlan(nextPlan))
      nextSession = record(nextSession, 'policy', nextPolicy.passed ? '策略检查通过，等待人工审批' : '策略检查阻止执行', JSON.stringify(nextPolicy))
      setSession(withAgentSessionStatus(nextSession, nextPolicy.passed ? 'awaiting_approval' : 'blocked'))
      setPlan(nextPlan)
      setPolicy(nextPolicy)
      setApproval(null)
      setExecuted(false)
      setNotice(nextPolicy.passed ? '计划已生成。模型不能执行，请先批准这份精确计划。' : '计划被模型外策略阻止，不能进入审批。')
    } catch (error) {
      setPlan(null)
      setPolicy(null)
      setApproval(null)
      setExecuted(false)
      setNotice(errorMessage(error))
    }
  }

  const handleApprove = async () => {
    if (!plan || !policy?.passed) return
    const freshPolicy = evaluateVaultDepositPolicy(plan, context())
    setPolicy(freshPolicy)
    if (!freshPolicy.passed) {
      setApproval(null)
      setSession(current => withAgentSessionStatus(current, 'blocked'))
      setNotice('批准前重新检查失败：余额、账户或网络状态已经变化。')
      return
    }
    try {
      const nextApproval = await approveVaultDepositPlan(plan, {
        account: DEMO_ACCOUNT,
        chainId: deployment.chainId,
        ttlMs: 5 * 60 * 1000,
      })
      const nextSession = record(session, 'approval', '人工批准精确计划（5 分钟有效）', JSON.stringify(nextApproval))
      setApproval(nextApproval)
      setSession(withAgentSessionStatus(nextSession, 'approved'))
      setNotice('审批已绑定到计划指纹、账户和网络；修改任一参数都必须重新审批。')
    } catch (error) {
      setNotice(errorMessage(error))
    }
  }

  const handleExecute = async () => {
    if (!plan || !approval || executed) return
    const freshPolicy = evaluateVaultDepositPolicy(plan, context())
    setPolicy(freshPolicy)
    if (!freshPolicy.passed) {
      setApproval(null)
      setSession(current => withAgentSessionStatus(current, 'blocked'))
      setNotice('执行前策略检查失败，系统拒绝使用旧审批继续。')
      return
    }
    const valid = await isVaultDepositApprovalValid(plan, approval, {
      actualAccount: DEMO_ACCOUNT,
      actualChainId: deployment.chainId,
    })
    if (!valid) {
      setApproval(null)
      setSession(current => withAgentSessionStatus(current, 'blocked'))
      setNotice('审批指纹、账户、网络或有效期不匹配，拒绝执行。')
      return
    }
    onExecuteDeposit(plan.amountBaseUnits)
    const nextSession = record(session, 'execution', '通过审批后执行模拟存款', JSON.stringify({
      mode: 'simulation',
      amountBaseUnits: plan.amountBaseUnits.toString(),
      method: plan.method,
    }))
    setSession(withAgentSessionStatus(nextSession, 'executed'))
    setExecuted(true)
    setNotice(`模拟执行完成：${display(plan.amountBaseUnits)} USDC 已进入现有金库模拟状态。`)
  }

  const startNewSession = () => {
    setSession(createAgentSession(`demo-${Date.now()}`))
    setPlan(null)
    setPolicy(null)
    setApproval(null)
    setExecuted(false)
    setNotice('新 session 已创建。输入一个业务请求开始。')
  }

  const handleRequestChange = (value: string) => {
    setRequest(value)
    if (plan || approval) {
      setPlan(null)
      setPolicy(null)
      setApproval(null)
      setExecuted(false)
      setSession(current => withAgentSessionStatus(current, 'ready'))
      setNotice('请求文本已修改，旧计划和审批已撤销；请重新生成计划。')
    }
  }

  return <section className="card section agent-console" id="agent-console">
    <div className="agent-heading">
      <div>
        <span className="eyebrow">04 / CONTROLLED VAULT AGENT</span>
        <h2>受控资产操作 Agent</h2>
        <p className="sub">模型只负责理解意图和生成计划；白名单、限额、审批和执行边界由确定性代码控制。</p>
      </div>
      <button className="secondary" onClick={startNewSession}>新建 session</button>
    </div>
    <form className="agent-request" onSubmit={handlePlan}>
      <label htmlFor="agent-request-input">业务请求</label>
      <div className="row">
        <input id="agent-request-input" aria-label="业务请求" value={request} onChange={event => handleRequestChange(event.target.value)} />
        <button type="submit">生成计划</button>
      </div>
      <div className="agent-presets">
        <button type="button" className="secondary" onClick={() => setRequest('帮我把 100 USDC 存入指定金库')}>正常请求</button>
        <button type="button" className="secondary" onClick={() => setRequest('帮我把 1001 USDC 存入指定金库')}>超限请求</button>
        <button type="button" className="secondary" onClick={() => setRequest('查看我的余额')}>不支持请求</button>
      </div>
    </form>
    <div className={`agent-notice ${policy && !policy.passed ? 'blocked' : ''}`} role="status" aria-live="polite">{notice}</div>
    <div className="agent-layout">
      <div className="agent-plan-panel">
        <div className="agent-panel-title"><span>Plan artifact</span><span className={`badge ${policy?.passed ? 'ok' : policy ? 'danger' : 'muted'}`}>{policy?.passed ? '可审批' : policy ? '已阻止' : '未生成'}</span></div>
        {plan ? <>
          <dl className="agent-details">
            <div><dt>操作</dt><dd>ERC-4626 deposit</dd></div>
            <div><dt>金额</dt><dd>{display(plan.amountBaseUnits)} {plan.assetSymbol}</dd></div>
            <div><dt>网络</dt><dd>Base Sepolia · {plan.chainId}</dd></div>
            <div><dt>目标</dt><dd title={plan.vault}>{short(plan.vault)}</dd></div>
            <div><dt>接收账户</dt><dd title={plan.receiver}>{short(plan.receiver)}</dd></div>
            <div><dt>执行模式</dt><dd>simulation only</dd></div>
          </dl>
          <div className="agent-actions">
            <button disabled={!policy?.passed || Boolean(approval) || executed} onClick={() => void handleApprove()}>{approval ? '已审批' : '批准精确计划'}</button>
            <button className="secondary" disabled={!approval || executed} onClick={() => void handleExecute()}>{executed ? '已执行' : '执行模拟存款'}</button>
          </div>
          {approval && <p className="agent-digest">审批指纹：<code>{short(approval.planDigest)}</code><br />有效至：{timeLabel(approval.expiresAt)}</p>}
        </> : <p className="sub agent-empty">还没有计划。输入“把 100 USDC 存入指定金库”开始。</p>}
        {policy && <div className="agent-checks"><h3>模型外策略检查</h3>{policy.checks.map(check => <div className="agent-check" key={check.id}><span className={check.passed ? 'check-pass' : 'check-fail'}>{check.passed ? '✓' : '×'}</span><span><strong>{check.label}</strong><small>{check.detail}</small></span></div>)}</div>}
      </div>
      <div className="agent-timeline">
        <div className="agent-panel-title"><span>Session / artifacts</span><code>{short(session.id)}</code></div>
        <ol className="agent-artifacts">{session.artifacts.length === 0 && <li className="agent-empty">等待用户请求</li>}{[...session.artifacts].reverse().map(artifact => <li key={artifact.id}><span className="artifact-kind">{artifact.kind}</span><span><strong>{artifact.summary}</strong><small>{timeLabel(artifact.createdAt)} · {short(artifact.id)}</small></span></li>)}</ol>
        <p className="agent-boundary">本演示不会调用 RPC、钱包或模型 API；执行按钮只驱动左侧模拟器。真实接入时，签名器仍应位于 Agent 之外。</p>
      </div>
    </div>
  </section>
}
