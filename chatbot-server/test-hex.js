const { ethers } = require('ethers');
try {
  console.log(ethers.toBeHex("1000000000000000"));
} catch (e) {
  console.log("Error:", e.message);
}
