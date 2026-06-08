// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {IdentityRegistry} from "../src/compliance/IdentityRegistry.sol";
import {RwaToken} from "../src/rwa/RwaToken.sol";

contract ComplianceTest is Test {
    IdentityRegistry reg;
    RwaToken token;

    address admin = makeAddr("admin");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address mallory = makeAddr("mallory"); // never KYC'd

    uint16 constant US = 840;

    function setUp() public {
        vm.startPrank(admin);
        reg = new IdentityRegistry(admin);
        token = new RwaToken("Tokenized T-Bill", "tBILL", 18, address(reg), admin);
        reg.registerIdentity(alice, US);
        reg.registerIdentity(bob, US);
        token.mint(alice, 1_000e18);
        vm.stopPrank();
    }

    // --- transfer restrictions ---

    function test_mint_requires_verified_recipient() public {
        vm.prank(admin);
        vm.expectRevert("RWA: recipient not verified");
        token.mint(mallory, 1e18);
    }

    function test_transfer_to_verified_ok() public {
        vm.prank(alice);
        token.transfer(bob, 100e18);
        assertEq(token.balanceOf(bob), 100e18);
        assertEq(token.balanceOf(alice), 900e18);
    }

    function test_transfer_to_unverified_reverts() public {
        vm.prank(alice);
        vm.expectRevert("RWA: recipient not verified");
        token.transfer(mallory, 1e18);
    }

    function test_removeIdentity_then_transfer_reverts() public {
        vm.prank(admin);
        reg.removeIdentity(bob);
        vm.prank(alice);
        vm.expectRevert("RWA: recipient not verified");
        token.transfer(bob, 1e18);
    }

    function test_transfer_from_unverified_sender_reverts() public {
        // alice holds tokens but gets de-listed -> can't offload to a verified holder
        vm.prank(admin);
        reg.removeIdentity(alice);
        vm.prank(alice);
        vm.expectRevert("RWA: sender not verified");
        token.transfer(bob, 1e18);
    }

    function test_forceTransfer_still_works_from_unverified_sender() public {
        // agent can still seize from a de-listed holder (forced move bypasses sender check)
        vm.startPrank(admin);
        reg.removeIdentity(alice);
        token.forceTransfer(alice, bob, 100e18);
        vm.stopPrank();
        assertEq(token.balanceOf(bob), 100e18);
    }

    // --- freezing ---

    function test_frozen_sender_blocked() public {
        vm.prank(admin);
        token.setFrozen(alice, true);
        vm.prank(alice);
        vm.expectRevert("RWA: sender frozen");
        token.transfer(bob, 1e18);
    }

    function test_frozen_recipient_blocked() public {
        vm.prank(admin);
        token.setFrozen(bob, true);
        vm.prank(alice);
        vm.expectRevert("RWA: recipient frozen");
        token.transfer(bob, 1e18);
    }

    // --- agent powers ---

    function test_forceTransfer_bypasses_frozen_sender() public {
        vm.startPrank(admin);
        token.setFrozen(alice, true); // alice sanctioned
        token.forceTransfer(alice, bob, 100e18); // agent seizes out of frozen acct
        vm.stopPrank();
        assertEq(token.balanceOf(bob), 100e18);
        assertEq(token.balanceOf(alice), 900e18);
    }

    function test_forceTransfer_still_requires_verified_recipient() public {
        vm.prank(admin);
        vm.expectRevert("RWA: recipient not verified");
        token.forceTransfer(alice, mallory, 1e18);
    }

    function test_recover_moves_full_balance_to_new_wallet() public {
        address aliceNew = makeAddr("aliceNew");
        vm.startPrank(admin);
        reg.registerIdentity(aliceNew, US);
        token.recover(alice, aliceNew);
        vm.stopPrank();
        assertEq(token.balanceOf(alice), 0);
        assertEq(token.balanceOf(aliceNew), 1_000e18);
    }

    function test_recover_to_unverified_reverts() public {
        address aliceNew = makeAddr("aliceNew");
        vm.prank(admin);
        vm.expectRevert("RWA: new wallet not verified");
        token.recover(alice, aliceNew);
    }

    function test_burn_reduces_supply() public {
        vm.prank(admin);
        token.burn(alice, 400e18);
        assertEq(token.balanceOf(alice), 600e18);
        assertEq(token.totalSupply(), 600e18);
    }

    // --- access control ---

    function test_mint_is_agent_only() public {
        vm.prank(alice);
        vm.expectRevert(); // AccessControlUnauthorizedAccount
        token.mint(alice, 1e18);
    }

    function test_freeze_is_agent_only() public {
        vm.prank(alice);
        vm.expectRevert();
        token.setFrozen(bob, true);
    }

    function test_register_is_agent_only() public {
        vm.prank(alice);
        vm.expectRevert();
        reg.registerIdentity(mallory, US);
    }
}
