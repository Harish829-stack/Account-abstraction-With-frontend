'use strict';

const TOOL_NAMES_BY_SCOPE = Object.freeze({
    native: Object.freeze(['transfer_eth']),
    uniswap: Object.freeze(['uniswap_swap']),
    erc20: Object.freeze(['erc20_transfer', 'aave_supply'])
});

const BLOCKED_SELECTORS = new Set([
    '0x095ea7b3', // approve
    '0x39509351', // increaseAllowance
    '0xa22cb465', // setApprovalForAll
    '0xf2fde38b'  // transferOwnership
]);

function isToolAllowed(scope, toolName) {
    return Boolean(TOOL_NAMES_BY_SCOPE[scope]?.includes(toolName));
}

function isBlockedSelector(calldata = '0x') {
    const selector = String(calldata).length >= 10 ? String(calldata).slice(0, 10).toLowerCase() : '';
    return BLOCKED_SELECTORS.has(selector);
}

function isWithinSpendLimit(amount, maxAmount) {
    return BigInt(amount) <= BigInt(maxAmount);
}

module.exports = { BLOCKED_SELECTORS, TOOL_NAMES_BY_SCOPE, isBlockedSelector, isToolAllowed, isWithinSpendLimit };

