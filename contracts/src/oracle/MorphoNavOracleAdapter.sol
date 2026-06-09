// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IOracle} from "../morpho/interfaces/IOracle.sol";
import {INavSource} from "./INavSource.sol";

/// @title MorphoNavOracleAdapter
/// @notice Adapts the RWA `NavOracle` to Morpho's `IOracle`, which expects the
/// price of 1 collateral asset quoted in 1 loan asset, scaled by 1e36, with
/// `36 + loanDecimals - collateralDecimals` decimals of precision.
///
/// @dev Derivation (loan = USDC ≈ $1, collateral = RWA, NAV = USD per whole
/// share, 1e18-scaled). Morpho computes
///   collateralValue = collateralRaw * price / 1e36
/// and we need 1 whole RWA (10**collDec raw) at NAV $X to be worth X * 10**loanDec
/// raw loan units. Solving:
///   price = navWad * 10**(18 + loanDecimals - collateralDecimals)
/// For USDC(6) / RWA(18): price = navWad * 1e6.  (← exactly the decimals factor
/// I kept missing in audits; pinned here.)
///
/// Fail-safe: `price()` calls `navChecked()`, so a stale or paused NAV makes the
/// whole market revert (borrow / withdraw / liquidate) rather than pricing
/// positions off a dead feed. Trade-off: a stale feed also blocks liquidations;
/// mitigated by a generous staleness window + an oracle keeper. Documented in docs/.
contract MorphoNavOracleAdapter is IOracle {
    INavSource public immutable navSource;
    uint256 public immutable scaleMul;

    constructor(address navSource_, uint8 collateralDecimals, uint8 loanDecimals) {
        navSource = INavSource(navSource_);
        // e = 18 + loanDecimals - collateralDecimals ; price = nav * 10**e
        int256 e = int256(18) + int256(uint256(loanDecimals)) - int256(uint256(collateralDecimals));
        require(e >= 0, "adapter: negative exponent unsupported");
        scaleMul = 10 ** uint256(e);
    }

    /// @inheritdoc IOracle
    function price() external view returns (uint256) {
        return navSource.navChecked() * scaleMul; // reverts if NAV stale/paused/unavailable
    }
}
