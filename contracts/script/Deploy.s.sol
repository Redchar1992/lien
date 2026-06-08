// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";
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

/// @notice Deploys the full lien stack to a testnet and seeds a live demo.
/// Run: `forge script script/Deploy.s.sol --rpc-url base_sepolia --broadcast`
contract Deploy is Script {
    uint256 constant LLTV = 0.86e18;

    struct Sys {
        IdentityRegistry reg;
        RwaToken rwa;
        NavOracle oracle;
        MockERC20 usdc;
        SubscriptionManager mgr;
        IMorpho morpho;
        IrmMock irm;
        MorphoNavOracleAdapter adapter;
        LiquidationRouter router;
    }

    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);

        vm.startBroadcast(pk);
        Sys memory s = _deploy(deployer);
        MarketParams memory mp = _market(s);
        s.morpho.createMarket(mp);
        _kyc(s, deployer);
        _seed(s, mp, deployer);
        vm.stopBroadcast();

        _log(s);
    }

    function _deploy(address deployer) internal returns (Sys memory s) {
        s.reg = new IdentityRegistry(deployer);
        s.rwa = new RwaToken("Tokenized T-Bill", "tBILL", 18, address(s.reg), deployer);
        s.oracle = new NavOracle(deployer, 1e18, 30 days, 2000); // $1.00, 30d staleness, 20% breaker
        s.usdc = new MockERC20("USD Coin", "USDC", 6);
        s.mgr = new SubscriptionManager(address(s.usdc), address(s.rwa), address(s.oracle), deployer, 2 days);
        s.rwa.grantRole(s.rwa.AGENT_ROLE(), address(s.mgr));

        s.morpho = IMorpho(address(new Morpho(deployer)));
        s.irm = new IrmMock();
        s.adapter = new MorphoNavOracleAdapter(address(s.oracle), 18, 6);
        s.router = new LiquidationRouter(
            address(s.morpho), address(s.usdc), address(s.rwa), address(s.oracle), address(s.mgr), 6, 18, deployer
        );

        s.morpho.enableIrm(address(s.irm));
        s.morpho.enableLltv(LLTV);
    }

    function _market(Sys memory s) internal pure returns (MarketParams memory) {
        return MarketParams({
            loanToken: address(s.usdc),
            collateralToken: address(s.rwa),
            oracle: address(s.adapter),
            irm: address(s.irm),
            lltv: LLTV
        });
    }

    function _kyc(Sys memory s, address deployer) internal {
        // deployer (demo user) + engine + router (they custody the permissioned RWA)
        s.reg.registerIdentity(deployer, 840);
        s.reg.registerIdentity(address(s.morpho), 840);
        s.reg.registerIdentity(address(s.router), 840);
    }

    function _seed(Sys memory s, MarketParams memory mp, address deployer) internal {
        s.usdc.mint(deployer, 1_000_000e6);
        s.usdc.approve(address(s.morpho), type(uint256).max);
        s.usdc.approve(address(s.mgr), type(uint256).max);
        s.usdc.approve(address(s.router), type(uint256).max);

        s.morpho.supply(mp, 200_000e6, 0, deployer, ""); // market USDC liquidity
        s.mgr.subscribe(20_000e6); // deployer -> 20,000 tBILL @ $1 (keeps 10k in wallet)
        s.rwa.approve(address(s.morpho), type(uint256).max);
        s.morpho.supplyCollateral(mp, 10_000e18, deployer, ""); // post 10k as collateral
        s.morpho.borrow(mp, 6_000e6, 0, deployer, deployer); // borrow 6,000 USDC (HF healthy)
        s.router.fund(50_000e6); // liquidation buffer
        s.mgr.fundRedemptions(50_000e6); // redemption liquidity
    }

    function _log(Sys memory s) internal pure {
        console2.log("ADDR_USDC=%s", address(s.usdc));
        console2.log("ADDR_RWA=%s", address(s.rwa));
        console2.log("ADDR_IDENTITY_REGISTRY=%s", address(s.reg));
        console2.log("ADDR_NAV_ORACLE=%s", address(s.oracle));
        console2.log("ADDR_SUBSCRIPTION_MANAGER=%s", address(s.mgr));
        console2.log("ADDR_MORPHO=%s", address(s.morpho));
        console2.log("ADDR_ADAPTER=%s", address(s.adapter));
        console2.log("ADDR_IRM=%s", address(s.irm));
        console2.log("ADDR_LIQUIDATION_ROUTER=%s", address(s.router));
    }
}
