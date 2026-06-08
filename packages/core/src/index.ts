/**
 * Pure financial math for lien — framework-agnostic, no chain deps.
 * Risk/health math will be ported from the TRON sibling's @lend-solvent/core
 * (Morpho-style health factor) and extended with RWA NAV accounting (M3–M4).
 */

export const WAD = 10n ** 18n

/** Health factor (1e18) = weightedCollateral / debt. Infinite when no debt. */
export function healthFactorWad(weightedCollateral: bigint, debtValue: bigint): bigint {
  if (debtValue === 0n) return (1n << 256n) - 1n
  return (weightedCollateral * WAD) / debtValue
}

/** Value of an RWA position in the loan-token unit, given on-chain NAV (1e18). */
export function navValue(rwaAmount: bigint, navWad: bigint): bigint {
  return (rwaAmount * navWad) / WAD
}
