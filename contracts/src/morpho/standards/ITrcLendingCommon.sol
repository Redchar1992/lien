// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.19;

/// @title ITrcLendingCommon
/// @notice Paradigm-agnostic read surface for the proposed TRC lending standard.
/// @dev This is the common layer shared by every lending profile (Isolated,
/// Pooled, ...). It only normalizes account-level risk reads and the canonical
/// market lifecycle events, so wallets / liquidators / indexers can consume any
/// conformant engine through one interface regardless of its internal paradigm.
interface ITrcLendingCommon {
    /// @notice Normalized snapshot of an account's risk on a single market.
    /// @param collateralValue Total collateral value, denominated in the
    /// market's quote unit (see the conformance spec for the unit convention).
    /// @param weightedCollateral Collateral value after applying the market's
    /// liquidation weight (e.g. LLTV), i.e. the max debt the position can carry.
    /// @param debtValue Outstanding debt value (interest-accrued), same unit.
    /// @param healthFactorWad weightedCollateral / debtValue, scaled by 1e18.
    /// type(uint256).max when there is no debt.
    /// @param liquidatable True iff the position may be liquidated right now,
    /// i.e. healthFactorWad < 1e18.
    struct AccountRisk {
        uint256 collateralValue;
        uint256 weightedCollateral;
        uint256 debtValue;
        uint256 healthFactorWad;
        bool liquidatable;
    }

    /// @notice Emitted when assets are supplied to a market on behalf of an account.
    event MarketSupply(bytes32 indexed marketId, address indexed onBehalf, uint256 assets);

    /// @notice Emitted when assets are withdrawn from a market on behalf of an account.
    event MarketWithdraw(bytes32 indexed marketId, address indexed onBehalf, uint256 assets);

    /// @notice Emitted when assets are borrowed from a market on behalf of an account.
    event MarketBorrow(bytes32 indexed marketId, address indexed onBehalf, uint256 assets);

    /// @notice Emitted when assets are repaid to a market on behalf of an account.
    event MarketRepay(bytes32 indexed marketId, address indexed onBehalf, uint256 assets);

    /// @notice Emitted when a borrower's position is liquidated.
    event MarketLiquidate(
        bytes32 indexed marketId,
        address indexed borrower,
        address indexed liquidator,
        uint256 repaidAssets,
        uint256 seizedCollateral
    );

    /// @notice Returns the normalized risk snapshot of `account` on market `marketId`.
    function accountRisk(bytes32 marketId, address account) external view returns (AccountRisk memory);
}
