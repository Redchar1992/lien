// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {IMorpho, MarketParams} from "../morpho/interfaces/IMorpho.sol";
import {NavOracle} from "../oracle/NavOracle.sol";
import {SubscriptionManager} from "../rwa/SubscriptionManager.sol";

/// @title LiquidationRouter
/// @notice Solves the hard problem of liquidating *permissioned* collateral.
///
/// The collateral (RWA) can only be held by KYC-verified addresses, so a naive
/// liquidator calling `Morpho.liquidate` directly reverts when the engine tries
/// to send it the seized RWA — which would let bad debt accumulate. Three designs
/// were considered (see docs/合规设计.md):
///   (1) liquidator allowlist — only KYC'd keepers may liquidate (shrinks the
///       keeper set → worse coverage);
///   (2) seize → instant USDC payout via a KYC'd router with a stablecoin buffer
///       (this contract) — keepers need neither KYC nor capital;
///   (3) protocol-custody disposal.
///
/// This contract implements (2): it is itself a KYC'd holder, so the engine can
/// hand it the seized RWA. It fronts the repayment from its USDC buffer, takes
/// the RWA onto its book, and pays the caller the liquidation incentive in USDC.
/// The router carries the RWA inventory + NAV risk until it redeems via
/// `redeemInventory` (T+N). This keeps liquidation permissionless and capital-free
/// for keepers, which is what keeps a permissioned-collateral market solvent.
contract LiquidationRouter is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IMorpho public immutable morpho;
    IERC20 public immutable usdc;
    IERC20 public immutable rwa;
    NavOracle public immutable navOracle;
    SubscriptionManager public immutable manager;

    uint256 public immutable usdcScale;
    uint256 public immutable rwaScale;
    uint256 private constant NAV_SCALE = 1e18;

    event Liquidated(address indexed liquidator, address indexed borrower, uint256 seized, uint256 repaid, uint256 profitPaid);
    event Funded(address indexed from, uint256 amount);
    event InventoryRedeemRequested(uint256 indexed id, uint256 rwaAmount);
    event Withdrawn(address indexed to, uint256 amount);

    constructor(
        address morpho_,
        address usdc_,
        address rwa_,
        address navOracle_,
        address manager_,
        uint8 usdcDecimals,
        uint8 rwaDecimals,
        address admin
    ) {
        morpho = IMorpho(morpho_);
        usdc = IERC20(usdc_);
        rwa = IERC20(rwa_);
        navOracle = NavOracle(navOracle_);
        manager = SubscriptionManager(manager_);
        usdcScale = 10 ** usdcDecimals;
        rwaScale = 10 ** rwaDecimals;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        IERC20(usdc_).forceApprove(morpho_, type(uint256).max);
    }

    /// @notice Liquidate a position on behalf of ANY caller (no KYC, no capital).
    /// The router receives the seized RWA (it is a verified holder), fronts the
    /// repay from its USDC buffer, and pays the caller the incentive in USDC.
    function liquidate(MarketParams calldata marketParams, address borrower, uint256 seizedAssets)
        external
        nonReentrant
        returns (uint256 seized, uint256 repaid)
    {
        (seized, repaid) = morpho.liquidate(marketParams, borrower, seizedAssets, 0, "");

        uint256 nav = navOracle.navChecked();
        uint256 seizedValue = Math.mulDiv(seized, nav * usdcScale, rwaScale * NAV_SCALE);
        uint256 profit = seizedValue > repaid ? seizedValue - repaid : 0;
        if (profit > 0) usdc.safeTransfer(msg.sender, profit);

        emit Liquidated(msg.sender, borrower, seized, repaid, profit);
    }

    /// @notice Top up the USDC buffer used to front liquidations.
    function fund(uint256 amount) external {
        usdc.safeTransferFrom(msg.sender, address(this), amount);
        emit Funded(msg.sender, amount);
    }

    /// @notice Redeem accumulated RWA inventory to USDC (T+N) to refill the buffer.
    function redeemInventory(uint256 rwaAmount) external onlyRole(DEFAULT_ADMIN_ROLE) returns (uint256 id) {
        id = manager.requestRedemption(rwaAmount); // burns the router's RWA, queues USDC
        emit InventoryRedeemRequested(id, rwaAmount);
    }

    function claimInventory(uint256 id) external onlyRole(DEFAULT_ADMIN_ROLE) {
        manager.claimRedemption(id);
    }

    function withdraw(address to, uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE) {
        usdc.safeTransfer(to, amount);
        emit Withdrawn(to, amount);
    }
}
