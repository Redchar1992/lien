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
}
