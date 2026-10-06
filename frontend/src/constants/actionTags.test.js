import test from 'node:test';
import assert from 'node:assert/strict';
import { ActionTag, expandActionTags, labelToActionTag } from './actionTags.js';

const cases = [
  ['Deploy wallet', ActionTag.DEPLOYMENT],
  ['Agent supplied to Aave', ActionTag.SESSION_KEY],
  ['Install Session Key', ActionTag.SESSION_KEY],
  ['USDC Gas Sponsorship Approval', ActionTag.APPROVAL],
  ['Aave Deposit', ActionTag.AAVE_POSITION],
  ['Repay Aave', ActionTag.AAVE_POSITION],
  ['ETH to USDC Swap', ActionTag.USDC_BALANCE],
  ['Send ETH', ActionTag.ETH_BALANCE],
  ['method call', ActionTag.ETH_BALANCE],
  ['Transfer Smart Account Ownership', ActionTag.FULL_SYNC],
];

for (const [label, expected] of cases) {
  test(`legacy label mapping: ${label}`, () => {
    assert.equal(labelToActionTag(label), expected);
  });
}

test('multi-effect tags expand to the required resources', () => {
  assert.deepEqual(expandActionTags([ActionTag.SWAP]), [ActionTag.USDC_BALANCE, ActionTag.ETH_BALANCE]);
  assert.deepEqual(expandActionTags([ActionTag.AAVE_WITHDRAW]), [
    ActionTag.AAVE_POSITION,
    ActionTag.USDC_BALANCE,
    ActionTag.ETH_BALANCE,
  ]);
});

