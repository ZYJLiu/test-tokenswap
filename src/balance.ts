import web3 = require("@solana/web3.js");

async function main() {
  const connection = new web3.Connection(web3.clusterApiUrl("devnet"));
  const publicKey = new web3.PublicKey(
    "EK8cufTtDZEBUEKQPNELo8P9uM8Fi3FbmUjbt7kjjNPm"
  );

  const balance = await connection.getBalance(publicKey);
  console.log(balance / web3.LAMPORTS_PER_SOL);
}
main()
  .then(() => {
    console.log("Balance in SOL");
  })
  .catch((error) => {
    console.error(error);
  });
