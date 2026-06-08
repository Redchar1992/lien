# lien · contracts

Foundry workspace. Layout:

```
src/
  compliance/   # IdentityRegistry + transfer-restriction hook + agent roles (M1)
  rwa/          # permissioned RWA token: subscribe→mint / redeem→burn (M1–M2)
  oracle/       # NavOracle (off-chain asset NAV → on-chain) + Morpho IOracle adapter (M2–M3)
  market/       # isolated lending market wiring over the vendored engine (M3)
  morpho/       # VENDORED Morpho Blue engine (morpho-org/morpho-blue, GPL-2.0+/BSL).
                # Reused as the isolated-lending core so effort focuses on the RWA
                # differentiators. See morpho/MORPHO_BLUE_LICENSE.
```

The RWA collateral is a **permissioned** token, which makes liquidation non-trivial
(a liquidator seizing it must also be eligible to hold it). The design options and
the chosen path are documented in `docs/` and the market contracts (M3).

Build: `forge build` · Test: `forge test`. Target `evm_version = paris` (see foundry.toml).
