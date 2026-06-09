// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {NavOracle} from "../src/oracle/NavOracle.sol";
import {ChainlinkNavSource} from "../src/oracle/ChainlinkNavSource.sol";
import {MorphoNavOracleAdapter} from "../src/oracle/MorphoNavOracleAdapter.sol";
import {MockAggregatorV3} from "../src/mocks/MockAggregatorV3.sol";

/// Chainlink-primary NAV source with a keeper fallback: this is how lien connects
/// to a real attested NAV feed while keeping the keeper as a backstop.
contract ChainlinkNavSourceTest is Test {
    NavOracle keeper;
    MockAggregatorV3 feed;
    ChainlinkNavSource src;
    address admin = makeAddr("admin");

    uint256 constant FEED_STALE = 1 days;

    function setUp() public {
        vm.warp(1_700_000_000);
        vm.prank(admin);
        keeper = new NavOracle(admin, 1e18, 30 days, 2000); // keeper says NAV = $1.00
        feed = new MockAggregatorV3(8, 105_000_000, block.timestamp); // Chainlink says $1.05 (8-dec), fresh
        src = new ChainlinkNavSource(address(feed), address(keeper), FEED_STALE);
    }

    function test_uses_chainlink_when_fresh() public {
        assertEq(src.navChecked(), 1.05e18, "uses fresh Chainlink NAV, normalized to 1e18");
        assertTrue(src.chainlinkFresh());
    }

    function test_normalizes_18_decimal_feed() public {
        MockAggregatorV3 feed18 = new MockAggregatorV3(18, 1.05e18, block.timestamp);
        ChainlinkNavSource s = new ChainlinkNavSource(address(feed18), address(keeper), FEED_STALE);
        assertEq(s.navChecked(), 1.05e18);
    }

    function test_falls_back_to_keeper_when_chainlink_stale() public {
        feed.setAnswer(105_000_000, block.timestamp - 2 days); // older than FEED_STALE
        assertFalse(src.chainlinkFresh());
        assertEq(src.navChecked(), 1e18, "falls back to keeper $1.00");
    }

    function test_falls_back_when_chainlink_nonpositive() public {
        feed.setAnswer(0, block.timestamp);
        assertEq(src.navChecked(), 1e18);
        feed.setAnswer(-5, block.timestamp);
        assertEq(src.navChecked(), 1e18);
    }

    function test_reverts_when_both_unusable() public {
        feed.setAnswer(105_000_000, block.timestamp - 2 days); // Chainlink stale
        vm.prank(admin);
        keeper.setPaused(true); // keeper unusable too
        vm.expectRevert("NAV: paused");
        src.navChecked(); // both dead -> market freezes
    }

    function test_through_morpho_adapter() public {
        MorphoNavOracleAdapter adapter = new MorphoNavOracleAdapter(address(src), 18, 6);
        // price = navWad * 10**(18 + loanDec(6) - collDec(18)) = navWad * 1e6 ; navWad = 1.05e18
        assertEq(adapter.price(), 1.05e18 * 1e6);
    }
}
