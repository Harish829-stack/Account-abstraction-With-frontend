// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IMockERC20 {
    function mint(address to, uint256 amount) external;
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

contract AaveYieldPool is Ownable, ReentrancyGuard {
    IMockERC20 public stakingToken;
    uint256 public apy; // APY in basis points (1% = 100, 100% = 10000)

    struct Position {
        uint256 amount;
        uint256 lastUpdateTime;
        uint256 rewards;
    }

    mapping(address => Position) public positions;

    event Deposited(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);
    event RewardClaimed(address indexed user, uint256 reward);
    event APYUpdated(uint256 newApy);

    constructor(address _stakingToken, uint256 _initialApy) Ownable(msg.sender) {
        stakingToken = IMockERC20(_stakingToken);
        apy = _initialApy;
    }

    function setAPY(uint256 _newApy) external onlyOwner {
        apy = _newApy;
        emit APYUpdated(_newApy);
    }

    function deposit(uint256 _amount) external nonReentrant {
        require(_amount > 0, "Amount must be > 0");
        
        _updateReward(msg.sender);
        
        positions[msg.sender].amount += _amount;
        require(stakingToken.transferFrom(msg.sender, address(this), _amount), "Transfer failed");
        
        emit Deposited(msg.sender, _amount);
    }

    function withdraw(uint256 _amount) external nonReentrant {
        require(_amount > 0, "Amount must be > 0");
        require(positions[msg.sender].amount >= _amount, "Insufficient balance");

        _updateReward(msg.sender);

        positions[msg.sender].amount -= _amount;
        require(stakingToken.transfer(msg.sender, _amount), "Transfer failed");

        emit Withdrawn(msg.sender, _amount);
    }

    function claimReward() external nonReentrant {
        _updateReward(msg.sender);
        uint256 reward = positions[msg.sender].rewards;
        if (reward > 0) {
            positions[msg.sender].rewards = 0;
            // Pool mints reward tokens to the user directly
            stakingToken.mint(msg.sender, reward);
            emit RewardClaimed(msg.sender, reward);
        }
    }

    function earned(address _account) public view returns (uint256) {
        Position memory pos = positions[_account];
        if (pos.amount == 0) return pos.rewards;
        
        uint256 timeStaked = block.timestamp - pos.lastUpdateTime;
        // APY calculation: amount * apy / 10000 * (timeStaked / 365 days)
        uint256 reward = (pos.amount * apy * timeStaked) / (10000 * 365 days);
        return pos.rewards + reward;
    }

    function _updateReward(address _account) internal {
        positions[_account].rewards = earned(_account);
        positions[_account].lastUpdateTime = block.timestamp;
    }
}
