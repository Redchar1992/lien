# lien 演示与验证

## 两个明确隔离的模式

- **模拟体验（默认）**：无需钱包，不调用 RPC。余额与操作仅在页面内存；刷新、切换模式或重置后清空。不是真实资产、真实 KYC、链上日志或实际收益。
- **Base Sepolia**：显式切换后才加载钱包客户端。使用 mock USDC / tBILL，交易需要测试币、合适网络和角色权限。历史部署不代表持续运营；读取失败与 NAV 过期应如实显示。

## 五分钟路径

1. 默认 25,000 模拟 USDC，NAV 1.02。申购 1,020 USDC → 1,000 tBILL。
2. 添加 500 tBILL 抵押品，借 200 USDC，观察健康因子。切换 NAV 过期，再次借款应拒绝；还款仍可执行。
3. 恢复 NAV，申请赎回 100 tBILL → 锁定 102 USDC。推进两天后领取；同一申请不能重复领取。
4. 金库存入 10,000 USDC → 10,000 模拟 lienUSDC 份额。cap 18,000，已有 10,000 市场配置，新增 2,000 留存闲置。
5. 耗尽市场流动性，当前仅可提 2,000；尝试提取 3,000 应拒绝。恢复流动性后可退出剩余份额。
6. 重置，切换 KYC 未验证，申购应拒绝。强调：模拟控制台不是测试网管理员操作。

模拟器不自动计息、不执行清算、没有预言机调度，也不等价于完整合约实现；合约边界另由 Foundry 验证。

## 本地构建与回归

```sh
pnpm install --frozen-lockfile
GITHUB_PAGES=true pnpm --filter @lien/web build
pnpm --filter @lien/web exec vite preview --host 127.0.0.1 --port 4173 --base /lien/
# 另一终端
npm ci --prefix tools/tests
npm --prefix tools/tests exec -- playwright install chromium
npm test --prefix tools/tests
npm run test:browser --prefix tools/tests
cd contracts && forge test --summary
```

`DEMO_URL=https://redchar1992.github.io/lien/ npm run test:browser --prefix tools/tests` 可复测已发布页面；默认测试不签名、不发送链上交易。

## GitHub Pages

仓库 Pages Source 设为 GitHub Actions。工作流在 main 推送时先验证、构建，再发布 `apps/web/dist`。Vite 使用 `/lien/` base；无需路由重写。Pages 只托管静态前端，不托管 Ponder、Postgres、keeper 或私钥。CI 不应配置交易私钥。

## 金库测试网部署与维护

2026-09-15 金库：`0xc4ca6BbC70C429F96d19577B641fbe126a0CA93B`，单一 Morpho 市场，cap 为 20,000 mock USDC；初始存入 1,000 mock USDC。[公开部署回执](vault-deployment.json)。不替换旧合约，不更新其 NAV 或身份权限。

- 完整新部署：`contracts/script/Deploy.s.sol` 现在包含金库。
- 向既有测试网部署增添金库：`contracts/script/DeployVault.s.sol`。显式设置 `ADDR_USDC`、`ADDR_MORPHO`、`ADDR_RWA`、`ADDR_ADAPTER`、`ADDR_IRM`；`VAULT_SEED_USDC` 使用 6 位最小单位，默认 0，脚本最大允许 1,000 mock USDC。从 `contracts` 目录运行 `forge script script/DeployVault.s.sol --rpc-url base_sepolia` 预演；人工核对链、地址和费用后再用 `--broadcast`。仅接受 84532 / 31337。
- 前端可用 `VITE_VAULT_ADDRESS` 指定新地址（无效值关闭金库写入）；没有配置时使用上面的已验证部署。`VITE_BASE_SEPOLIA_RPC` 可指定无密钥公共端点，所有 `VITE_` 变量都会公开，**不得放密钥**。
- 默认仅提供浏览器 injected wallet，不使用伪造的 WalletConnect 项目 ID；钱包导入/助记词不属于本站功能。
- 链上 smoke：`node --env-file=contracts/.env tools/tests/node_modules/tsx/dist/cli.mjs tools/tests/testnet-vault-smoke.ts` 默认只读。只有显式添加 `--broadcast` 才会用测试网 burner 做 100 mock USDC 提取/再存入与 10 份额赎回/再存入；每笔等待成功回执，不自动重发。不得用于真实资产。

链上检查以交易回执区块为读取锚点，不以可能滞后的 RPC `latest` 作为交易后的余额证据。若广播后脚本中断，先按输出 hash 检查回执，不要直接重跑整条操作链。
