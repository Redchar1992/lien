import { ponder } from 'ponder:registry'
import { liquidation, navUpdate, redemption, subscription } from 'ponder:schema'

ponder.on('SubscriptionManager:Subscribed', async ({ event, context }) => {
  await context.db.insert(subscription).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    user: event.args.user,
    usdcIn: event.args.usdcIn,
    rwaOut: event.args.rwaOut,
    nav: event.args.nav,
    timestamp: event.block.timestamp,
  })
})

ponder.on('SubscriptionManager:RedemptionRequested', async ({ event, context }) => {
  await context.db.insert(redemption).values({
    id: event.args.id.toString(),
    user: event.args.user,
    rwaIn: event.args.rwaIn,
    usdcOwed: event.args.usdcOwed,
    claimableAt: BigInt(event.args.claimableAt),
    claimed: false,
    nav: event.args.nav,
  })
})

ponder.on('SubscriptionManager:RedemptionClaimed', async ({ event, context }) => {
  await context.db.update(redemption, { id: event.args.id.toString() }).set({ claimed: true })
})

ponder.on('NavOracle:NavUpdated', async ({ event, context }) => {
  await context.db.insert(navUpdate).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    nav: event.args.nav,
    forced: event.args.forced,
    timestamp: event.block.timestamp,
  })
})

ponder.on('LiquidationRouter:Liquidated', async ({ event, context }) => {
  await context.db.insert(liquidation).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    liquidator: event.args.liquidator,
    borrower: event.args.borrower,
    seized: event.args.seized,
    repaid: event.args.repaid,
    profitPaid: event.args.profitPaid,
    timestamp: event.block.timestamp,
  })
})
