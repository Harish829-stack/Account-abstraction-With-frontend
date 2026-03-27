
import hre from "hardhat";
import "dotenv/config"

const ENTRYPOINT =
process.env.ENTRY_POINT;



async function main() {

 const { ethers } =
   await hre.network.connect();

 const [owner] =
   await ethers.getSigners();
   const paymasterSigner = owner;

 console.log("EOA:", owner.address);

 const Paymaster =
   await ethers.getContractFactory(
     "Paymaster"
   );

 const paymaster =
   await Paymaster.deploy(
     ENTRYPOINT!,
     paymasterSigner
   );

 await paymaster.waitForDeployment();

 const paymasterAddr =
   await paymaster.getAddress();

 console.log("Paymaster:", paymasterAddr);

 
 const entryPoint =
   await ethers.getContractAt(
     "IEntryPoint",
     ENTRYPOINT!
   );

 const balance =
   await entryPoint.balanceOf(
     paymasterAddr
   );

 if (balance === 0n) {

   console.log(
     "Depositing 0.01 ETH..."
   );

   await entryPoint.depositTo(
     paymasterAddr,
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
 console.log("PayMaster:", paymasterAddr);
    const balanceAfter =
   await entryPoint.balanceOf(
     paymasterAddr
   );
   console.log("balance after deposit: ",balanceAfter);

}

main().catch(console.error);


/**
 *  npx hardhat run scripts/deploy.ts --network sepolia

EOA: 0x878344AF84A404439Ea37cFB9b30DeFd7938741C
Paymaster: 0xEDb1cE51Bb33640EC64207F158bdA398cF471dd1
Depositing 0.01 ETH...
Deposit complete
balance after deposit:  0n

DONE
PayMaster: 0xEDb1cE51Bb33640EC64207F158bdA398cF471dd1
PayMaster: 0xEDb1cE51Bb33640EC64207F158bdA398cF471dd1
 */

