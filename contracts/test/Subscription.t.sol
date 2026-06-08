// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {IdentityRegistry} from "../src/compliance/IdentityRegistry.sol";
import {RwaToken} from "../src/rwa/RwaToken.sol";
import {NavOracle} from "../src/oracle/NavOracle.sol";
import {SubscriptionManager} from "../src/rwa/SubscriptionManager.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";

contract SubscriptionTest is Test {
    IdentityRegistry reg;
    RwaToken rwa;
    NavOracle oracle;
    SubscriptionManager mgr;
    MockERC20 usdc;

    address admin = makeAddr("admin");
    address alice = makeAddr("alice");
    address mallory = makeAddr("mallory"); // not KYC'd

    uint16 constant US = 840;
    uint256 constant PAR = 1e18; // NAV $1.00
    uint64 constant MAX_STALE = 1 days;
    uint256 constant MAX_DEV_BPS = 1000; // 10%
    uint256 constant SETTLE = 2 days;

    function setUp() public {
        vm.startPrank(admin);
        reg = new IdentityRegistry(admin);
        rwa = new RwaToken("Tokenized T-Bill", "tBILL", 18, address(reg), admin);
        oracle = new NavOracle(admin, PAR, MAX_STALE, MAX_DEV_BPS);
        usdc = new MockERC20("USD Coin", "USDC", 6); // <-- 6 decimals on purpose
        mgr = new SubscriptionManager(address(usdc), address(rwa), address(oracle), admin, SETTLE);

        // manager needs agent power to mint/burn RWA
        rwa.grantRole(rwa.AGENT_ROLE(), address(mgr));

        reg.registerIdentity(alice, US);
        usdc.mint(alice, 1_000e6); // alice has 1,000 USDC
        usdc.mint(admin, 1_000e6);
        vm.stopPrank();

        // issuer seeds redemption liquidity
        vm.startPrank(admin);
        usdc.approve(address(mgr), type(uint256).max);
        mgr.fundRedemptions(1_000e6);
        vm.stopPrank();

        vm.prank(alice);
        usdc.approve(address(mgr), type(uint256).max);
    }

    // --- the decimals drill: 6-dec USDC <-> 18-dec RWA <-> 1e18 NAV ---

    function test_decimals_exact_at_par() public {
        // $1 of USDC (1e6) at NAV $1.00 must mint exactly 1 whole RWA (1e18).
        vm.prank(alice);
        uint256 out = mgr.subscribe(1e6);
        assertEq(out, 1e18, "1 USDC -> 1 RWA at par");
        assertEq(rwa.balanceOf(alice), 1e18);
    }

    function test_subscribe_100_usdc_at_par() public {
        vm.prank(alice);
        uint256 out = mgr.subscribe(100e6);
        assertEq(out, 100e18); // 100 USDC -> 100 RWA
        assertEq(usdc.balanceOf(alice), 900e6);
    }

    function test_subscribe_at_premium_nav() public {
        vm.prank(admin);
        oracle.setNav(105e16); // NAV $1.05 (+5%, within 10% breaker)
        vm.prank(alice);
        uint256 out = mgr.subscribe(100e6);
        // 100 / 1.05 = 95.238... RWA
        assertApproxEqRel(out, 95.238e18, 1e15); // 0.1%
        assertLt(out, 100e18);
    }

    function test_redeem_exact_round_trip_at_par() public {
        vm.prank(alice);
        mgr.subscribe(100e6); // 100 RWA
        vm.prank(alice);
        uint256 id = mgr.requestRedemption(100e18);
        assertEq(rwa.balanceOf(alice), 0, "RWA burned at request");

        // cannot claim before settlement
        vm.prank(alice);
        vm.expectRevert("SM: not settled");
        mgr.claimRedemption(id);

        vm.warp(block.timestamp + SETTLE);
        vm.prank(alice);
        mgr.claimRedemption(id);
        assertEq(usdc.balanceOf(alice), 1_000e6, "got 100 USDC back at par");
    }

    function test_redemption_locks_nav_at_request_time() public {
        vm.prank(alice);
        mgr.subscribe(100e6); // 100 RWA at $1.00
        vm.prank(alice);
        uint256 id = mgr.requestRedemption(100e18); // locks 100 USDC owed

        // NAV rises after the request — claim must still pay the locked amount
        vm.prank(admin);
        oracle.setNav(105e16);
        vm.warp(block.timestamp + SETTLE);

        vm.prank(alice);
        mgr.claimRedemption(id);
        assertEq(usdc.balanceOf(alice), 1_000e6); // 900 left + 100 back, NOT 105
    }

    function test_yield_via_nav_appreciation() public {
        vm.prank(alice);
        mgr.subscribe(100e6); // 100 RWA at $1.00
        // NAV appreciates to $1.05 (T-bill yield)
        vm.prank(admin);
        oracle.setNav(105e16);
        // redeeming 100 RWA now yields 105 USDC
        vm.prank(alice);
        uint256 id = mgr.requestRedemption(100e18);
        vm.warp(block.timestamp + SETTLE);
        vm.prank(alice);
        mgr.claimRedemption(id);
        assertEq(usdc.balanceOf(alice), 1_005e6); // 900 + 105
    }

    // --- oracle guards ---

    function test_subscribe_reverts_when_nav_stale() public {
        vm.warp(block.timestamp + MAX_STALE + 1);
        vm.prank(alice);
        vm.expectRevert("NAV: stale");
        mgr.subscribe(100e6);
    }

    function test_circuit_breaker_rejects_large_move() public {
        vm.prank(admin);
        vm.expectRevert("NAV: deviation too large");
        oracle.setNav(120e16); // +20% > 10% breaker
    }

    function test_force_set_nav_bypasses_breaker() public {
        vm.prank(admin);
        oracle.forceSetNav(120e16); // admin override
        assertEq(oracle.nav(), 120e16);
    }

    function test_paused_oracle_blocks_subscribe() public {
        vm.prank(admin);
        oracle.setPaused(true);
        vm.prank(alice);
        vm.expectRevert("NAV: paused");
        mgr.subscribe(100e6);
    }

    // --- compliance still enforced through the primary market ---

    function test_non_kyc_cannot_subscribe() public {
        vm.startPrank(admin);
        usdc.mint(mallory, 100e6);
        vm.stopPrank();
        vm.startPrank(mallory);
        usdc.approve(address(mgr), type(uint256).max);
        vm.expectRevert("RWA: recipient not verified");
        mgr.subscribe(100e6);
        vm.stopPrank();
    }

    // --- redemption reserve is protected from withdrawProceeds ---

    function test_withdrawProceeds_cannot_dip_into_redemption_reserve() public {
        vm.prank(alice);
        mgr.subscribe(100e6);
        vm.prank(alice);
        mgr.requestRedemption(100e18); // outstandingRedemptions = 100e6
        assertEq(mgr.outstandingRedemptions(), 100e6);
        // mgr holds 1000 (funded in setUp) + 100 (subscribe) = 1100; reserve = 100
        vm.prank(admin);
        vm.expectRevert("SM: would dip into redemption reserve");
        mgr.withdrawProceeds(admin, 1001e6); // would leave 99 < 100
    }

    function test_withdrawProceeds_up_to_reserve_ok() public {
        vm.prank(alice);
        mgr.subscribe(100e6);
        vm.prank(alice);
        mgr.requestRedemption(100e18);
        uint256 bal = usdc.balanceOf(address(mgr));
        vm.prank(admin);
        mgr.withdrawProceeds(admin, bal - 100e6); // leaves exactly the 100 reserve
        assertEq(usdc.balanceOf(address(mgr)), 100e6);
    }
}
