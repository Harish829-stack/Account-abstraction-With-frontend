import { expect } from "chai";
import hre from "hardhat";
import fs from "fs";

describe("Modular Account v0.7 E2E", function () {
  let factory: any;
  let entryPoint: any;
  let deployer: any;
  let owner: any;
  let randomUser: any;
  let ethers: any;
  let accountAddress: string;

  before(async function () {
    const env = await (hre as any).network.connect();
    ethers = env.ethers;
  });

  beforeEach(async function () {
    const signers = await ethers.getSigners();
    deployer = signers[0];
    owner = signers[1];
    randomUser = signers[2];

    // Deploy EntryPoint v0.7
    // Using an imported contract or we can deploy from artifact if available.
    // For simplicity we use standard require from node_modules if hardhat doesn't know it directly.
    // Better yet, we can deploy a dummy or import it in a solidity file. 
    // Assuming hardhat compiled it because it's imported in Interfaces.sol
    const EntryPointArtifact = JSON.parse(fs.readFileSync("node_modules/@account-abstraction/contracts/artifacts/EntryPoint.json", "utf-8"));
    const EntryPoint = new ethers.ContractFactory(EntryPointArtifact.abi, EntryPointArtifact.bytecode, deployer);
    entryPoint = await EntryPoint.deploy();
    await entryPoint.waitForDeployment();

    const Factory = await ethers.getContractFactory("ProxyFactory");
    factory = await Factory.deploy(await entryPoint.getAddress());
    await factory.waitForDeployment();
  });

  it("should deploy account and execute via UserOperation (v0.7)", async function () {
    const salt = 100n;
    const predictedAddr = await factory.getFunction("getAddress")(owner.address, salt);
    accountAddress = predictedAddr;

    // Build initCode: factoryAddress + factoryData
    const factoryData = factory.interface.encodeFunctionData("createAccount", [owner.address, salt]);
    const initCode = ethers.concat([
      await factory.getAddress(),
      factoryData
    ]);

    // Send ETH to the predicted address to pay for gas
    await deployer.sendTransaction({
      to: predictedAddr,
      value: ethers.parseEther("1.0"),
    });

    const SmartAccountABI = await ethers.getContractFactory("ModularImplementation");
    const callData = SmartAccountABI.interface.encodeFunctionData("execute(address,uint256,bytes)", [randomUser.address, ethers.parseEther("0.1"), "0x"]);

    const verificationGasLimit = 300000n;
    const callGasLimit = 200000n;
    const maxPriorityFeePerGas = 1500000000n;
    const maxFeePerGas = 20000000000n;

    const accountGasLimits = ethers.concat([
      ethers.zeroPadValue(ethers.toBeHex(verificationGasLimit), 16),
      ethers.zeroPadValue(ethers.toBeHex(callGasLimit), 16)
    ]);

    const gasFees = ethers.concat([
      ethers.zeroPadValue(ethers.toBeHex(maxPriorityFeePerGas), 16),
      ethers.zeroPadValue(ethers.toBeHex(maxFeePerGas), 16)
    ]);

    const userOp = {
      sender: predictedAddr,
      nonce: 0n,
      initCode: initCode,
      callData: callData,
      accountGasLimits: accountGasLimits,
      preVerificationGas: 50000n,
      gasFees: gasFees,
      paymasterAndData: "0x",
      signature: "0x"
    };

    const hash = await entryPoint.getUserOpHash(userOp);
    userOp.signature = await owner.signMessage(ethers.getBytes(hash));

    const initialBalance = await ethers.provider.getBalance(randomUser.address);

    const tx = await entryPoint.handleOps([userOp], deployer.address);
    await tx.wait();

    const finalBalance = await ethers.provider.getBalance(randomUser.address);
    expect(finalBalance - initialBalance).to.equal(ethers.parseEther("0.1"));
  });

  it("should install an ERC-7579 hook and block execution if hook reverts", async function () {
    const salt = 200n;
    const predictedAddr = await factory.getFunction("getAddress")(owner.address, salt);
    
    // Deploy Account
    const txDeploy = await factory.createAccount(owner.address, salt);
    await txDeploy.wait();

    const account = await ethers.getContractAt("ModularImplementation", predictedAddr);

    // Deploy Mock Hook
    const MockHook = await ethers.getContractFactory("MockHook");
    const hook = await MockHook.deploy();
    await hook.waitForDeployment();
    const hookAddr = await hook.getAddress();

    // Install Hook (ModuleTypeId = 4)
    await account.connect(owner).installModule(4, hookAddr, "0x");

    // Tell hook to revert on preCheck
    await hook.setRevertOnPreCheck(true);

    // Execution should be blocked
    await expect(account.connect(owner).getFunction("execute(address,uint256,bytes)")(randomUser.address, 0n, "0x")).to.be.revertedWith("MockHook: Reverting in preCheck");

    // Allow hook
    await hook.setRevertOnPreCheck(false);
    await account.connect(owner).getFunction("execute(address,uint256,bytes)")(randomUser.address, 0n, "0x");
  });

  it("should recover ownership through guardian approvals", async function () {
    const salt = 250n;
    const predictedAddr = await factory.getFunction("getAddress")(owner.address, salt);

    const txDeploy = await factory.createAccount(owner.address, salt);
    await txDeploy.wait();

    await deployer.sendTransaction({
      to: predictedAddr,
      value: ethers.parseEther("1.0"),
    });

    const account = await ethers.getContractAt("ModularImplementation", predictedAddr);
    const newOwner = deployer;
    const guardianOne = randomUser;
    const guardianTwo = (await ethers.getSigners())[3];
    const guardianThree = (await ethers.getSigners())[4];

    const SocialRecoveryValidator = await ethers.getContractFactory("SocialRecoveryValidator");
    const recoveryValidator = await SocialRecoveryValidator.deploy();
    await recoveryValidator.waitForDeployment();
    const recoveryValidatorAddr = await recoveryValidator.getAddress();

    const guardians = [guardianOne.address, guardianTwo.address, guardianThree.address];
    const threshold = 2;
    const delay = 0;
    const initData = ethers.AbiCoder.defaultAbiCoder().encode(
      ["address[]", "uint16", "uint48"],
      [guardians, threshold, delay]
    );

    await account.connect(owner).installModule(1, recoveryValidatorAddr, initData);

    await recoveryValidator.connect(guardianOne).approveRecovery(predictedAddr, newOwner.address);
    expect(await recoveryValidator.canRecover(predictedAddr, newOwner.address)).to.equal(false);

    await recoveryValidator.connect(guardianTwo).approveRecovery(predictedAddr, newOwner.address);
    expect(await recoveryValidator.canRecover(predictedAddr, newOwner.address)).to.equal(true);

    const callData = account.interface.encodeFunctionData("changeOwner", [newOwner.address]);

    const verificationGasLimit = 300000n;
    const callGasLimit = 200000n;
    const maxPriorityFeePerGas = 1500000000n;
    const maxFeePerGas = 20000000000n;

    const accountGasLimits = ethers.concat([
      ethers.zeroPadValue(ethers.toBeHex(verificationGasLimit), 16),
      ethers.zeroPadValue(ethers.toBeHex(callGasLimit), 16)
    ]);

    const gasFees = ethers.concat([
      ethers.zeroPadValue(ethers.toBeHex(maxPriorityFeePerGas), 16),
      ethers.zeroPadValue(ethers.toBeHex(maxFeePerGas), 16)
    ]);

    const userOp = {
      sender: predictedAddr,
      nonce: 0n,
      initCode: "0x",
      callData,
      accountGasLimits,
      preVerificationGas: 50000n,
      gasFees,
      paymasterAndData: "0x",
      signature: ethers.concat([
        recoveryValidatorAddr,
        ethers.AbiCoder.defaultAbiCoder().encode(["address"], [newOwner.address])
      ])
    };

    const tx = await entryPoint.handleOps([userOp], deployer.address);
    await tx.wait();

    await expect(
      account.connect(owner).getFunction("execute(address,uint256,bytes)")(randomUser.address, 0n, "0x")
    ).to.be.revertedWith("not owner or EntryPoint");

    await account.connect(newOwner).getFunction("execute(address,uint256,bytes)")(randomUser.address, 0n, "0x");
  });

  it("should execute a limited operation through a session key", async function () {
    const salt = 275n;
    const predictedAddr = await factory.getFunction("getAddress")(owner.address, salt);

    const txDeploy = await factory.createAccount(owner.address, salt);
    await txDeploy.wait();

    await deployer.sendTransaction({
      to: predictedAddr,
      value: ethers.parseEther("1.0"),
    });

    const account = await ethers.getContractAt("ModularImplementation", predictedAddr);
    const sessionSigner = (await ethers.getSigners())[5];

    const SessionKeyValidator = await ethers.getContractFactory("SessionKeyValidator");
    const sessionValidator = await SessionKeyValidator.deploy();
    await sessionValidator.waitForDeployment();
    const sessionValidatorAddr = await sessionValidator.getAddress();

    const sessionKeyData = {
      sessionKey: sessionSigner.address,
      target: randomUser.address,
      selector: "0x00000000",
      maxValue: ethers.parseEther("0.2"),
      validAfter: 0,
      validUntil: 0,
      remainingUses: 1
    };
    const initData = ethers.AbiCoder.defaultAbiCoder().encode(
      ["tuple(address sessionKey,address target,bytes4 selector,uint256 maxValue,uint48 validAfter,uint48 validUntil,uint48 remainingUses)[]"],
      [[sessionKeyData]]
    );

    await account.connect(owner).installModule(1, sessionValidatorAddr, initData);

    const callData = account.interface.encodeFunctionData(
      "execute(address,uint256,bytes)",
      [randomUser.address, ethers.parseEther("0.1"), "0x"]
    );

    const verificationGasLimit = 300000n;
    const callGasLimit = 200000n;
    const maxPriorityFeePerGas = 1500000000n;
    const maxFeePerGas = 20000000000n;

    const accountGasLimits = ethers.concat([
      ethers.zeroPadValue(ethers.toBeHex(verificationGasLimit), 16),
      ethers.zeroPadValue(ethers.toBeHex(callGasLimit), 16)
    ]);

    const gasFees = ethers.concat([
      ethers.zeroPadValue(ethers.toBeHex(maxPriorityFeePerGas), 16),
      ethers.zeroPadValue(ethers.toBeHex(maxFeePerGas), 16)
    ]);

    const userOp = {
      sender: predictedAddr,
      nonce: 0n,
      initCode: "0x",
      callData,
      accountGasLimits,
      preVerificationGas: 50000n,
      gasFees,
      paymasterAndData: "0x",
      signature: "0x"
    };

    const hash = await entryPoint.getUserOpHash(userOp);
    const sessionSignature = await sessionSigner.signMessage(ethers.getBytes(hash));
    userOp.signature = ethers.concat([
      sessionValidatorAddr,
      sessionSigner.address,
      sessionSignature
    ]);

    const initialBalance = await ethers.provider.getBalance(randomUser.address);

    const tx = await entryPoint.handleOps([userOp], deployer.address);
    await tx.wait();

    const finalBalance = await ethers.provider.getBalance(randomUser.address);
    expect(finalBalance - initialBalance).to.equal(ethers.parseEther("0.1"));

    const storedSession = await sessionValidator.sessionKeys(predictedAddr, sessionSigner.address);
    expect(storedSession.remainingUses).to.equal(0n);
  });

  it("should sponsor transaction via Custom Paymaster", async function () {
    const salt = 300n;
    const predictedAddr = await factory.getFunction("getAddress")(owner.address, salt);
    const initCode = ethers.concat([
      await factory.getAddress(),
      factory.interface.encodeFunctionData("createAccount", [owner.address, salt])
    ]);

    // Deploy Custom Paymaster
    const CustomPaymaster = await ethers.getContractFactory("Paymaster");
    const paymaster = await CustomPaymaster.deploy(await entryPoint.getAddress(), owner.address);
    await paymaster.waitForDeployment();
    const pmAddr = await paymaster.getAddress();

    // Stake & Deposit Paymaster
    await entryPoint.depositTo(pmAddr, { value: ethers.parseEther("1.0") });
    await entryPoint.addStake(86400, { value: ethers.parseEther("0.1") });

    const SmartAccountABI = await ethers.getContractFactory("ModularImplementation");
    const callData = SmartAccountABI.interface.encodeFunctionData("execute(address,uint256,bytes)", [randomUser.address, 0n, "0x"]);

    const verificationGasLimit = 300000n;
    const callGasLimit = 200000n;
    const maxPriorityFeePerGas = 1500000000n;
    const maxFeePerGas = 20000000000n;

    const accountGasLimits = ethers.concat([
      ethers.zeroPadValue(ethers.toBeHex(verificationGasLimit), 16),
      ethers.zeroPadValue(ethers.toBeHex(callGasLimit), 16)
    ]);
    const gasFees = ethers.concat([
      ethers.zeroPadValue(ethers.toBeHex(maxPriorityFeePerGas), 16),
      ethers.zeroPadValue(ethers.toBeHex(maxFeePerGas), 16)
    ]);

    const validUntil = 0n;
    const validAfter = 0n;

    const pmVerificationGasLimit = ethers.zeroPadValue(ethers.toBeHex(150000), 16);
    const pmPostOpGasLimit = ethers.zeroPadValue(ethers.toBeHex(150000), 16);
    
    // Create base userOp
    const userOp = {
      sender: predictedAddr,
      nonce: 0n,
      initCode: initCode,
      callData: callData,
      accountGasLimits: accountGasLimits,
      preVerificationGas: 50000n,
      gasFees: gasFees,
      paymasterAndData: "0x",
      signature: "0x"
    };

    // Get hash from paymaster
    const pmHash = await paymaster.getHash(userOp, validUntil, validAfter);
    const pmSignature = await owner.signMessage(ethers.getBytes(pmHash));

    // Rebuild paymasterAndData with the signature
    const validUntilBytes = ethers.zeroPadValue(ethers.toBeHex(validUntil), 6);
    const validAfterBytes = ethers.zeroPadValue(ethers.toBeHex(validAfter), 6);
    
    userOp.paymasterAndData = ethers.concat([
      pmAddr,
      pmVerificationGasLimit,
      pmPostOpGasLimit,
      validUntilBytes,
      validAfterBytes,
      pmSignature
    ]);

    const hash = await entryPoint.getUserOpHash(userOp);
    userOp.signature = await owner.signMessage(ethers.getBytes(hash));

    const tx = await entryPoint.handleOps([userOp], deployer.address);
    await tx.wait();

    // Verify account was deployed and didn't pay gas
    const code = await ethers.provider.getCode(predictedAddr);
    expect(code).to.not.equal("0x");
  });
});
