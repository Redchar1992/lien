# 受控资产操作 Agent 演示

## 目标

本功能不是让模型自动替用户操作资金，而是展示一条可审查的 Agent 运行时边界：

```text
业务请求 → 窄范围意图解析 → 结构化计划 artifact
        → 模型外确定性策略 → 人工批准精确计划
        → 再次校验 → 模拟执行 / 未来接钱包
```

当前演示只支持一项操作：向配置的 `LienVault` 调用
`deposit(uint256 assets, address receiver)`。它不接受任意合约地址、任意方法或任意
calldata，也不持有私钥。

## 已实现的治理边界

- **网络绑定**：只允许 Base Sepolia，计划网络和当前网络必须一致。
- **目标绑定**：只允许 `apps/web/src/deployments.ts` 中的金库地址。
- **资产绑定**：只允许部署配置中的 mock USDC。
- **账户绑定**：计划、审批和执行必须是同一个账户。
- **金额上限**：Agent 单次存款最多 1,000 USDC；余额在计划、审批、执行前检查。
- **精确审批**：计划的规范化 JSON 使用 Web Crypto SHA-256 生成指纹；修改金额、目标、账户、网络或方法后必须重新审批。
- **session / artifact**：意图、计划、策略结果、审批和执行记录按追加方式保留在当前 session 中。
- **故障安全**：策略失败、账户/网络变化、审批过期或指纹不一致都会阻止执行。

## 面试五分钟演示

1. 打开默认的“模拟体验”，说明不会调用 RPC、钱包或真实模型。
2. 在“受控资产操作 Agent”输入：`帮我把 100 USDC 存入指定金库`。
3. 展示 `Plan artifact`、Base Sepolia、金库地址、`deposit` 方法和八项策略检查。
4. 点击“批准精确计划”，展示审批指纹与 5 分钟有效期。
5. 点击“执行模拟存款”，说明此按钮只驱动现有模拟器，签名器不在 Agent 内。
6. 新建 session，输入 `帮我把 1001 USDC 存入指定金库`，展示金额上限阻止审批。
7. 再输入 `查看我的余额`，展示窄范围 Agent 拒绝不支持的意图。
8. 结合代码说明：真实接入时，调用 SDK 的
   `executeApprovedVaultDeposit`；它会在进入 `simulate → sign → waitForReceipt` 前再次执行策略和审批校验，而不是把 signer 暴露给模型。

## 代码导览

- `packages/core/src/agent.ts`：意图、计划、策略、审批指纹和 session/artifact 的纯领域层。
- `packages/core/test/agent.test.ts`：金额精度、白名单、额度、账户/网络、审批篡改和 artifact 顺序测试。
- `apps/web/src/demo/AgentConsole.tsx`：无钱包面试演示 UI。
- `apps/web/src/demo/model.ts`：现有模拟资产状态机；Agent 执行成功后调用其 `deposit` 分支。
- `packages/sdk/src/index.ts`：`executeApprovedVaultDeposit` 在 Agent 与 signer 之间提供第二道运行时门禁，然后复用通用交易生命周期。

## 明确不夸大的范围

- 当前 parser 是确定性本地替身，不声称已经接入真实 LLM。
- 当前执行是 wallet-free simulation，不声称已完成 Agent 驱动的测试网签名。
- SDK 已提供真实测试网的受控执行适配器，但本次演示 UI 不自动触发钱包签名；接入生产前仍需真实账户、链上读数和独立安全评审。
- 审批指纹是应用层完整性绑定，不是钱包签名或链上授权。
- 1,000 USDC 是演示策略，不是金融风险或法律合规结论。
