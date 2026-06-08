import { onchainTable } from 'ponder'

/** A subscription (USDC in -> RWA minted at NAV). */
export const subscription = onchainTable('subscription', (t) => ({
  id: t.text().primaryKey(), // txHash-logIndex
  user: t.hex().notNull(),
  usdcIn: t.bigint().notNull(),
  rwaOut: t.bigint().notNull(),
  nav: t.bigint().notNull(),
  timestamp: t.bigint().notNull(),
}))

/** A redemption request (RWA burned, USDC owed, T+N settlement). */
export const redemption = onchainTable('redemption', (t) => ({
  id: t.text().primaryKey(), // requestId
  user: t.hex().notNull(),
  rwaIn: t.bigint().notNull(),
  usdcOwed: t.bigint().notNull(),
  claimableAt: t.bigint().notNull(),
  claimed: t.boolean().notNull(),
  nav: t.bigint().notNull(),
}))

/** NAV history for the yield/price chart. */
export const navUpdate = onchainTable('nav_update', (t) => ({
  id: t.text().primaryKey(),
  nav: t.bigint().notNull(),
  forced: t.boolean().notNull(),
  timestamp: t.bigint().notNull(),
}))

/** Liquidations routed through the LiquidationRouter. */
export const liquidation = onchainTable('liquidation', (t) => ({
  id: t.text().primaryKey(),
  liquidator: t.hex().notNull(),
  borrower: t.hex().notNull(),
  seized: t.bigint().notNull(),
  repaid: t.bigint().notNull(),
  profitPaid: t.bigint().notNull(),
  timestamp: t.bigint().notNull(),
}))
