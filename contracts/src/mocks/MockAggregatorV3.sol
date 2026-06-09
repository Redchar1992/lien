// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {AggregatorV3Interface} from "../oracle/AggregatorV3Interface.sol";

/// @notice Settable Chainlink AggregatorV3 mock for tests.
contract MockAggregatorV3 is AggregatorV3Interface {
    uint8 private immutable _dec;
    int256 public answer;
    uint256 public updatedAt;
    uint80 public round;

    constructor(uint8 decimals_, int256 answer_, uint256 updatedAt_) {
        _dec = decimals_;
        answer = answer_;
        updatedAt = updatedAt_;
        round = 1;
    }

    function setAnswer(int256 a, uint256 t) external {
        answer = a;
        updatedAt = t;
        round += 1;
    }

    function decimals() external view override returns (uint8) {
        return _dec;
    }

    function description() external pure override returns (string memory) {
        return "MOCK/NAV";
    }

    function latestRoundData() external view override returns (uint80, int256, uint256, uint256, uint80) {
        return (round, answer, updatedAt, updatedAt, round);
    }
}
