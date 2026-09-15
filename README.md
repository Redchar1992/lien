# lien

**Tokenized real-world assets you can borrow against — with on-chain compliance.**

`lien` is a full-stack RWA credit protocol: a permissioned, NAV-bearing token that
represents a real-world asset (e.g. tokenized T-bills), wrapped in subscription /
redemption flows, and usable as **collateral in an isolated lending market** so
holders can borrow stablecoins **without redeeming** — the protocol takes a *lien*
on the tokenized asset.

**技术实践 / technical exploration — mock assets only, not a live investment product.**

- **[Open the wallet-free demo](https://redchar1992.github.io/lien/)** — simulation is the default; Base Sepolia is a separate explicit mode.
- [Five-minute walkthrough and deployment guide](docs/demo-runbook.md)
- [Architecture, reused components and trust boundaries](docs/architecture-and-risks.md)
- [Verification evidence](docs/verification.md)

## Why it's interesting (the hard parts)

- **Compliance as a first-class concern.** The RWA token is *permissioned* (KYC
  allowlist + transfer restrictions + agent powers: freeze / forceTransfer /
  recovery — a technical permission model, **not proof of legal compliance**;
  centralization trade-offs are documented). A faithful, focused subset of the ERC-3643 model.
- **NAV oracle = the asset's truth.** Off-chain valuation pushed on-chain with
  staleness + circuit-breaker guards; yield accrues via NAV appreciation. An RWA
  oracle carries more responsibility than a DeFi price feed.
- **Liquidating *permissioned* collateral.** A liquidator seizing the RWA token
  must itself be eligible to hold it. Three designs are compared (liquidator
  allowlist / seize-to-forced-redemption / protocol custody); one is implemented.
- **Isolated lending core, reused.** The market is built on a vendored Morpho Blue
  engine, so the work concentrates on the RWA differentiators above.

## How it works

The depositor journey, and the mechanism behind each step:

1. **Get allowlisted.** The RWA token (`tBILL`) is *permissioned* — an agent KYC-verifies
   your address in the `IdentityRegistry`. Only verified addresses may hold or receive it
   (enforced on-chain in the token's transfer hook, ERC-3643-style).
2. **Subscribe.** Deposit USDC → the `SubscriptionManager` mints `tBILL` at the current
   **NAV** (Net Asset Value per share, pushed on-chain by the `NavOracle`). Decimals are
   handled explicitly (6-dec USDC ↔ 18-dec tBILL ↔ 1e18 NAV), rounding in the protocol's
   favor.
3. **Earn yield.** Yield accrues as NAV rises above $1.00 (e.g. a T-bill accruing interest) —
   your position's USD value grows without any token rebasing.
4. **Borrow against it.** Post `tBILL` as collateral in the isolated lending market (a
   vendored Morpho Blue engine) and **borrow USDC without selling** — the protocol takes a
   *lien* on your tokenized asset. The **Health Factor** = LTV-weighted collateral ÷ debt;
   above 1.0 meets the configured threshold, below 1.0 is liquidatable. The NAV→Morpho oracle adapter is
   **fail-safe**: a stale/circuit-broken NAV blocks price-dependent actions rather than pricing off a
   dead feed (repayment and supplying liquidity remain possible).
5. **Liquidation of permissioned collateral.** If a position goes underwater, anyone can
   liquidate it through the `LiquidationRouter` — a KYC'd contract with a USDC buffer that
   receives the seized `tBILL`, fronts the repayment, and pays the keeper the incentive in
   USDC. So liquidation stays permissionless and capital-free even though the collateral
   itself can only be held by verified addresses. (Three designs are compared in the
   [ADRs](contracts/docs/合规设计.md).)
6. **Redeem.** Burn `tBILL` → the USDC owed is locked at the current NAV and **queued**; after
   a **T+N** settlement delay you `claim` it (real funds settle on a schedule, not instantly).
   The UI surfaces your pending redemptions with a live countdown and a Claim button that
   unlocks once settled — and `withdrawProceeds` can never dip into the reserve backing those
   queued claims.
7. **Or deposit into the curated vault.** Prefer a curated lending route?
   `LienVault` (ERC-4626, MetaMorpho-style) takes your USDC and a curator allocates it
   across configured isolated RWA markets under per-market caps; borrower interest accrues to depositors. The demo configures only one market, not diversified exposure.

Every privileged/agent action emits an auditable event; the trust boundary is documented
honestly rather than hidden.

## Architecture

```
Frontend (React + Vite + wagmi/viem)     Indexer scaffold (not hosted)
        │                                        │
        └──────────────  Contracts (Foundry)  ───┘
            compliance/  IdentityRegistry + transfer-restriction hook + roles
            rwa/         permissioned RWA token (subscribe→mint / redeem→burn)
            oracle/      NavOracle + Morpho IOracle adapter
            market/      isolated RWA/stablecoin lending market
            morpho/      vendored Morpho Blue engine (isolated-lending core)
```

## Tech stack

Foundry · Solidity · vendored Morpho Blue · viem/wagmi · RainbowKit · ponder ·
Postgres · pnpm + turbo monorepo · Base Sepolia.

## Status — roadmap

Original milestone test counts below are historical; [verification](docs/verification.md) records the current regression results.

- [x] **M0** — monorepo scaffold + vendored Morpho engine
- [x] **M1** — compliance core (IdentityRegistry, permissioned RWA token, agent roles) — 14 tests
- [x] **M2** — NAV oracle (staleness + circuit breaker) + subscription/redemption (USDC ↔ RWA @ NAV, T+N queue) — 11 tests
- [x] **M3** — isolated lending market over Morpho + NAV→1e36 oracle adapter + permissioned-collateral liquidation (router pattern) — 8 tests · [ADRs](contracts/docs/合规设计.md)
- [x] **M4** — full-stack frontend (React + viem/wagmi + RainbowKit) + viem tx-lifecycle SDK + ponder indexer scaffold — typechecks
- [x] **M5** — deployed + seeded live on **Base Sepolia** ([addresses](#live-on-base-sepolia)); `pnpm --filter @lien/web dev` connects to it
- [x] **M6** — curated ERC-4626 vault with cap/queues, liquidity-aware exit limits and deposit/withdraw/redeem UI; see current verification evidence below.
- [x] **M7** — wallet-free simulation, risk scenarios, static Pages workflow and browser/SDK/contract regression checks.

## Live on Base Sepolia

Core contracts were deployed and seeded on 2026-06-08. That is historical state, not a promise of current NAV freshness, liquidity or keeper uptime. Open the demo and explicitly switch to Base Sepolia, or run `pnpm --filter @lien/web dev`. See [verification](docs/verification.md) for dated evidence. No mainnet or real assets are used.

| Contract | Address |
| --- | --- |
| USDC (mock, 6-dec) | `0xd11cC6B62825fFa10Cf96Dd630D2eD48263636e5` |
| RwaToken (tBILL) | `0xd59D41cF09D4c9Cf06723f0d04E5Fb7976AE481C` |
| IdentityRegistry | `0x47eA4Cddbc918204F5cbCB27F88c1e02Ce746618` |
| NavOracle | `0xF8d443fDC625a3f0990cdAb6Ac6B5Da5e379017d` |
| SubscriptionManager | `0x8Fe81a819c6280678b607fDCCC09AB54e526E48b` |
| Morpho (engine) | `0x62bd467F599153e8E3C46c6629CA2b774AF405B4` |
| MorphoNavOracleAdapter | `0x86e9000956B488192F3e572d2C73c0C0DfCB7b0b` |
| LienVault (2026-09-15) | `0xc4ca6BbC70C429F96d19577B641fbe126a0CA93B` |
| LiquidationRouter | `0xdBc5Fe8F7Bc3cd34F5fBdBb670F1Aa7690d25375` |

To interact (subscribe / borrow) a wallet must be KYC-verified by the agent — the
permission model is the point. Reads (NAV, positions) work for anyone.

See [`docs/开发计划.md`](docs/开发计划.md) for the full plan and RWA compliance notes.

## Layout

```
contracts/   Foundry workspace (see contracts/README.md)
packages/    config · core (risk/NAV math) · sdk (tx lifecycle, viem)
apps/        web frontend (M4)
docs/        plan + architecture decisions
```
