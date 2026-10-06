'use strict';

function toPublicError(error, fallback = 'We could not complete that request. Please try again.') {
    const raw = String(error?.response?.data?.error || error?.message || error || '');
    const message = raw.toLowerCase();

    if (message.includes('insufficient') || message.includes('aa21')) {
        return { code: 'INSUFFICIENT_FUNDS', error: 'Your smart account does not have enough funds for this action.' };
    }
    if (message.includes('allowance')) {
        return { code: 'INSUFFICIENT_ALLOWANCE', error: 'Your USDC allowance is too low. Update the approval and try again.' };
    }
    if (message.includes('max allowed') || message.includes('spend limit')) {
        return { code: 'SPEND_LIMIT', error: "This amount is above the assistant's spending limit." };
    }
    if (message.includes('network') || message.includes('chain')) {
        return { code: 'WRONG_NETWORK', error: 'Switch to Arbitrum Sepolia and try again.' };
    }
    if (message.includes('timeout') || message.includes('timed out')) {
        return { code: 'TIMEOUT', error: 'Confirmation is taking longer than expected. Check History before trying again.' };
    }
    if (message.includes('paymaster')) {
        return { code: 'PAYMASTER_UNAVAILABLE', error: 'Gas sponsorship is unavailable. Add ETH for gas or update the USDC approval.' };
    }
    if (message.includes('revert') || message.includes('aa')) {
        return { code: 'EXECUTION_REJECTED', error: 'The smart account rejected this action. Check the amount, permission, and available balance.' };
    }
    return { code: 'REQUEST_FAILED', error: fallback };
}

module.exports = { toPublicError };

