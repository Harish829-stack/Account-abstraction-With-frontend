import hre from "hardhat";
const {ethers}= await hre.network.connect();
const RPC_URL="https://polygon-amoy.infura.io/v3/86b7c03e8d49460ca30a6845f81a6c80";


const FEED_ADDRESS = "0x001382149eBa3441043c1c66972b4772963f5D43";

const ABI = [
  "function decimals() view returns (uint8)",
  "function description() view returns (string)",
  "function version() view returns (uint256)",
  "function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)"
];

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);

  const feed = new ethers.Contract(
    FEED_ADDRESS,
    ABI,
    provider
  );

  const decimals = await feed.decimals();
  const description = await feed.description();
  const version = await feed.version();

  const [
    roundId,
    answer,
    startedAt,
    updatedAt,
    answeredInRound
  ] = await feed.latestRoundData();

  console.log("Description:", description);
  console.log("Decimals:", decimals);
  console.log("Version:", version);
  console.log("Round ID:", roundId.toString());
  console.log("Answer:", answer.toString());
  console.log(
    "Price:",
    Number(answer) / 10 ** Number(decimals)
  );
  console.log(
    "Updated At:",
    new Date(Number(updatedAt) * 1000).toISOString()
  );
  console.log(
    "Age (hours):",
    (Date.now() / 1000 - Number(updatedAt)) / 3600
  );
  console.log(
    "Answered In Round:",
    answeredInRound.toString()
  );
}

main().catch(console.error);