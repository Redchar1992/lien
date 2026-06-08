// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title IIdentityRegistry
/// @notice On-chain KYC/eligibility oracle for permissioned RWA tokens.
interface IIdentityRegistry {
    /// @return true if `account` is a verified (KYC'd) holder eligible to hold the asset.
    function isVerified(address account) external view returns (bool);

    /// @return ISO-3166 numeric country code recorded for `account` (0 if none).
    function countryOf(address account) external view returns (uint16);
}
