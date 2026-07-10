const { ethers } = require('ethers');
const SessionKeyValidatorABI = [
  "function addSessionKey(tuple(address sessionKey, address target, bytes4 selector, uint256 maxValue, bool checkAmount, uint256 amountOffset, uint256 maxAmount, uint48 validAfter, uint48 validUntil, uint256 maxUses) keyData) external"
];

async function main() {
    const provider = new ethers.JsonRpcProvider("https://ethereum-sepolia-rpc.publicnode.com");
    
    // We'll construct the userOp directly to test
    const validatorIface = new ethers.Interface(SessionKeyValidatorABI);
    
    const validUntil = Math.floor(Date.now() / 1000) + 86400 * 30;
    const keyData = [
        "0xc1b3777b468c27453915422303b52f7c7310c4bf", // agentAddress
        "0x3bfa4769fb09eefc5a80d6e87c3b9c650f7ae48e", // some EOA or target
        "0x00000000",
        ethers.parseEther("0.001"),
        false,
        0,
        0n,
        0,
        validUntil,
        0
    ];
    
    console.log("KeyData:", keyData);
    
    const innerCallData = validatorIface.encodeFunctionData("addSessionKey", [keyData]);
    
    // encodeERC7579Single
    const mode = "0x0100000000000000000000000000000000000000000000000000000000000000"; // CallType.SINGLE (0x01)
    const SESSION_KEY_VALIDATOR = "0xC578bF1899fF9E49d0FC65BE5b1a0A26EB11aF44";
    // wait, encodeERC7579Single in the frontend uses mode = 0x01...
    // Let's just look at how it's encoded in the frontend
}
main();
