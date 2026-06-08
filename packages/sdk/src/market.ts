/**
 * Morpho isolated-market helpers: market-id derivation and health computation,
 * decimals-explicit (USDC loan / RWA collateral / NAV 1e18 / Morpho 1e36).
 */

import { type Address, type Hex, type PublicClient, encodeAbiParameters, keccak256 } from 'viem'
import { healthFactorWad as coreHealthFactorWad, WAD } from '@lien/core'
import { morphoAbi } from './abis'

export interface MarketParamsOnchain {
  loanToken: Address
  collateralToken: Address
  oracle: Address
  irm: Address
  lltv: bigint
}

/** keccak256(abi.encode(MarketParams)) — must hash the 20-byte address forms. */
export function computeMarketId(p: MarketParamsOnchain): Hex {
  return keccak256(
    encodeAbiParameters(
      [{ type: 'address' }, { type: 'address' }, { type: 'address' }, { type: 'address' }, { type: 'uint256' }],
      [p.loanToken, p.collateralToken, p.oracle, p.irm, p.lltv],
    ),
  )
}

function mulDivUp(x: bigint, y: bigint, d: bigint): bigint {
  if (d === 0n) return 0n
  return (x * y + (d - 1n)) / d
}

export interface PositionHealth {
  /** raw collateral (RWA units) */
  collateral: bigint
  /** accrued debt in loan-token (USDC) units */
  debt: bigint
  /** collateral value in loan-token (USDC) units */
  collateralValue: bigint
  /** collateralValue * lltv */
  weightedCollateral: bigint
  /** weightedCollateral / debt, 1e18; max if no debt */
  healthFactorWad: bigint
  liquidatable: boolean
}

/**
 * Read a borrower's position + market totals and compute health, mirroring the
 * on-chain math (debt rounds UP; collateral value rounds down via integer div).
 * `navWad` is value-per-whole-RWA (1e18). Decimals are passed explicitly.
 */
export async function readPositionHealth(args: {
  client: PublicClient
  morpho: Address
  marketId: Hex
  user: Address
  navWad: bigint
  lltvWad: bigint
  loanDecimals: number
  collateralDecimals: number
}): Promise<PositionHealth> {
  const { client, morpho, marketId, user, navWad, lltvWad, loanDecimals, collateralDecimals } = args

  const [, borrowShares, collateral] = await client.readContract({
    address: morpho,
    abi: morphoAbi,
    functionName: 'position',
    args: [marketId, user],
  })
  const [, , totalBorrowAssets, totalBorrowShares] = await client.readContract({
    address: morpho,
    abi: morphoAbi,
    functionName: 'market',
    args: [marketId],
  })

  const debt = borrowShares === 0n ? 0n : mulDivUp(borrowShares, totalBorrowAssets, totalBorrowShares)

  // price = navWad * 10**(18 + loanDec - collDec); collateralValue = collateral * price / 1e36
  const e = BigInt(18 + loanDecimals - collateralDecimals)
  const price = navWad * 10n ** e
  const collateralValue = (collateral * price) / 10n ** 36n
  const weightedCollateral = (collateralValue * lltvWad) / WAD
  const hf = coreHealthFactorWad(weightedCollateral, debt)

  return {
    collateral,
    debt,
    collateralValue,
    weightedCollateral,
    healthFactorWad: hf,
    liquidatable: debt > 0n && weightedCollateral < debt,
  }
}
