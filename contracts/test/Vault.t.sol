// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {IdentityRegistry} from "../src/compliance/IdentityRegistry.sol";
import {RwaToken} from "../src/rwa/RwaToken.sol";
import {NavOracle} from "../src/oracle/NavOracle.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";
import {MorphoNavOracleAdapter} from "../src/oracle/MorphoNavOracleAdapter.sol";
import {LienVault} from "../src/vault/LienVault.sol";
import {Morpho} from "../src/morpho/Morpho.sol";
import {IMorpho, MarketParams, Id, Position} from "../src/morpho/interfaces/IMorpho.sol";
import {MarketParamsLib} from "../src/morpho/libraries/MarketParamsLib.sol";
import {IrmMock} from "../src/morpho/mocks/IrmMock.sol";

/// Curated ERC-4626 vault that lends depositors' USDC into the isolated RWA
/// market. The vault is a USDC lender — it never touches the permissioned RWA.
contract VaultTest is Test {
    using MarketParamsLib for MarketParams;

    IdentityRegistry reg;
    RwaToken rwa;
    NavOracle oracle;
    MockERC20 usdc;
    MorphoNavOracleAdapter adapter;
    IMorpho morpho;
    IrmMock irm;
    LienVault vault;

    MarketParams mp;
    Id id;

    address admin = makeAddr("admin");
    address alice = makeAddr("alice"); // borrower (KYC'd)
    address lp = makeAddr("lp"); // vault depositor (no KYC — supplies USDC only)

    uint16 constant US = 840;
    uint256 constant LLTV = 0.86e18;

    function setUp() public {
        vm.startPrank(admin);
        reg = new IdentityRegistry(admin);
        rwa = new RwaToken("Tokenized T-Bill", "tBILL", 18, address(reg), admin);
        oracle = new NavOracle(admin, 1e18, 30 days, 2000);
        usdc = new MockERC20("USD Coin", "USDC", 6);

        morpho = IMorpho(address(new Morpho(admin)));
        irm = new IrmMock();
        adapter = new MorphoNavOracleAdapter(address(oracle), 18, 6);
        mp = MarketParams({
            loanToken: address(usdc),
            collateralToken: address(rwa),
            oracle: address(adapter),
            irm: address(irm),
            lltv: LLTV
        });
        id = mp.id();
        morpho.enableIrm(address(irm));
        morpho.enableLltv(LLTV);
        morpho.createMarket(mp);

        reg.registerIdentity(alice, US);
        reg.registerIdentity(address(morpho), US);

        vault = new LienVault(address(usdc), address(morpho), admin);
        vault.setCap(mp, type(uint256).max);
        Id[] memory q = new Id[](1);
        q[0] = id;
        vault.setSupplyQueue(q);
        vault.setWithdrawQueue(q);

        rwa.mint(alice, 10_000e18);
        usdc.mint(lp, 100_000e6);
        vm.stopPrank();

        vm.prank(lp);
        usdc.approve(address(vault), type(uint256).max);
    }

    function test_deposit_allocates_to_market() public {
        vm.prank(lp);
        vault.deposit(100_000e6, lp);
        assertApproxEqAbs(vault.vaultSupplyAssets(id), 100_000e6, 1, "supplied into market");
        assertEq(usdc.balanceOf(address(vault)), 0, "no idle");
        assertApproxEqAbs(vault.totalAssets(), 100_000e6, 1);
        assertGt(vault.balanceOf(lp), 0, "lp got shares");
    }

    function test_respects_supply_cap() public {
        vm.prank(admin);
        vault.setCap(mp, 50_000e6);
        vm.prank(lp);
        vault.deposit(100_000e6, lp);
        assertApproxEqAbs(vault.vaultSupplyAssets(id), 50_000e6, 1, "capped at 50k");
        assertApproxEqAbs(usdc.balanceOf(address(vault)), 50_000e6, 1, "rest stays idle");
        assertApproxEqAbs(vault.totalAssets(), 100_000e6, 2);
    }

    function test_withdraw_pulls_from_market() public {
        vm.prank(lp);
        vault.deposit(100_000e6, lp);
        vm.prank(lp);
        vault.withdraw(40_000e6, lp, lp);
        assertEq(usdc.balanceOf(lp), 40_000e6);
        assertApproxEqAbs(vault.totalAssets(), 60_000e6, 2);
    }

    function test_yield_accrues_to_depositor() public {
        vm.prank(lp);
        vault.deposit(100_000e6, lp); // vault supplies 100k to the market

        // alice borrows -> utilization -> interest accrues to the supplier (vault)
        vm.startPrank(alice);
        rwa.approve(address(morpho), type(uint256).max);
        morpho.supplyCollateral(mp, 10_000e18, alice, "");
        morpho.borrow(mp, 6_000e6, 0, alice, alice);
        vm.stopPrank();

        vm.warp(block.timestamp + 30 days);
        assertGt(vault.totalAssets(), 100_000e6, "yield visible in totalAssets");

        // alice repays in full so the market regains liquidity for the vault to exit
        vm.prank(admin);
        usdc.mint(alice, 7_000e6);
        vm.startPrank(alice);
        usdc.approve(address(morpho), type(uint256).max);
        Position memory p = morpho.position(id, alice);
        morpho.repay(mp, 0, p.borrowShares, alice, "");
        vm.stopPrank();

        uint256 shares = vault.balanceOf(lp);
        vm.prank(lp);
        vault.redeem(shares, lp, lp);
        assertGt(usdc.balanceOf(lp), 100_000e6, "lp redeemed more than deposited (yield)");
    }
    function _borrow(uint256 assets) internal {
        vm.startPrank(alice);
        rwa.approve(address(morpho), type(uint256).max);
        morpho.supplyCollateral(mp, 10_000e18, alice, "");
        morpho.borrow(mp, assets, 0, alice, alice);
        vm.stopPrank();
    }

    function test_limits_follow_cash_not_book_assets() public {
        vm.prank(lp);
        vault.deposit(10_000e6, lp);
        _borrow(8_000e6);
        assertEq(vault.totalAssets(), 10_000e6);
        assertEq(vault.availableLiquidity(), 2_000e6);
        assertEq(vault.maxWithdraw(lp), 2_000e6);
        assertEq(vault.maxRedeem(lp), 2_000e6);
        uint256 beforeShares = vault.balanceOf(lp);
        vm.prank(lp);
        vm.expectRevert();
        vault.withdraw(2_000e6 + 1, lp, lp);
        assertEq(vault.balanceOf(lp), beforeShares, "failed exit preserves shares");
        uint256 maxAssets = vault.maxWithdraw(lp);
        vm.prank(lp);
        vault.withdraw(maxAssets, lp, lp);
        assertEq(vault.maxWithdraw(lp), 0);
        assertEq(vault.balanceOf(lp), 8_000e6);
    }

    function test_withdraw_falls_through_illiquid_market_to_next_market() public {
        MarketParams memory second = mp;
        vm.startPrank(admin);
        second.irm = address(new IrmMock());
        morpho.enableIrm(second.irm);
        morpho.createMarket(second);
        vault.setCap(mp, 10_000e6);
        vault.setCap(second, 10_000e6);
        Id[] memory q = new Id[](2);
        q[0] = id; q[1] = second.id();
        vault.setSupplyQueue(q);
        vault.setWithdrawQueue(q);
        vm.stopPrank();
        vm.prank(lp);
        vault.deposit(20_000e6, lp);
        _borrow(8_000e6);
        assertEq(vault.maxWithdraw(lp), 12_000e6);
        vm.prank(lp);
        vault.withdraw(12_000e6, lp, lp);
        assertEq(vault.vaultSupplyAssets(id), 8_000e6);
        assertEq(vault.vaultSupplyAssets(second.id()), 0);
    }

    function test_duplicate_withdraw_markets_rejected() public {
        Id[] memory q = new Id[](2); q[0] = id; q[1] = id;
        vm.prank(admin);
        vm.expectRevert("vault: duplicate market");
        vault.setWithdrawQueue(q);
    }

    function test_idle_can_exit_when_market_cash_exhausted() public {
        vm.prank(admin);
        vault.setCap(mp, 8_000e6);
        vm.prank(lp);
        vault.deposit(10_000e6, lp);
        _borrow(8_000e6);
        assertEq(vault.maxWithdraw(lp), 2_000e6);
        uint256 maxShares = vault.maxRedeem(lp);
        vm.prank(lp);
        vault.redeem(maxShares, lp, lp);
        assertEq(vault.balanceOf(lp), 8_000e6);
    }

    function testFuzz_deposit_redeem_no_free_assets(uint96 raw) public {
        uint256 assets = bound(uint256(raw), 1, 100_000e6);
        uint256 before = usdc.balanceOf(lp);
        vm.startPrank(lp);
        uint256 expected = vault.previewDeposit(assets);
        uint256 minted = vault.deposit(assets, lp);
        assertEq(minted, expected);
        uint256 received = vault.redeem(minted, lp, lp);
        vm.stopPrank();
        assertLe(received, assets);
        assertLe(usdc.balanceOf(lp), before);
        assertEq(vault.balanceOf(lp), 0);
    }

}
