// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {IdentityRegistry} from "../src/compliance/IdentityRegistry.sol";
import {RwaToken} from "../src/rwa/RwaToken.sol";
import {NavOracle} from "../src/oracle/NavOracle.sol";
import {SubscriptionManager} from "../src/rwa/SubscriptionManager.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";
import {MorphoNavOracleAdapter} from "../src/oracle/MorphoNavOracleAdapter.sol";
import {LiquidationRouter} from "../src/market/LiquidationRouter.sol";
import {Morpho} from "../src/morpho/Morpho.sol";
import {IMorpho, MarketParams} from "../src/morpho/interfaces/IMorpho.sol";
import {IrmMock} from "../src/morpho/mocks/IrmMock.sol";

/// Full RWA-collateral lending market: subscribe → supply collateral → borrow →
/// NAV drops → liquidate. Proves the permissioned-collateral liquidation problem
/// and the router solution.
contract MarketTest is Test {
    IdentityRegistry reg;
    RwaToken rwa;
    NavOracle oracle;
    SubscriptionManager mgr;
    MockERC20 usdc;
    MorphoNavOracleAdapter adapter;
    LiquidationRouter router;
    IMorpho morpho;
    IrmMock irm;

    MarketParams mp;

    address admin = makeAddr("admin");
    address alice = makeAddr("alice"); // borrower (KYC'd)
    address supplier = makeAddr("supplier"); // USDC LP (no KYC needed)
    address keeper = makeAddr("keeper"); // KYC'd liquidator (design 1)
    address mallory = makeAddr("mallory"); // non-KYC liquidator (uses router, design 2)

    uint16 constant US = 840;
    uint256 constant PAR = 1e18;
    uint256 constant LLTV = 0.86e18;

    function setUp() public {
        vm.startPrank(admin);
        reg = new IdentityRegistry(admin);
        rwa = new RwaToken("Tokenized T-Bill", "tBILL", 18, address(reg), admin);
        oracle = new NavOracle(admin, PAR, 30 days, 2000); // 30d staleness, 20% breaker
        usdc = new MockERC20("USD Coin", "USDC", 6);
        mgr = new SubscriptionManager(address(usdc), address(rwa), address(oracle), admin, 2 days);
        rwa.grantRole(rwa.AGENT_ROLE(), address(mgr));

        morpho = IMorpho(address(new Morpho(admin)));
        irm = new IrmMock();
        adapter = new MorphoNavOracleAdapter(address(oracle), 18, 6); // collDec=18, loanDec=6
        router =
            new LiquidationRouter(address(morpho), address(usdc), address(rwa), address(oracle), address(mgr), 6, 18, admin);

        morpho.enableIrm(address(irm));
        morpho.enableLltv(LLTV);
        mp = MarketParams({
            loanToken: address(usdc),
            collateralToken: address(rwa),
            oracle: address(adapter),
            irm: address(irm),
            lltv: LLTV
        });
        morpho.createMarket(mp);

        // KYC: borrower, KYC keeper, the engine and the router (both must hold RWA)
        reg.registerIdentity(alice, US);
        reg.registerIdentity(keeper, US);
        reg.registerIdentity(address(morpho), US);
        reg.registerIdentity(address(router), US);
        // mallory intentionally NOT registered

        // mint balances
        rwa.mint(alice, 1_000e18); // alice's RWA collateral
        usdc.mint(supplier, 100_000e6);
        usdc.mint(admin, 50_000e6);
        usdc.mint(keeper, 10_000e6);
        vm.stopPrank();

        // supplier provides USDC liquidity to the market
        vm.startPrank(supplier);
        usdc.approve(address(morpho), type(uint256).max);
        morpho.supply(mp, 50_000e6, 0, supplier, "");
        vm.stopPrank();

        // alice posts 1,000 RWA collateral and borrows 800 USDC (maxBorrow = 860 @ par)
        vm.startPrank(alice);
        rwa.approve(address(morpho), type(uint256).max);
        morpho.supplyCollateral(mp, 1_000e18, alice, "");
        morpho.borrow(mp, 800e6, 0, alice, alice);
        vm.stopPrank();

        // fund the router's USDC buffer + seed manager redemption liquidity
        vm.startPrank(admin);
        usdc.approve(address(router), type(uint256).max);
        router.fund(10_000e6);
        usdc.approve(address(mgr), type(uint256).max);
        mgr.fundRedemptions(10_000e6);
        vm.stopPrank();
    }

    function _makeLiquidatable() internal {
        // NAV $1.00 -> $0.90: collateral 1000*0.9=$900, maxBorrow 900*0.86=$774 < $800 debt
        vm.prank(admin);
        oracle.forceSetNav(0.9e18);
    }

    // --- adapter decimals (the factor I kept missing) ---

    function test_adapter_price_decimals_factor() public view {
        // price = navWad * 10**(18 + loanDec(6) - collDec(18)) = navWad * 1e6
        assertEq(adapter.price(), PAR * 1e6);
    }

    // --- sanity ---

    function test_borrow_succeeded() public view {
        assertEq(usdc.balanceOf(alice), 800e6);
    }

    function test_cannot_liquidate_healthy_position() public {
        // still at par => healthy
        vm.prank(keeper);
        usdc.approve(address(morpho), type(uint256).max);
        vm.prank(keeper);
        vm.expectRevert();
        morpho.liquidate(mp, alice, 400e18, 0, "");
    }

    // --- the permissioned-collateral problem ---

    function test_direct_liquidation_by_non_kyc_reverts() public {
        _makeLiquidatable();
        vm.startPrank(mallory);
        usdc.mint(mallory, 10_000e6); // even with capital...
        usdc.approve(address(morpho), type(uint256).max);
        // ...the engine cannot send seized RWA to a non-verified address
        vm.expectRevert();
        morpho.liquidate(mp, alice, 400e18, 0, "");
        vm.stopPrank();
    }

    // --- design 1: KYC'd keeper can liquidate directly ---

    function test_direct_liquidation_by_kyc_keeper_succeeds() public {
        _makeLiquidatable();
        vm.startPrank(keeper);
        usdc.approve(address(morpho), type(uint256).max);
        morpho.liquidate(mp, alice, 400e18, 0, "");
        vm.stopPrank();
        assertEq(rwa.balanceOf(keeper), 400e18, "keeper received seized RWA");
    }

    // --- design 2: router lets a non-KYC, capital-free keeper liquidate ---

    function test_router_liquidation_by_non_kyc_keeper_succeeds() public {
        _makeLiquidatable();
        uint256 malloryBefore = usdc.balanceOf(mallory); // 0

        vm.prank(mallory);
        (uint256 seized, uint256 repaid) = router.liquidate(mp, alice, 400e18);

        assertEq(seized, 400e18, "seized exactly requested");
        assertGt(repaid, 0);
        // router took the RWA onto its book...
        assertEq(rwa.balanceOf(address(router)), 400e18, "router holds seized RWA");
        // ...and paid mallory the incentive in USDC, no KYC, no capital
        uint256 profit = usdc.balanceOf(mallory) - malloryBefore;
        assertGt(profit, 0, "keeper paid incentive in USDC");
        // seizedValue @ NAV 0.9 = $360; profit ~= 360 - repaid
        assertApproxEqAbs(profit, 360e6 - repaid, 1);
    }

    function test_router_inventory_redemption_refills_buffer() public {
        _makeLiquidatable();
        vm.prank(mallory);
        router.liquidate(mp, alice, 400e18); // router now holds 400 RWA

        uint256 usdcBefore = usdc.balanceOf(address(router));
        vm.prank(admin);
        uint256 id = router.redeemInventory(400e18); // burns RWA, queues USDC @ NAV 0.9 = $360
        assertEq(rwa.balanceOf(address(router)), 0, "inventory burned into redemption");

        vm.warp(block.timestamp + 2 days);
        vm.prank(admin);
        router.claimInventory(id);
        assertEq(usdc.balanceOf(address(router)) - usdcBefore, 360e6, "buffer refilled at request NAV");
    }

    // --- fail-safe: stale NAV freezes the market ---

    function test_stale_nav_blocks_liquidation() public {
        _makeLiquidatable();
        vm.warp(block.timestamp + 31 days); // NAV now older than 30d staleness
        vm.prank(mallory);
        vm.expectRevert(); // adapter.price() -> navChecked() reverts "NAV: stale"
        router.liquidate(mp, alice, 400e18);
    }
}
