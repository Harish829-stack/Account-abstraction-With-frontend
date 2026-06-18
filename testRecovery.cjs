const { ethers } = require("ethers");
const provider = new ethers.JsonRpcProvider("https://sepolia.infura.io/v3/86b7c03e8d49460ca30a6845f81a6c80");

const privateKey = "0x5aafed20d23dbb7aa94e1ae788830f95a3ebd343096df4c1910935e012c307b3";
const guardian1Key = "0xd348508497a6fa3db961a72ab0877802c9edb33ff30bd629d91f002e1bc7ac98";
const guardian2Key = "0xe42e80c20627ab384ed5290d9f83d80fddfc9463abd7747fad3e36920f0a7dd5";
const newOwnerKey = "0x34c25dccf1a120d7863587c8319b337152d6ab482eb6e3591d2441559db3bbf5";

const wallet = new ethers.Wallet(privateKey, provider);
const guardian1 = new ethers.Wallet(guardian1Key, provider);
const guardian2 = new ethers.Wallet(guardian2Key, provider);
const newOwner = new ethers.Wallet(newOwnerKey, provider);

const smartAccountAddr = "0xad9c75CA1e452E7cfdE8c70a31f3171bcD1991D6";
const validatorAddr = "0xA280eC64faAa8FB877AF0af85ca27F00493Aa46A";
const entryPointAddr = "0x0000000071727De22E5E9d8BAf0edAc6f37da032";

const validatorAbi = [
    "function approveRecovery(address smartAccount, address newOwner) external",
    "function canRecover(address smartAccount, address newOwner) view returns (bool)",
    "function recoveryConfigs(address) view returns (uint48, uint16, uint16)",
    "function isGuardian(address, address) view returns (bool)",
    "function validateUserOp(tuple(address sender, uint256 nonce, bytes initCode, bytes callData, bytes32 accountGasLimits, uint256 preVerificationGas, bytes32 gasFees, bytes paymasterAndData, bytes signature) userOp, bytes32 userOpHash) view returns (uint256)"
];

const accountAbi = [
    "function installModule(uint256 moduleTypeId, address module, bytes calldata initData) external",
    "function isModuleInstalled(uint256 moduleTypeId, address module, bytes calldata additionalContext) view returns (bool)",
    "function execute(address dest, uint256 value, bytes func)"
];

const entryPointAbi = [
    "function handleOps(tuple(address sender, uint256 nonce, bytes initCode, bytes callData, bytes32 accountGasLimits, uint256 preVerificationGas, bytes32 gasFees, bytes paymasterAndData, bytes signature)[] ops, address beneficiary)",
    "function getNonce(address sender, uint192 key) view returns (uint256)"
];

function encodeERC7579Single(dest, value, data) {
    const abi = ["function execute(address dest, uint256 value, bytes func)"];
    const iface = new ethers.Interface(abi);
    return iface.encodeFunctionData("execute", [dest, value, data]);
}

async function main() {
    const validator = new ethers.Contract(validatorAddr, validatorAbi, wallet);
    const account = new ethers.Contract(smartAccountAddr, accountAbi, wallet);
    const ep = new ethers.Contract(entryPointAddr, entryPointAbi, wallet);

    console.log("Checking if module is installed...");
    const isInstalled = await account.isModuleInstalled(1, validatorAddr, "0x");
    console.log("Is installed?", isInstalled);

    if (!isInstalled) {
        console.log("Installing module...");
        const initData = ethers.AbiCoder.defaultAbiCoder().encode(
            ["address[]", "uint16", "uint48"],
            [[guardian1.address, guardian2.address], 2, 0]
        );
        const tx = await account.installModule(1, validatorAddr, initData);
        await tx.wait();
        console.log("Installed!");
    }

    console.log("Checking Guardian 1 status...");
    const isG1 = await validator.isGuardian(smartAccountAddr, guardian1.address);
    console.log("Is G1?", isG1);

    if (isG1) {
        try {
            console.log("Approving recovery with G1...");
            const v1 = validator.connect(guardian1);
            const tx1 = await v1.approveRecovery(smartAccountAddr, newOwner.address);
            await tx1.wait();
            console.log("G1 Approved!");
        } catch(e) { console.log("G1 already approved or error"); }

        try {
            console.log("Approving recovery with G2...");
            const v2 = validator.connect(guardian2);
            const tx2 = await v2.approveRecovery(smartAccountAddr, newOwner.address);
            await tx2.wait();
            console.log("G2 Approved!");
        } catch(e) { console.log("G2 already approved or error"); }
    }

    const canRec = await validator.canRecover(smartAccountAddr, newOwner.address);
    console.log("Can Recover?", canRec);

    if (!canRec) {
        console.log("Aborting: Cannot recover");
        return;
    }

    // Build UserOp
    const inner = new ethers.Interface(["function changeOwner(address)"]).encodeFunctionData("changeOwner", [newOwner.address]);
    const callData = encodeERC7579Single(smartAccountAddr, 0n, inner);
    const signature = ethers.concat([
        validatorAddr,
        ethers.AbiCoder.defaultAbiCoder().encode(["address"], [newOwner.address])
    ]);

    const nonce = await ep.getNonce(smartAccountAddr, 0);

    const userOp = {
        sender: smartAccountAddr,
        nonce: nonce,
        initCode: "0x",
        callData: callData,
        accountGasLimits: ethers.zeroPadValue("0x0000000000000000000000000000000000000000000000000000000000000000", 32),
        preVerificationGas: 0n,
        gasFees: ethers.zeroPadValue("0x0000000000000000000000000000000000000000000000000000000000000000", 32),
        paymasterAndData: "0x",
        signature: signature
    };

    console.log("Simulating validateUserOp locally...");
    try {
        const validationData = await validator.validateUserOp(userOp, ethers.ZeroHash);
        console.log("Validation Data (0 = success, 1 = sig failed):", validationData.toString());
    } catch(e) {
        console.log("validateUserOp Reverted:", e.message);
    }
}
main();
