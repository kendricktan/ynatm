// Compiled with remix.ethereum.org
pragma solidity ^0.6.2;

contract StateMachine {
    uint256 public state = 0;

    constructor() public {}

    function setState(uint256 _state) public returns (uint256) {
        state = _state;
        return state;
    }
}
