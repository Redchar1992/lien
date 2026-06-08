// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20, IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {IMorpho, MarketParams, Id} from "../morpho/interfaces/IMorpho.sol";
import {MarketParamsLib} from "../morpho/libraries/MarketParamsLib.sol";
import {MorphoBalancesLib} from "../morpho/libraries/periphery/MorphoBalancesLib.sol";

/// @title LienVault
/// @notice A curated ERC-4626 vault over USDC that allocates depositors' capital
/// across multiple isolated RWA lending markets, subject to per-market supply
/// caps — a faithful, focused subset of MetaMorpho / Morpho Vaults. Depositors
/// get diversified, risk-capped exposure to tokenized-asset lending yield without
/// picking markets themselves; a curator sets the caps and the allocation order.
///
/// The vault is a USDC *lender* into the markets — it never touches the
/// permissioned RWA collateral, so it needs no KYC. Yield accrues as the markets'
/// borrowers pay interest (reflected in `totalAssets`).
///
/// @dev Simplifications vs production MetaMorpho (documented, not hidden):
/// no timelock on cap changes, no performance fee, no pending-config flow, and
/// withdrawal assumes sufficient market liquidity along the withdraw queue.
/// Inflation-attack protection is inherited from OZ ERC4626 (virtual assets).
contract LienVault is ERC4626, AccessControl {
    using SafeERC20 for IERC20;
    using MarketParamsLib for MarketParams;

    bytes32 public constant CURATOR_ROLE = keccak256("CURATOR_ROLE");

    IMorpho public immutable morpho;

    struct MarketConfig {
        bool enabled;
        uint256 cap; // max assets the vault will supply into this market
    }

    mapping(Id => MarketConfig) public config;
    mapping(Id => MarketParams) public marketParamsOf;
    Id[] public markets; // every configured market (for totalAssets)
    Id[] public supplyQueue; // allocation order on deposit
    Id[] public withdrawQueue; // de-allocation order on withdraw

    event CapSet(Id indexed id, uint256 cap);
    event SupplyQueueSet(uint256 length);
    event WithdrawQueueSet(uint256 length);

    constructor(address usdc_, address morpho_, address admin)
        ERC20("Lien RWA Yield Vault", "lienUSDC")
        ERC4626(IERC20(usdc_))
    {
        morpho = IMorpho(morpho_);
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(CURATOR_ROLE, admin);
        IERC20(usdc_).forceApprove(morpho_, type(uint256).max);
    }

    // --- curation ---

    /// @notice Add/adjust a market's supply cap. Registers the market on first use.
    function setCap(MarketParams memory marketParams, uint256 cap) external onlyRole(CURATOR_ROLE) {
        require(marketParams.loanToken == asset(), "vault: loan token != asset");
        Id id = marketParams.id();
        if (!config[id].enabled) {
            config[id].enabled = true;
            marketParamsOf[id] = marketParams;
            markets.push(id);
        }
        config[id].cap = cap;
        emit CapSet(id, cap);
    }

    function setSupplyQueue(Id[] calldata queue) external onlyRole(CURATOR_ROLE) {
        for (uint256 i; i < queue.length; ++i) require(config[queue[i]].enabled, "vault: market not enabled");
        supplyQueue = queue;
        emit SupplyQueueSet(queue.length);
    }

    function setWithdrawQueue(Id[] calldata queue) external onlyRole(CURATOR_ROLE) {
        for (uint256 i; i < queue.length; ++i) require(config[queue[i]].enabled, "vault: market not enabled");
        withdrawQueue = queue;
        emit WithdrawQueueSet(queue.length);
    }

    // --- accounting ---

    /// @return the vault's supplied assets in one market (interest-accrued).
    function vaultSupplyAssets(Id id) public view returns (uint256) {
        return MorphoBalancesLib.expectedSupplyAssets(morpho, marketParamsOf[id], address(this));
    }

    /// @inheritdoc ERC4626
    function totalAssets() public view override returns (uint256) {
        uint256 total = IERC20(asset()).balanceOf(address(this)); // idle
        uint256 len = markets.length;
        for (uint256 i; i < len; ++i) {
            total += vaultSupplyAssets(markets[i]);
        }
        return total;
    }

    // --- allocation hooks ---

    function _deposit(address caller, address receiver, uint256 assets, uint256 shares) internal override {
        super._deposit(caller, receiver, assets, shares); // pull USDC, mint shares
        _allocate(assets);
    }

    function _withdraw(address caller, address receiver, address owner, uint256 assets, uint256 shares)
        internal
        override
    {
        _deallocate(assets); // pull enough USDC back into the vault first
        super._withdraw(caller, receiver, owner, assets, shares);
    }

    /// Supply along the supply queue, respecting each market's cap. Leftover stays
    /// idle in the vault (still counted by totalAssets).
    function _allocate(uint256 assets) internal {
        uint256 remaining = assets;
        uint256 len = supplyQueue.length;
        for (uint256 i; i < len && remaining > 0; ++i) {
            Id id = supplyQueue[i];
            uint256 supplied = vaultSupplyAssets(id);
            uint256 cap = config[id].cap;
            if (supplied >= cap) continue;
            uint256 toSupply = Math.min(remaining, cap - supplied);
            if (toSupply == 0) continue;
            morpho.supply(marketParamsOf[id], toSupply, 0, address(this), "");
            remaining -= toSupply;
        }
    }

    /// Ensure the vault holds at least `assets` idle USDC, pulling from markets
    /// along the withdraw queue as needed.
    function _deallocate(uint256 assets) internal {
        uint256 idle = IERC20(asset()).balanceOf(address(this));
        if (idle >= assets) return;
        uint256 need = assets - idle;
        uint256 len = withdrawQueue.length;
        for (uint256 i; i < len && need > 0; ++i) {
            Id id = withdrawQueue[i];
            uint256 supplied = vaultSupplyAssets(id);
            uint256 toWithdraw = Math.min(need, supplied);
            if (toWithdraw == 0) continue;
            (uint256 withdrawn,) = morpho.withdraw(marketParamsOf[id], toWithdraw, 0, address(this), address(this));
            need -= withdrawn;
        }
        require(need == 0, "vault: insufficient market liquidity");
    }

    function marketsLength() external view returns (uint256) {
        return markets.length;
    }

    // --- AccessControl + ERC4626 both define supportsInterface via ERC165 ---
    function supportsInterface(bytes4 interfaceId) public view override(AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
