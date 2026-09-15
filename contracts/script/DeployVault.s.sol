// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {LienVault} from "../src/vault/LienVault.sol";
import {IMorpho, MarketParams, Id} from "../src/morpho/interfaces/IMorpho.sol";
import {MarketParamsLib} from "../src/morpho/libraries/MarketParamsLib.sol";

/// @notice Deploy a new vault only. Never changes roles, NAV or caps on existing contracts.
/// Addresses are explicit inputs; only local / Base Sepolia chains are accepted.
contract DeployVault is Script {
    using MarketParamsLib for MarketParams;

    function run() external returns (LienVault vault) {
        require(block.chainid == 84532 || block.chainid == 31337, "testnet/local only");
        uint256 key = vm.envUint("PRIVATE_KEY");
        address admin = vm.addr(key);
        address usdc = vm.envAddress("ADDR_USDC");
        address engine = vm.envAddress("ADDR_MORPHO");
        MarketParams memory mp = MarketParams({
            loanToken: usdc,
            collateralToken: vm.envAddress("ADDR_RWA"),
            oracle: vm.envAddress("ADDR_ADAPTER"),
            irm: vm.envAddress("ADDR_IRM"),
            lltv: 0.86e18
        });
        require(usdc.code.length > 0 && engine.code.length > 0, "missing dependencies");
        require(IMorpho(engine).market(mp.id()).lastUpdate != 0, "market not created");
        uint256 seed = vm.envOr("VAULT_SEED_USDC", uint256(0));
        uint256 cap = vm.envOr("VAULT_CAP_USDC", uint256(20_000e6));
        require(seed <= 1_000e6, "demo seed limited to 1000 mock USDC");
        require(IERC20(usdc).balanceOf(admin) >= seed, "insufficient mock USDC");
        vm.startBroadcast(key);
        vault = new LienVault(usdc, engine, admin);
        vault.setCap(mp, cap);
        Id[] memory queue = new Id[](1); queue[0] = mp.id();
        vault.setSupplyQueue(queue);
        vault.setWithdrawQueue(queue);
        if (seed > 0) {
            IERC20(usdc).approve(address(vault), seed);
            vault.deposit(seed, admin);
        }
        vm.stopBroadcast();
        console2.log("ADDR_VAULT=%s", address(vault));
    }
}
