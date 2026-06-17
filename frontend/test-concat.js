const { ethers } = require('ethers');

const validatorAddress = "0x9a3b3a6b50ea32a777c5ee5aa209f1ed487cf21b";
const webAuthnSig = "0x0000000000000000000000000000000000000000000000000000000000000000";

const result = ethers.concat([validatorAddress, webAuthnSig]);
console.log(result);
console.log("Length in bytes:", (result.length - 2) / 2);
console.log("Extracted 20 bytes:", result.slice(0, 42));
