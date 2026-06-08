// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {RwaToken} from "./RwaToken.sol";
import {NavOracle} from "../oracle/NavOracle.sol";

/// @title SubscriptionManager
/// @notice Primary market for the RWA token: subscribe with USDC to mint RWA at
/// the current NAV, and redeem RWA back to USDC through a T+N settlement queue
/// (real-world funds don't settle instantly).
///
/// @dev Decimals are handled explicitly: USDC is 6-decimal, the RWA share is
/// 18-decimal, and NAV is 1e18-scaled value-per-whole-share. The conversions
/// read each token's real decimals (never assume 18) — the single most common
/// RWA/lending bug. All conversions round DOWN (favouring the protocol/pool),
/// so a subscribe→redeem round-trip at a flat NAV never returns more than paid.
///
/// Redemption locks the NAV at request time, burns the RWA immediately, and pays
/// USDC after `settlementDelay`. The issuer tops up redemption liquidity via
/// `fundRedemptions` and deploys subscription proceeds off-chain into the real
/// asset via `withdrawProceeds`.
contract SubscriptionManager is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable usdc;
    RwaToken public immutable rwa;
    NavOracle public immutable oracle;

    uint256 public immutable usdcScale; // 10**usdcDecimals
    uint256 public immutable rwaScale; // 10**rwaDecimals
    uint256 private constant NAV_SCALE = 1e18;

    uint256 public settlementDelay; // seconds (T+N)

    struct RedemptionRequest {
        address user;
        uint256 usdcOwed;
        uint64 claimableAt;
        bool claimed;
    }

    RedemptionRequest[] public requests;

    /// Sum of unclaimed `usdcOwed` across queued redemptions. The issuer must not
    /// withdraw proceeds below this — otherwise queued redemptions can't be paid.
    uint256 public outstandingRedemptions;

    event Subscribed(address indexed user, uint256 usdcIn, uint256 rwaOut, uint256 nav);
    event RedemptionRequested(uint256 indexed id, address indexed user, uint256 rwaIn, uint256 usdcOwed, uint64 claimableAt, uint256 nav);
    event RedemptionClaimed(uint256 indexed id, address indexed user, uint256 usdcOut);
    event RedemptionsFunded(address indexed from, uint256 amount);
    event ProceedsWithdrawn(address indexed to, uint256 amount);
    event SettlementDelaySet(uint256 delay);

    constructor(address usdc_, address rwa_, address oracle_, address admin, uint256 settlementDelay_) {
        usdc = IERC20(usdc_);
        rwa = RwaToken(rwa_);
        oracle = NavOracle(oracle_);
        usdcScale = 10 ** IERC20Metadata(usdc_).decimals();
        rwaScale = 10 ** RwaToken(rwa_).decimals();
        settlementDelay = settlementDelay_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    // --- conversions (decimals-explicit, round down) ---

    /// rwaUnits = usdcAmount * NAV_SCALE * rwaScale / (usdcScale * nav)
    function previewSubscribe(uint256 usdcAmount) public view returns (uint256) {
        uint256 nav = oracle.navChecked();
        return Math.mulDiv(usdcAmount, NAV_SCALE * rwaScale, usdcScale * nav);
    }

    /// usdcUnits = rwaAmount * nav * usdcScale / (rwaScale * NAV_SCALE)
    function previewRedeem(uint256 rwaAmount) public view returns (uint256) {
        uint256 nav = oracle.navChecked();
        return Math.mulDiv(rwaAmount, nav * usdcScale, rwaScale * NAV_SCALE);
    }

    // --- primary market ---

    function subscribe(uint256 usdcAmount) external nonReentrant returns (uint256 rwaOut) {
        require(usdcAmount > 0, "SM: zero");
        uint256 nav = oracle.navChecked();
        rwaOut = Math.mulDiv(usdcAmount, NAV_SCALE * rwaScale, usdcScale * nav);
        require(rwaOut > 0, "SM: dust");
        usdc.safeTransferFrom(msg.sender, address(this), usdcAmount);
        rwa.mint(msg.sender, rwaOut); // reverts if msg.sender is not KYC-verified
        emit Subscribed(msg.sender, usdcAmount, rwaOut, nav);
    }

    /// @notice Burn RWA now, lock USDC owed at current NAV, claimable after T+N.
    function requestRedemption(uint256 rwaAmount) external nonReentrant returns (uint256 id) {
        require(rwaAmount > 0, "SM: zero");
        uint256 nav = oracle.navChecked();
        uint256 usdcOwed = Math.mulDiv(rwaAmount, nav * usdcScale, rwaScale * NAV_SCALE);
        require(usdcOwed > 0, "SM: dust");
        rwa.burn(msg.sender, rwaAmount); // agent burn; reverts if balance/ frozen
        uint64 claimableAt = uint64(block.timestamp + settlementDelay);
        id = requests.length;
        requests.push(RedemptionRequest({user: msg.sender, usdcOwed: usdcOwed, claimableAt: claimableAt, claimed: false}));
        outstandingRedemptions += usdcOwed;
        emit RedemptionRequested(id, msg.sender, rwaAmount, usdcOwed, claimableAt, nav);
    }

    function claimRedemption(uint256 id) external nonReentrant {
        RedemptionRequest storage r = requests[id];
        require(r.user == msg.sender, "SM: not owner");
        require(!r.claimed, "SM: claimed");
        require(block.timestamp >= r.claimableAt, "SM: not settled");
        r.claimed = true;
        outstandingRedemptions -= r.usdcOwed;
        usdc.safeTransfer(msg.sender, r.usdcOwed);
        emit RedemptionClaimed(id, msg.sender, r.usdcOwed);
    }

    function requestsLength() external view returns (uint256) {
        return requests.length;
    }

    // --- issuer liquidity management ---

    /// @notice Top up USDC so queued redemptions can be paid.
    function fundRedemptions(uint256 amount) external {
        usdc.safeTransferFrom(msg.sender, address(this), amount);
        emit RedemptionsFunded(msg.sender, amount);
    }

    /// @notice Issuer deploys subscription proceeds off-chain into the real asset.
    /// @dev Cannot dip into the redemption reserve: the post-withdrawal balance
    /// must still cover all outstanding (queued, unclaimed) redemptions.
    function withdrawProceeds(address to, uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(usdc.balanceOf(address(this)) - amount >= outstandingRedemptions, "SM: would dip into redemption reserve");
        usdc.safeTransfer(to, amount);
        emit ProceedsWithdrawn(to, amount);
    }

    function setSettlementDelay(uint256 delay) external onlyRole(DEFAULT_ADMIN_ROLE) {
        settlementDelay = delay;
        emit SettlementDelaySet(delay);
    }
}
