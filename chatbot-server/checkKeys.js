const { ethers } = require('ethers');

async function main() {
    const provider = new ethers.JsonRpcProvider("https://ethereum-sepolia-rpc.publicnode.com");
    const SESSION_KEY_VALIDATOR = "0xC578bF1899fF9E49d0FC65BE5b1a0A26EB11aF44";
    const validator = new ethers.Contract(SESSION_KEY_VALIDATOR, [
        "function getActiveSessionKeys(address smartAccount) external view returns (address[] memory)",
        "function sessionKeys(address account, address sessionKey) view returns (address target, bytes4 selector, uint256 maxValue, uint48 validAfter, uint48 validUntil, bool enabled, uint256 maxUses, uint256 uses)"
    ], provider);

    try {
        const keys = await validator.getActiveSessionKeys("0xF856b80CaeF9f3a5d942aA4526D72078E04fad2e");
        console.log("Active Session Keys:", keys);
        for (const key of keys) {
            const data = await validator.sessionKeys("0xF856b80CaeF9f3a5d942aA4526D72078E04fad2e", key);
            console.log(`Key ${key} data:`, data);
        }
    } catch (e) {
        console.error("Error reading keys:", e);
    }
}
main();
