# lien

**Tokenized real-world assets you can borrow against — with on-chain compliance.**

`lien` is a full-stack RWA credit protocol: a permissioned, NAV-bearing token that
represents a real-world asset (e.g. tokenized T-bills), wrapped in subscription /
redemption flows, and usable as **collateral in an isolated lending market** so
holders can borrow stablecoins **without redeeming** — the protocol takes a *lien*
on the tokenized asset.

> Portfolio project (EVM / RWA). Built EVM-native (Foundry + viem/wagmi) as the
> transferable counterpart to my TRON lending work — the full-stack pattern moves
> from TronWeb to viem as an interface swap, not a rewrite.

## Why it's interesting (the hard parts)

- **Compliance as a first-class concern.** The RWA token is *permissioned* (KYC
  allowlist + transfer restrictions + agent powers: freeze / forceTransfer /
  recovery — required by regulation, with the centralization trade-off discussed
  honestly). A faithful, focused subset of the ERC-3643 model.
- **NAV oracle = the asset's truth.** Off-chain valuation pushed on-chain with
  staleness + circuit-breaker guards; yield accrues via NAV appreciation. An RWA
  oracle carries more responsibility than a DeFi price feed.
- **Liquidating *permissioned* collateral.** A liquidator seizing the RWA token
  must itself be eligible to hold it. Three designs are compared (liquidator
  allowlist / seize-to-forced-redemption / protocol custody); one is implemented.
- **Isolated lending core, reused.** The market is built on a vendored Morpho Blue
  engine, so the work concentrates on the RWA differentiators above.

## Architecture

```
Frontend (React + Vite + wagmi/viem)  →  Indexer (ponder/viem + Postgres)
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

- [x] **M0** — monorepo scaffold + vendored Morpho engine
- [x] **M1** — compliance core (IdentityRegistry, permissioned RWA token, agent roles) — 14 tests
- [x] **M2** — NAV oracle (staleness + circuit breaker) + subscription/redemption (USDC ↔ RWA @ NAV, T+N queue) — 11 tests
- [x] **M3** — isolated lending market over Morpho + NAV→1e36 oracle adapter + permissioned-collateral liquidation (router pattern) — 8 tests · [ADRs](contracts/docs/合规设计.md)
- [x] **M4** — full-stack frontend (React + viem/wagmi + RainbowKit) + viem tx-lifecycle SDK + ponder indexer scaffold — typechecks
- [x] **M5** — deployed + seeded live on **Base Sepolia** ([addresses](#live-on-base-sepolia)); `pnpm --filter @lien/web dev` connects to it
- [x] **M6** — curated ERC-4626 vault (MetaMorpho-style): depositors lend USDC across isolated RWA markets under per-market caps; yield accrues to depositors — 4 tests

## Live on Base Sepolia

Deployed + seeded 2026-06-08 (market liquidity, a healthy borrow position, router
buffer + redemption liquidity). NAV $1.00. Run `pnpm --filter @lien/web dev` and
connect a Base Sepolia wallet.

| Contract | Address |
| --- | --- |
| USDC (mock, 6-dec) | `0xd11cC6B62825fFa10Cf96Dd630D2eD48263636e5` |
| RwaToken (tBILL) | `0xd59D41cF09D4c9Cf06723f0d04E5Fb7976AE481C` |
| IdentityRegistry | `0x47eA4Cddbc918204F5cbCB27F88c1e02Ce746618` |
| NavOracle | `0xF8d443fDC625a3f0990cdAb6Ac6B5Da5e379017d` |
| SubscriptionManager | `0x8Fe81a819c6280678b607fDCCC09AB54e526E48b` |
| Morpho (engine) | `0x62bd467F599153e8E3C46c6629CA2b774AF405B4` |
| MorphoNavOracleAdapter | `0x86e9000956B488192F3e572d2C73c0C0DfCB7b0b` |
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
