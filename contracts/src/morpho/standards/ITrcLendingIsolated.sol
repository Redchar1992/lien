// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.19;

import {ITrcLendingCommon} from "./ITrcLendingCommon.sol";

/// @title ITrcLendingIsolated
/// @notice Operations surface for the "Isolated" profile of the proposed TRC
/// lending standard: one loan token, one collateral token, one oracle, one IRM
/// and one liquidation LTV per market, addressed by a derived `bytes32` id.
/// @dev The signatures below are intentionally structurally identical to the
/// vendored Morpho-Blue `IMorpho` ops surface, so a Morpho-style engine is a
/// structural match for this profile without any wrapping (only the read
/// surface needs the conformance lens). `Id` is modeled here as `bytes32`.
interface ITrcLendingIsolated is ITrcLendingCommon {
    /// @notice The immutable parameters that define an isolated market.
    struct MarketParams {
        address loanToken;
        address collateralToken;
        address oracle;
        address irm;
        uint256 lltv;
    }

    /// @notice Supplies `assets` or `shares` of loan token on behalf of `onBehalf`.
    function supply(
        MarketParams memory marketParams,
        uint256 assets,
        uint256 shares,
        address onBehalf,
        bytes memory data
    ) external returns (uint256 assetsSupplied, uint256 sharesSupplied);

    /// @notice Withdraws `assets` or `shares` of loan token on behalf of `onBehalf` to `receiver`.
    function withdraw(
        MarketParams memory marketParams,
        uint256 assets,
        uint256 shares,
        address onBehalf,
        address receiver
    ) external returns (uint256 assetsWithdrawn, uint256 sharesWithdrawn);

    /// @notice Supplies `assets` of collateral token on behalf of `onBehalf`.
    function supplyCollateral(MarketParams memory marketParams, uint256 assets, address onBehalf, bytes memory data)
        external;

    /// @notice Withdraws `assets` of collateral token on behalf of `onBehalf` to `receiver`.
    function withdrawCollateral(MarketParams memory marketParams, uint256 assets, address onBehalf, address receiver)
        external;

    /// @notice Borrows `assets` or `shares` of loan token on behalf of `onBehalf` to `receiver`.
    function borrow(
        MarketParams memory marketParams,
        uint256 assets,
        uint256 shares,
        address onBehalf,
        address receiver
    ) external returns (uint256 assetsBorrowed, uint256 sharesBorrowed);

    /// @notice Repays `assets` or `shares` of loan token on behalf of `onBehalf`.
    function repay(
        MarketParams memory marketParams,
        uint256 assets,
        uint256 shares,
        address onBehalf,
        bytes memory data
    ) external returns (uint256 assetsRepaid, uint256 sharesRepaid);

    /// @notice Liquidates `borrower`'s position, seizing `seizedAssets` or repaying `repaidShares`.
    function liquidate(
        MarketParams memory marketParams,
        address borrower,
        uint256 seizedAssets,
        uint256 repaidShares,
        bytes memory data
    ) external returns (uint256 seizedAssets_, uint256 repaidAssets_);

    /// @notice Returns the deterministic market id for the given `marketParams`.
    function idOf(MarketParams memory marketParams) external pure returns (bytes32);

    /// @notice Returns the raw position of `user` on market `id`.
    function position(bytes32 id, address user)
        external
        view
        returns (uint256 supplyShares, uint256 borrowShares, uint256 collateral);
}
