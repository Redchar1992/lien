# Verification — 2026-09-15

## 已完成的本地检查

| 层 | 结果 / 证据 |
|---|---|
| Solidity | `forge test --summary`：54 passed，0 failed，0 skipped；包含 256 轮金库存取 fuzz case |
| SDK / 模拟状态机 | 16 tests：精度、KYC、NAV、T+2、重复领取、cap / 流动性、份额、网络/账户不匹配、拒签、回执超时与替换交易 |
| 浏览器 | 8 cases（Chromium desktop + mobile）：默认不发远程请求、申购赎回、金库存取、风险拒绝、RPC 断网、模式切换重置 |
| 静态构建 | `GITHUB_PAGES=true pnpm --filter @lien/web build` 通过，包含 TypeScript 编译；`/lien/` 资源路径正确 |
| 视觉核验 | 桌面 / 移动布局及测试网金库只读页面；无页面运行时异常，桌面与移动模拟页无横向溢出 |
| 测试网实际存取 | 修正后 6 笔交易全部成功：提取 100 mock USDC → 授权 / 再存入；赎回 10 份额 → 授权 / 再存入。逐笔以回执区块核验，最终钱包 mock USDC 余额恢复；见 [vault-smoke.json](vault-smoke.json) |
| 新金库部署 | Base Sepolia；6 笔部署/配置/seed 交易回执成功，见 [vault-deployment.json](vault-deployment.json) |

新增风险回归修复：`maxWithdraw` / `maxRedeem` 根据可用现金限制；提款跨过现金不足的市场继续处理后续队列；禁止重复提款队列项造成流动性重复计数；预执行区块不早于前笔授权回执，gas limit 留出跨区块计息/存储变化余量；交易广播后确认未知保留 hash，阻止当前动作盲重发。

## 测试网暴露的问题及修正

1. 交易确认后的 `latest` 读数曾落在交易之前的区块，造成余额断言失败。改为以回执区块读取；连续动作的预执行也不得早于授权回执区块。
2. 早期 [redeem 交易](https://sepolia.basescan.org/tx/0xa2efd8ca39bf8e251f91e43dd5d4d3f70ba8d42b0937dee6c267197119af590e) 回滚，gas limit 为 167,904。重放显示内层调用 gas 耗尽；相同区块更高 gas 的调用成功。SDK 与手工 smoke 为估算值加 30% + 50,000 gas limit 余量，再执行完整存取/赎回流程通过。此余量不是任意状态变化下的成功保证，仍保留失败回执与明确错误。
3. 所有重试前均检查已广播 hash；已成功的提取不被盲目重发。以上是实际失败与修正记录，不把首次 smoke 描述为全通过。

## 持续验证与发布

[GitHub Actions](https://github.com/Redchar1992/lien/actions/workflows/pages.yml) 对已提交依赖锁重新安装并运行构建、状态机/SDK、浏览器、Foundry 校验；main 验证成功后发布 Pages。测试工具独立 npm lock 不修改原 pnpm lock；新增工具依赖检查无已报告漏洞，这不等于全仓库安全审计。

## 证据范围与限制

- Base Sepolia 原 NAV 已过期，本次没有篡改历史 NAV、身份白名单或管理员配置来伪造健康运营。金库提供 USDC 流动性与退出不依赖该 NAV；实际申购/借款会按合约约束拒绝。
- 浏览器交易拒签、网络/账户切换和超时通过 SDK 的受控客户端回归；浏览器 E2E 覆盖模拟交互、模式隔离与 RPC 失败。不能把它们表述为每种真实钱包都已端到端验证。
- 构建有现有钱包依赖 chunk 大于 500 KB 的警告；钱包端按模式懒加载，默认模拟入口不加载钱包运行时。这是性能待优化项，不是构建失败。
- 没有主网部署、真实资产/资金检查、真实 KYC、Ponder/keeper 生产部署、跨浏览器全覆盖或独立安全审计。占位 lint 脚本不计作 lint 通过。
- 仓库原有 `package.json` / `pnpm-lock.yaml` 未提交修改保留不动，不混入本次提交。公开发布以 GitHub Actions 使用**已提交依赖锁**的校验结果为准。
