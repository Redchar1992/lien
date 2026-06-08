# @lien/indexer — ponder

Indexes the protocol's events into Postgres for history & charts (subscriptions,
redemptions, NAV curve, liquidations). The frontend reads live state directly from
chain; this layer powers history/analytics.

**Scaffold** — wired but dormant until the M5 deploy fills in addresses:

```bash
cd apps/indexer
pnpm install              # installs ponder (kept out of the root install)
cp .env.example .env.local && edit   # addresses + start block from M5
pnpm dev                 # ponder dev server + GraphQL
```

Schema: [`ponder.schema.ts`](ponder.schema.ts) · sources/ABIs:
[`ponder.config.ts`](ponder.config.ts) · handlers: [`src/index.ts`](src/index.ts).
Pin the exact `ponder` version on install.
