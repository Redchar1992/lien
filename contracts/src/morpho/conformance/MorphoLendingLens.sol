// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.19;

import {Id, MarketParams, Position, IMorpho} from "../interfaces/IMorpho.sol";
import {IOracle} from "../interfaces/IOracle.sol";
import {MathLib} from "../libraries/MathLib.sol";
import {MarketParamsLib} from "../libraries/MarketParamsLib.sol";
import {MorphoBalancesLib} from "../libraries/periphery/MorphoBalancesLib.sol";
import {ORACLE_PRICE_SCALE} from "../libraries/ConstantsLib.sol";
import {ITrcLendingCommon} from "../standards/ITrcLendingCommon.sol";

/// @title MorphoLendingLens
/// @notice Read-only conformance lens that lets a deployed Morpho-style engine
/// satisfy the TRC lending standard's common read surface (`ITrcLendingCommon`),
/// plus the isolated profile's read passthroughs (`idOf` / `position`).
/// @dev The lens holds no state of its own beyond the immutable engine address;
/// every read is derived live from the engine. The risk math is a faithful
/// re-implementation of the engine's own `_isHealthy` so the liquidation
/// boundary matches exactly (same rounding direction).
///
/// Quote-unit convention: Morpho's oracle quotes 1 unit of collateral token in
/// loan-token terms (scaled by 1e36). Therefore every value this lens reports
/// (collateralValue / weightedCollateral / debtValue) is denominated in the
/// LOAN token's unit. A USD-quote alternative is an open standard question; see
/// docs/conformance-trc-lending.md.
contract MorphoLendingLens is ITrcLendingCommon {
    using MathLib for uint256;
    using MarketParamsLib for MarketParams;
    using MorphoBalancesLib for IMorpho;

    /// @notice WAD precision used by the standard's health factor.
    uint256 internal constant WAD = 1e18;

    /// @notice The Morpho-style engine this lens reads from.
    IMorpho public immutable MORPHO;

    constructor(address morpho) {
        MORPHO = IMorpho(morpho);
    }

    /// @inheritdoc ITrcLendingCommon
    /// @dev Mirrors `Morpho._isHealthy`:
    ///   borrowed           = expectedBorrowAssets (borrowShares -> assets, rounded UP)
    ///   collateralValue    = collateral.mulDivDown(price, 1e36)
    ///   weightedCollateral = collateralValue.wMulDown(lltv)
    ///   healthy            <=> weightedCollateral >= borrowed
    /// so `liquidatable` here is exactly the negation of the engine's health
    /// check, and `healthFactorWad < 1e18` agrees with it at the boundary.
    function accountRisk(bytes32 marketId, address account)
        public
        view
        override
        returns (AccountRisk memory risk)
    {
        Id id = Id.wrap(marketId);
        MarketParams memory marketParams = MORPHO.idToMarketParams(id);

        (,, uint256 collateral) = position(marketId, account);

        // Interest-accrued debt, rounded up to match the engine's `_isHealthy`.
        uint256 borrowed = MORPHO.expectedBorrowAssets(marketParams, account);

        uint256 collateralValue;
        if (marketParams.oracle != address(0)) {
            uint256 price = IOracle(marketParams.oracle).price();
            collateralValue = collateral.mulDivDown(price, ORACLE_PRICE_SCALE);
        }

        uint256 weightedCollateral = collateralValue.wMulDown(marketParams.lltv);

        risk.collateralValue = collateralValue;
        risk.weightedCollateral = weightedCollateral;
        risk.debtValue = borrowed;
        risk.healthFactorWad = borrowed == 0 ? type(uint256).max : weightedCollateral.mulDivDown(WAD, borrowed);
        // `weightedCollateral >= borrowed` is the engine's healthy condition;
        // its negation is the liquidatable condition. Computed directly (rather
        // than via the rounded healthFactorWad) so it is bit-exact at the edge.
        risk.liquidatable = weightedCollateral < borrowed;
    }

    /// @notice Batched `accountRisk` for many markets, for wallet/energy efficiency on TRON.
    function accountRiskMany(bytes32[] calldata ids, address account)
        external
        view
        returns (AccountRisk[] memory risks)
    {
        risks = new AccountRisk[](ids.length);
        for (uint256 i; i < ids.length; ++i) {
            risks[i] = accountRisk(ids[i], account);
        }
    }

    /// @notice Isolated-profile read passthrough: raw position on the engine.
    function position(bytes32 id, address user)
        public
        view
        returns (uint256 supplyShares, uint256 borrowShares, uint256 collateral)
    {
        Position memory p = MORPHO.position(Id.wrap(id), user);
        return (p.supplyShares, p.borrowShares, p.collateral);
    }

    /// @notice Isolated-profile read passthrough: deterministic market id.
    function idOf(MarketParams memory marketParams) external pure returns (bytes32) {
        return Id.unwrap(marketParams.id());
    }
}
