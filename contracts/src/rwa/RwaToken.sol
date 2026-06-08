// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IIdentityRegistry} from "../compliance/IIdentityRegistry.sol";

/// @title RwaToken
/// @notice Permissioned ERC-20 representing shares of a tokenized real-world
/// asset (e.g. a T-bill fund). Every holder MUST be KYC-verified in the
/// IdentityRegistry; transfers to unverified or frozen accounts revert.
///
/// @dev Honesty note on centralization: the AGENT powers below
/// (mint/burn/freeze/forceTransfer/recover) are deliberate. RWA issuance is
/// legally required to support freezing (sanctions / court orders) and forced
/// recovery (lost keys, fraud, estate transfer) — a permissionless token cannot
/// be a compliant security. The trade-off is mitigated by (a) assigning
/// AGENT_ROLE to a multisig/timelock at deployment, and (b) every privileged
/// action emitting an auditable event. This is a faithful subset of ERC-3643
/// (T-REX): identity registry + transfer restrictions + agent operations.
contract RwaToken is ERC20, AccessControl {
    bytes32 public constant AGENT_ROLE = keccak256("AGENT_ROLE");

    IIdentityRegistry public identityRegistry;
    mapping(address => bool) public frozen;

    uint8 private immutable _customDecimals;

    /// Set only for the duration of an agent-forced move (forceTransfer/recover)
    /// so the frozen-`from` guard is bypassed while recipient KYC is still enforced.
    bool private _forcing;

    event AddressFrozen(address indexed account, bool frozen);
    event ForcedTransfer(address indexed from, address indexed to, uint256 amount);
    event Recovered(address indexed lostWallet, address indexed newWallet, uint256 amount);
    event IdentityRegistryUpdated(address indexed registry);

    constructor(
        string memory name_,
        string memory symbol_,
        uint8 decimals_,
        address registry,
        address admin
    ) ERC20(name_, symbol_) {
        require(registry != address(0), "RWA: zero registry");
        _customDecimals = decimals_;
        identityRegistry = IIdentityRegistry(registry);
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(AGENT_ROLE, admin);
        emit IdentityRegistryUpdated(registry);
    }

    function decimals() public view override returns (uint8) {
        return _customDecimals;
    }

    // --- compliance hook (OZ v5 routes mint/burn/transfer through _update) ---
    function _update(address from, address to, uint256 value) internal override {
        // mint => from == 0 ; burn => to == 0
        if (from != address(0) && !_forcing) {
            require(!frozen[from], "RWA: sender frozen");
        }
        if (to != address(0)) {
            require(!frozen[to], "RWA: recipient frozen");
            require(identityRegistry.isVerified(to), "RWA: recipient not verified");
        }
        super._update(from, to, value);
    }

    // --- agent powers (regulatory) ---

    /// @notice Mint on subscription. Recipient must be KYC-verified (enforced by hook).
    function mint(address to, uint256 amount) external onlyRole(AGENT_ROLE) {
        _mint(to, amount);
    }

    /// @notice Burn on redemption.
    function burn(address from, uint256 amount) external onlyRole(AGENT_ROLE) {
        _burn(from, amount);
    }

    /// @notice Freeze/unfreeze an account (sanctions, dispute, court order).
    function setFrozen(address account, bool isFrozen) external onlyRole(AGENT_ROLE) {
        frozen[account] = isFrozen;
        emit AddressFrozen(account, isFrozen);
    }

    /// @notice Regulatory forced move (court order / sanctions seizure). Bypasses
    /// the frozen-`from` guard; the recipient must still be KYC-verified.
    function forceTransfer(address from, address to, uint256 amount) external onlyRole(AGENT_ROLE) {
        _forcing = true;
        _update(from, to, amount);
        _forcing = false;
        emit ForcedTransfer(from, to, amount);
    }

    /// @notice Lost-key recovery: move a holder's entire balance to a new,
    /// verified wallet. Bypasses the frozen-`from` guard.
    function recover(address lostWallet, address newWallet) external onlyRole(AGENT_ROLE) {
        require(identityRegistry.isVerified(newWallet), "RWA: new wallet not verified");
        uint256 bal = balanceOf(lostWallet);
        _forcing = true;
        _update(lostWallet, newWallet, bal);
        _forcing = false;
        emit Recovered(lostWallet, newWallet, bal);
    }

    function setIdentityRegistry(address registry) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(registry != address(0), "RWA: zero registry");
        identityRegistry = IIdentityRegistry(registry);
        emit IdentityRegistryUpdated(registry);
    }
}
