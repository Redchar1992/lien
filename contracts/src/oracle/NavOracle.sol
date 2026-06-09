// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {INavSource} from "./INavSource.sol";

/// @title NavOracle
/// @notice Pushes the off-chain Net Asset Value of one whole RWA share on-chain.
/// `nav` is the value of 1 whole RWA token (10**rwaDecimals units) denominated in
/// the underlying currency (e.g. USD), 1e18-scaled. Yield accrues as NAV rises.
///
/// @dev For an RWA, the oracle *is* the asset's truth, so it carries more
/// responsibility than a DeFi price feed. Two guards:
///  - **staleness**: `navChecked()` reverts if the last update is older than
///    `maxStaleness` (a halted feed must not silently price positions).
///  - **circuit breaker**: `setNav` rejects a per-update move larger than
///    `maxDeviationBps` (fat-finger / compromised feed). A genuine large jump
///    goes through `forceSetNav` (admin), which is logged.
contract NavOracle is AccessControl, INavSource {
    bytes32 public constant ORACLE_ROLE = keccak256("ORACLE_ROLE");

    /// value of 1 whole RWA share, 1e18-scaled (e.g. $1.00 => 1e18)
    uint256 public nav;
    uint64 public updatedAt;
    uint64 public maxStaleness; // seconds
    uint256 public maxDeviationBps; // max per-update change, basis points
    bool public paused;

    event NavUpdated(uint256 nav, uint64 updatedAt, bool forced);
    event PausedSet(bool paused);
    event ParamsUpdated(uint64 maxStaleness, uint256 maxDeviationBps);

    constructor(address admin, uint256 initialNav, uint64 maxStaleness_, uint256 maxDeviationBps_) {
        require(initialNav > 0, "NAV: zero init");
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ORACLE_ROLE, admin);
        nav = initialNav;
        updatedAt = uint64(block.timestamp);
        maxStaleness = maxStaleness_;
        maxDeviationBps = maxDeviationBps_;
        emit NavUpdated(initialNav, updatedAt, true);
    }

    /// @notice Normal NAV update, bounded by the circuit breaker.
    function setNav(uint256 newNav) external onlyRole(ORACLE_ROLE) {
        require(newNav > 0, "NAV: zero");
        uint256 diff = newNav > nav ? newNav - nav : nav - newNav;
        require(diff * 10_000 <= nav * maxDeviationBps, "NAV: deviation too large");
        nav = newNav;
        updatedAt = uint64(block.timestamp);
        emit NavUpdated(newNav, updatedAt, false);
    }

    /// @notice Admin override for a genuine large NAV move; bypasses the breaker.
    function forceSetNav(uint256 newNav) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(newNav > 0, "NAV: zero");
        nav = newNav;
        updatedAt = uint64(block.timestamp);
        emit NavUpdated(newNav, updatedAt, true);
    }

    function setPaused(bool p) external onlyRole(DEFAULT_ADMIN_ROLE) {
        paused = p;
        emit PausedSet(p);
    }

    function setParams(uint64 maxStaleness_, uint256 maxDeviationBps_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        maxStaleness = maxStaleness_;
        maxDeviationBps = maxDeviationBps_;
        emit ParamsUpdated(maxStaleness_, maxDeviationBps_);
    }

    /// @notice NAV, reverting if paused or stale. Consumers MUST use this, not `nav`.
    function navChecked() public view override returns (uint256) {
        require(!paused, "NAV: paused");
        require(block.timestamp - updatedAt <= maxStaleness, "NAV: stale");
        return nav;
    }

    function isStale() external view returns (bool) {
        return paused || block.timestamp - updatedAt > maxStaleness;
    }
}
