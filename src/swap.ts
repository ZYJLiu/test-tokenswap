import web3 = require("@solana/web3.js");
import {
  createTokenSwap,
  depositAllTokenTypes,
  withdrawAllTokenTypes,
  swap,
  depositSingleTokenTypeExactAmountIn,
} from "./token-swap-test";

import Dotenv from "dotenv";
Dotenv.config();

async function main() {
  await createTokenSwap();
  await depositAllTokenTypes();
  await withdrawAllTokenTypes();
  await swap();
  await depositSingleTokenTypeExactAmountIn();
}
main()
  .then(() => {
    console.log("Complete");
  })
  .catch((error) => {
    console.error(error);
  });
