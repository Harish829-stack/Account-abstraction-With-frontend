import { expect } from "chai";
import hre from "hardhat";

describe("Beacon Proxy Architecture Test", function () {
  let factory: any;
  let entryPointAddress: string;
  let deployer: any;
  let owner1: any;
  let owner2: any;
  let randomAddress: any;
  let ethers: any;

  before(async function () {
    const env = await (hre as any).network.connect();
    ethers = env.ethers;
  });

  beforeEach(async function () {
    const signers = await ethers.getSigners();
    deployer = signers[0];
    owner1 = signers[1];
    owner2 = signers[2];
    randomAddress = signers[3];
    entryPointAddress = "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789";

    const Factory = await ethers.getContractFactory("ProxyFactory");
    factory = await Factory.deploy(entryPointAddress);
    await factory.waitForDeployment();
  });

  it("should deploy the factory and beacon correctly", async function () {
    const implAddr = await factory.implementation();
    const beaconAddr = await factory.beacon();

    expect(implAddr).to.not.equal("0x0000000000000000000000000000000000000000");
    expect(beaconAddr).to.not.equal("0x0000000000000000000000000000000000000000");
  });

  it("should deploy two smart accounts via beacon proxies", async function () {
    const salt1 = 1n;
    const salt2 = 2n;

    // Account 1
    const predictedAddr1 = await factory.getFunction("getAddress")(owner1.address, salt1);
    const tx1 = await factory.createAccount(owner1.address, salt1);
    await tx1.wait();

    // Account 2
    const predictedAddr2 = await factory.getFunction("getAddress")(owner2.address, salt2);
    const tx2 = await factory.createAccount(owner2.address, salt2);
    await tx2.wait();

    expect(predictedAddr1).to.not.equal(predictedAddr2);

    // Verify EntryPoint on both proxies
    const account1 = await ethers.getContractAt("ModularImplementation", predictedAddr1);
    const account2 = await ethers.getContractAt("ModularImplementation", predictedAddr2);

    expect(await account1.entryPoint()).to.equal(entryPointAddress);
    expect(await account2.entryPoint()).to.equal(entryPointAddress);
  });

  it("should execute transactions properly through the proxy", async function () {
    const salt1 = 1n;
    const predictedAddr1 = await factory.getFunction("getAddress")(owner1.address, salt1);
    
    // Deploy the account first!
    const txDeploy = await factory.createAccount(owner1.address, salt1);
    await txDeploy.wait();

    const account1 = await ethers.getContractAt("ModularImplementation", predictedAddr1);

    // Fund the account
    await deployer.sendTransaction({
      to: predictedAddr1,
      value: ethers.parseEther("1.0"),
    });

    const targetAddr = randomAddress.address;
    const amount = ethers.parseEther("0.1");
    const data = "0x";

    const initialBalance = await ethers.provider.getBalance(targetAddr);

    // Only owner1 can execute
    const tx = await account1.connect(owner1).execute(targetAddr, amount, data);
    await tx.wait();

    const finalBalance = await ethers.provider.getBalance(targetAddr);
    expect(finalBalance - initialBalance).to.equal(amount);
  });
});
