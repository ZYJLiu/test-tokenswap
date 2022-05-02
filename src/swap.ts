import web3 = require("@solana/web3.js");
import { createTokenSwap, depositAllTokenTypes } from "./token-swap-test";

import Dotenv from "dotenv";
Dotenv.config();

async function main() {
  await createTokenSwap();
  await depositAllTokenTypes();
}
main()
  .then(() => {
    console.log("Swap");
  })
  .catch((error) => {
    console.error(error);
  });
