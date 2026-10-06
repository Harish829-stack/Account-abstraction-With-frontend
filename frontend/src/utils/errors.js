const asString = (value) => {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (value.reason) return String(value.reason);
  if (value.shortMessage) return String(value.shortMessage);
  if (value.response?.data?.error) return asString(value.response.data.error);
  if (value.response?.data?.message) return asString(value.response.data.message);
  if (value.message) return String(value.message);
  if (value.error) return asString(value.error);
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
};

export function getFriendlyErrorMessage(error, fallback = "Something went wrong. Please try again.") {
  const raw = asString(error);
  const message = raw.toLowerCase();

  if (!raw) return fallback;
  if (error?.code === "WRONG_NETWORK" || message.includes("only on arbitrum sepolia")) {
    return "Switch your wallet to Arbitrum Sepolia and try again.";
  }
  if (error?.code === 4001 || message.includes("user rejected") || message.includes("user denied")) {
    return "You rejected the request in your wallet.";
  }
  if (message.includes("insufficient funds") || message.includes("aa21")) {
    return "Your smart account does not have enough funds to cover this action.";
  }
  if (message.includes("exceeds max allowed") || message.includes("spend limit")) {
    return "This amount is above the assistant's spending limit. Enter a smaller amount or update the limit.";
  }
  if (message.includes("dangerous selector") || message.includes("security restriction") || message.includes("blocked action")) {
    return "This action is blocked by the assistant's security policy.";
  }
  if (message.includes("allowance")) {
    return "The token allowance is too low. Update the approval and try again.";
  }
  if (message.includes("network") || message.includes("chain") || message.includes("wrong network")) {
    return "Please check your network and try again.";
  }
  if (message.includes("timeout") || message.includes("timed out")) {
    return "This is taking longer than expected. Please try again in a moment.";
  }
  if (message.includes("failed to fetch") || message.includes("network error")) {
    return "We could not reach the service right now. Please try again.";
  }
  if (message.includes("gas estimation") || message.includes("estimate")) {
    return "We could not estimate gas for this action. Check the inputs and try again.";
  }
  if (message.includes("bundler rejected") || message.includes("useroperation")) {
    return "The transaction could not be accepted by the bundler. Please try again.";
  }
  if (message.includes("paymaster")) {
    return "Gas sponsorship is not available for this action right now.";
  }
  if (message.includes("invalid address") || message.includes("bad address")) {
    return "Please enter a valid wallet address.";
  }
  if (message.includes("nonce")) {
    return "The account nonce changed. Refresh and try again.";
  }
  if (message.includes("execution reverted") || message.includes("revert")) {
    return "The transaction was rejected by the smart contract.";
  }

  return fallback;
}

export function logAndFormatError(error, fallback, label = "UI error") {
  console.error(label, error);
  return getFriendlyErrorMessage(error, fallback);
}
