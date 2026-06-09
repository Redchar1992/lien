// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title INavSource
/// @notice A source of the RWA's NAV (value per whole share), 1e18-scaled.
/// @dev Implementations MUST revert from `navChecked()` when the value is
/// unusable (stale / paused / unavailable) so consumers fail CLOSED — the market
/// freezes rather than pricing positions off a dead feed.
interface INavSource {
    function navChecked() external view returns (uint256 navWad);
}
