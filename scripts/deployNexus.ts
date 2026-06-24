import hre from "hardhat"
const { ethers } = await hre.network.connect()

async function main() {
  const [deployer] = await ethers.getSigners();
  const ENTRY_POINT = "0x0000000071727De22E5E9d8BAf0edAc6f37da032";

  console.log("Deploying with account:", deployer.address);

  // 1. Deploy K1Validator (standalone)
  const K1Validator = await ethers.getContractFactory("K1Validator");
  const k1Validator = await K1Validator.deploy();
  await k1Validator.waitForDeployment();
  console.log("K1Validator:", await k1Validator.getAddress());

  // 2. Deploy Nexus implementation
  // Constructor: (entryPoint, defaultValidator, initData)
  const Nexus = await ethers.getContractFactory("Nexus");
  const nexusImpl = await Nexus.deploy(
    ENTRY_POINT,
    await k1Validator.getAddress(),
    deployer.address   // initData must be at least 20 bytes for K1Validator.onInstall
  );
  await nexusImpl.waitForDeployment();
  console.log("Nexus Implementation:", await nexusImpl.getAddress());

  // 3. Deploy SessionKeyValidator
  const SessionKey = await ethers.getContractFactory("SessionKeyValidator");
  const sessionKey = await SessionKey.deploy();
  await sessionKey.waitForDeployment();
  console.log("SessionKeyValidator:", await sessionKey.getAddress());

  // 4. Deploy NexusBootstrap
  const Bootstrap = await ethers.getContractFactory("NexusBootstrap");
  const bootstrap = await Bootstrap.deploy(
    await sessionKey.getAddress(),
    "0x"   // empty data for SessionKeyValidator.onInstall
  );
  await bootstrap.waitForDeployment();
  console.log("NexusBootstrap:", await bootstrap.getAddress());

  // 5. Deploy K1ValidatorFactory (no registry — pass address(0))
  const Factory = await ethers.getContractFactory("K1ValidatorFactory");
  const factory = await Factory.deploy(
    await nexusImpl.getAddress(),   // implementation
    deployer.address,               // factory owner
    await k1Validator.getAddress(), // k1Validator
    await bootstrap.getAddress(),   // bootstrapper
    ethers.ZeroAddress              // registry = address(0)
  );
  await factory.waitForDeployment();
  console.log("K1ValidatorFactory:", await factory.getAddress());

  // 6. Deploy other modules
  const SocialRecovery = await ethers.getContractFactory("SocialRecoveryValidator");
  const socialRecovery = await SocialRecovery.deploy();
  await socialRecovery.waitForDeployment();
  console.log("SocialRecoveryValidator:", await socialRecovery.getAddress());

  const WebAuthn = await ethers.getContractFactory("WebAuthnValidator");
  const webAuthn = await WebAuthn.deploy();
  await webAuthn.waitForDeployment();
  console.log("WebAuthnValidator:", await webAuthn.getAddress());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});


/**
 * Account-abstraction-With-frontend % npx hardhat run scripts/deployNexus.ts --network am
oy

Deploying with account: 0x878344AF84A404439Ea37cFB9b30DeFd7938741C
K1Validator: 0x6D9fa2049871E3A289e1b02802CCF2766A273934
Nexus Implementation: 0xC71BFb170CB1133D3dD3F587B0E9BFAD848a2aAd
SessionKeyValidator: 0x9041a9bcEd4AB2081a3478FFDc3B14A256bE2751
NexusBootstrap: 0x532f3D72cf031d91C73FA27bb90d0BbBF0B027dE
K1ValidatorFactory: 0xE0e5bb7F24585A9Ca2862c2aB32e2Ae4028295c7
SocialRecoveryValidator: 0x5595b8bDfd587daDAbA3bCeEEb49b69254251E15
WebAuthnValidator: 0xA9FFe3A0a3e2a4404a2dE0118c04934BFb9306aA
jatinsharma@Akshay-709-M1-C07JY0FDQ6P0 Account-abstraction-With-frontend % 
 */