// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {INavSource} from "./INavSource.sol";
import {NavOracle} from "./NavOracle.sol";
import {AggregatorV3Interface} from "./AggregatorV3Interface.sol";

/// @title ChainlinkNavSource
/// @notice Production NAV source: read the asset's NAV from a Chainlink
/// AggregatorV3 feed (e.g. a fund-administrator NAV / RWA feed delivered via
/// Chainlink), normalized to lien's 1e18 convention. If the Chainlink feed is
/// stale, reverts, or reports a non-positive answer, fall back to the
/// keeper-pushed `NavOracle` (which carries its own staleness + circuit breaker).
/// If BOTH are unusable, `navChecked()` reverts → the market freezes (fail-closed).
///
/// This is how lien moves from a synthetic / keeper-only NAV to a real, attested
/// feed without giving up the keeper as a backstop. An RWA's NAV is an off-chain,
/// attested figure struck by the fund administrator — so the honest trust model is
/// "Chainlink-delivered primary + keeper fallback + staleness freeze", not
/// "trustless". `MorphoNavOracleAdapter` consumes this via the `INavSource` interface,
/// so swapping the synthetic keeper for this is a one-line deploy change.
contract ChainlinkNavSource is INavSource {
    AggregatorV3Interface public immutable feed;
    NavOracle public immutable fallbackOracle;
    uint256 public immutable maxStaleness; // seconds tolerated on the Chainlink feed
    uint8 public immutable feedDecimals;

    constructor(address feed_, address fallbackOracle_, uint256 maxStaleness_) {
        require(feed_ != address(0) && fallbackOracle_ != address(0), "nav: zero addr");
        feed = AggregatorV3Interface(feed_);
        fallbackOracle = NavOracle(fallbackOracle_);
        maxStaleness = maxStaleness_;
        feedDecimals = AggregatorV3Interface(feed_).decimals();
    }

    /// @inheritdoc INavSource
    /// @return NAV per whole share, 1e18-scaled. Chainlink primary; keeper fallback.
    function navChecked() external view returns (uint256) {
        (uint256 navWad, bool ok) = _readChainlink();
        if (ok) return navWad;
        return fallbackOracle.navChecked(); // reverts if the keeper feed is also stale/paused
    }

    /// @return true when the Chainlink feed is currently usable (positive + fresh).
    function chainlinkFresh() external view returns (bool) {
        (, bool ok) = _readChainlink();
        return ok;
    }

    function _readChainlink() internal view returns (uint256 navWad, bool ok) {
        try feed.latestRoundData() returns (uint80, int256 answer, uint256, uint256 updatedAt, uint80) {
            if (answer > 0 && updatedAt != 0 && block.timestamp - updatedAt <= maxStaleness) {
                return (_to1e18(uint256(answer)), true);
            }
        } catch {
            // a reverting feed is treated as unusable -> fall back
        }
        return (0, false);
    }

    /// Normalize a raw feed answer (feedDecimals) to the protocol's 1e18 scale.
    function _to1e18(uint256 raw) internal view returns (uint256) {
        if (feedDecimals == 18) return raw;
        if (feedDecimals < 18) return raw * (10 ** (18 - feedDecimals));
        return raw / (10 ** (feedDecimals - 18));
    }
}
