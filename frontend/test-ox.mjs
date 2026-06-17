import { WebAuthnP256 } from 'ox';

console.log("WebAuthnP256 imported successfully.");

async function main() {
  const hexHash = "0xdeadbeef";
  console.log("Hex Hash:", hexHash);
  // How does ox encode it? We can't actually sign in Node.js because it requires navigator.credentials.
  // But we can check if it exposes any utility to build the challenge.
  try {
    const payload = WebAuthnP256.getSignPayload({ challenge: hexHash });
    console.log(payload);
  } catch (err) {
    console.log(err);
  }
}
main();
