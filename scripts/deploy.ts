import hre from "hardhat";
import "dotenv/config"

const ENTRYPOINT =
process.env.ENTRY_POINT;

const SALT = 1;

async function main() {

 const { ethers } =
   await hre.network.connect();

 const [owner] =
   await ethers.getSigners();

 console.log("EOA:", owner.address);

 /*
 deploy factory
 */

 const Factory =
   await ethers.getContractFactory(
     "SmartAccountFactory"
   );

 const factory =
   await Factory.deploy(
     ENTRYPOINT!
   );

 await factory.waitForDeployment();

 const factoryAddr =
   await factory.getAddress(owner.address,1);

 console.log("Factory:", factoryAddr);

 /*
 predict smart account
 */

 const predicted =
   await factory
   .getFunction("getAddress")(
     owner.address,
     SALT
   );

 console.log(
   "Predicted SmartAccount:",
   predicted
 );

 /*
 check if already deployed
 */

 const code =
   await ethers.provider.getCode(
     predicted
   );

 if (code === "0x") {

   console.log(
     "Deploying SmartAccount..."
   );

   const tx =
     await factory
     .getFunction("createAccount")(
        owner.address,
        SALT
     );

   await tx.wait();

   console.log(
     "SmartAccount deployed"
   );

 } else {

   console.log(
     "SmartAccount already exists"
   );
 }

 /*
 optional deposit
 */

 const entryPoint =
   await ethers.getContractAt(
     "IEntryPoint",
     ENTRYPOINT!
   );

 const balance =
   await entryPoint.balanceOf(
     predicted
   );

 if (balance === 0n) {

   console.log(
     "Depositing 0.01 ETH..."
   );

   await entryPoint.depositTo(
     predicted,
     {
       value:
       ethers.parseEther("0.01")
     }
   );

   console.log(
     "Deposit complete"
   );

 } else {

   console.log(
     "Already funded:",
     balance.toString()
   );
 }

 console.log("\nDONE");
 console.log("Factory:", factoryAddr);
 console.log(
   "SmartAccount:",
   predicted
 );

}

main().catch(console.error);


// /**
//  * npx hardhat run scripts/deploy.ts --network sepol
// ia

// EOA: 0x878344AF84A404439Ea37cFB9b30DeFd7938741C
// Factory: 0x8d6409753A2c4F2790b992fD00db897731dEA012
// Predicted SmartAccount: 0xD73e74C58C6593B1070bA4561b2fbd2746b3d29b
// Deploying SmartAccount...
// SmartAccount deployed
// Depositing 0.01 ETH...
// Deposit complete

// DONE
// Factory: 0x8d6409753A2c4F2790b992fD00db897731dEA012
// SmartAccount: 0xD73e74C58C6593B1070bA4561b2fbd2746b3d29b
// PayMaster: 0xEDb1cE51Bb33640EC64207F158bdA398cF471dd1
// harish@harish-Vostro:~/Desktop/v0.6$ 
//  * 
//  */

