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
- [ ] **M4** — full-stack frontend (viem/wagmi) + indexer
- [ ] **M5** — Base Sepolia deploy + demo + architecture decision docs

See [`docs/开发计划.md`](docs/开发计划.md) for the full plan and RWA compliance notes.

## Layout

```
contracts/   Foundry workspace (see contracts/README.md)
packages/    config · core (risk/NAV math) · sdk (tx lifecycle, viem)
apps/        web frontend (M4)
docs/        plan + architecture decisions
```
