'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ethers } = require('ethers');
const { getNonceForValidator, packSessionKeySignature } = require('../userOpBuilder');
const { isBlockedSelector, isToolAllowed, isWithinSpendLimit } = require('../securityPolicy');

const toolCases = [
    ['native', 'transfer_eth', true],
    ['native', 'uniswap_swap', false],
    ['native', 'erc20_transfer', false],
    ['native', 'aave_supply', false],
    ['uniswap', 'uniswap_swap', true],
    ['uniswap', 'transfer_eth', false],
    ['uniswap', 'erc20_transfer', false],
    ['uniswap', 'aave_supply', false],
    ['erc20', 'erc20_transfer', true],
    ['erc20', 'aave_supply', true],
    ['erc20', 'transfer_eth', false],
    ['erc20', 'uniswap_swap', false],
    ['custom', 'call_contract', false],
    ['', 'transfer_eth', false],
    [undefined, 'transfer_eth', false],
    ['native', '', false],
    ['uniswap', 'call_contract', false],
    ['erc20', 'approve', false],
    ['erc20', 'transferOwnership', false],
    ['native', 'aave_withdraw', false]
];

for (const [scope, toolName, expected] of toolCases) {
    test(`tool policy: ${scope || 'missing'} -> ${toolName || 'missing'}`, () => {
        assert.equal(isToolAllowed(scope, toolName), expected);
    });
}

test('blocked selectors include approve and transferOwnership', () => {
    assert.equal(isBlockedSelector('0x095ea7b3' + '00'.repeat(64)), true);
    assert.equal(isBlockedSelector('0xf2fde38b' + '00'.repeat(32)), true);
    assert.equal(isBlockedSelector('0xa9059cbb' + '00'.repeat(64)), false);
});

test('spend limit is inclusive and uses bigint precision', () => {
    assert.equal(isWithinSpendLimit(1000000n, 1000000n), true);
    assert.equal(isWithinSpendLimit(1000001n, 1000000n), false);
});

test('session signature remains 85 bytes', async () => {
    const wallet = ethers.Wallet.createRandom();
    const signature = await wallet.signMessage(ethers.getBytes(ethers.id('characterization')));
    const packed = packSessionKeySignature(wallet.address, signature);
    assert.equal(ethers.getBytes(packed).length, 85);
    assert.equal(ethers.getAddress(ethers.dataSlice(packed, 0, 20)), wallet.address);
});

test('2D nonce key remains the validator address interpreted as uint192', () => {
    const validator = '0x9B7Fd296B6b332b525Bd6AD65f621D25C0060323';
    assert.equal(getNonceForValidator(validator), BigInt(validator));
});
