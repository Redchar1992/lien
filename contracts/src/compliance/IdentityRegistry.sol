// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IIdentityRegistry} from "./IIdentityRegistry.sol";

/// @title IdentityRegistry
/// @notice A faithful, focused subset of ERC-3643's on-chain identity layer:
/// an agent-maintained KYC allowlist. Every holder of the RWA token MUST be
/// verified here (enforced by the token's transfer hook). Country codes are
/// recorded to support jurisdiction-based transfer rules later.
contract IdentityRegistry is AccessControl, IIdentityRegistry {
    bytes32 public constant AGENT_ROLE = keccak256("AGENT_ROLE");

    struct Identity {
        bool verified;
        uint16 country; // ISO-3166 numeric
    }

    mapping(address => Identity) private _identities;

    event IdentityRegistered(address indexed account, uint16 country);
    event IdentityRemoved(address indexed account);

    constructor(address admin) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(AGENT_ROLE, admin);
    }

    function registerIdentity(address account, uint16 country) public onlyRole(AGENT_ROLE) {
        require(account != address(0), "IR: zero address");
        _identities[account] = Identity({verified: true, country: country});
        emit IdentityRegistered(account, country);
    }

    function batchRegister(address[] calldata accounts, uint16[] calldata countries)
        external
        onlyRole(AGENT_ROLE)
    {
        require(accounts.length == countries.length, "IR: length mismatch");
        for (uint256 i; i < accounts.length; ++i) {
            registerIdentity(accounts[i], countries[i]);
        }
    }

    function removeIdentity(address account) external onlyRole(AGENT_ROLE) {
        delete _identities[account];
        emit IdentityRemoved(account);
    }

    function isVerified(address account) external view returns (bool) {
        return _identities[account].verified;
    }

    function countryOf(address account) external view returns (uint16) {
        return _identities[account].country;
    }
}
