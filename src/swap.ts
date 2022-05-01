import web3 = require("@solana/web3.js");
import {
  TokenSwap,
  CurveType,
  TOKEN_SWAP_PROGRAM_ID,
  Numberu64,
} from "@solana/spl-token-swap";
import {
  AccountLayout,
  createAccount,
  createMint,
  mintTo,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";

import { sleep } from "../src/util/sleep";

// import { Numberu64 } from "../src";

import BN from "bn.js";

import Dotenv from "dotenv";
import { loadAccount } from "./util/account";
Dotenv.config();

// Hard-coded fee address, for testing production mode
const SWAP_PROGRAM_OWNER_FEE_ADDRESS =
  process.env.SWAP_PROGRAM_OWNER_FEE_ADDRESS;

// Pool fees
const TRADING_FEE_NUMERATOR = 25;
const TRADING_FEE_DENOMINATOR = 10000;
const OWNER_TRADING_FEE_NUMERATOR = 5;
const OWNER_TRADING_FEE_DENOMINATOR = 10000;
const OWNER_WITHDRAW_FEE_NUMERATOR = SWAP_PROGRAM_OWNER_FEE_ADDRESS ? 0 : 1;
const OWNER_WITHDRAW_FEE_DENOMINATOR = SWAP_PROGRAM_OWNER_FEE_ADDRESS ? 0 : 6;
const HOST_FEE_NUMERATOR = 20;
const HOST_FEE_DENOMINATOR = 100;

async function main() {
  // const connection = new web3.Connection(web3.clusterApiUrl("devnet"));
  const connection = new web3.Connection("http://127.0.0.1:8899", "confirmed");

  const owner = initializeKeypair();
  console.log("owner:", owner.publicKey.toString());
  await connection.requestAirdrop(owner.publicKey, web3.LAMPORTS_PER_SOL * 2);
  const swapPayer = new web3.Account();
  console.log("swapPayer:", swapPayer.publicKey.toString());
  await connection.requestAirdrop(
    swapPayer.publicKey,
    web3.LAMPORTS_PER_SOL * 2
  );

  const tokenSwapAccount = new web3.Account();

  const [authority, bumpSeed] = await web3.PublicKey.findProgramAddress(
    [tokenSwapAccount.publicKey.toBuffer()],
    TOKEN_SWAP_PROGRAM_ID
  );

  // const balance = await connection.getBalance(swapPayer.publicKey);
  // console.log(balance / web3.LAMPORTS_PER_SOL);

  console.log("creating pool mint");
  const tokenPool = await createMint(connection, owner, authority, null, 2);
  console.log("tokenPool:", tokenPool.toString());

  console.log("creating pool account");
  const tokenAccountPool = await createAccount(
    connection,
    owner,
    tokenPool,
    owner.publicKey
    // new web3.Keypair()
  );
  console.log("tokenAccountPool:", tokenAccountPool.toString());

  const feeAccount = await createAccount(
    connection,
    owner,
    tokenPool,
    owner.publicKey,
    new web3.Keypair()
  );
  console.log("feeAccountPool:", feeAccount.toString());

  // const ownerKey = SWAP_PROGRAM_OWNER_FEE_ADDRESS || owner.publicKey.toString();

  console.log("creating token A");
  const mintA = await createMint(connection, owner, owner.publicKey, null, 2);
  console.log("mintA:", mintA.toString());

  const tokenA = await createAccount(
    connection,
    owner,
    mintA,
    authority,
    new web3.Keypair()
  );
  console.log("tokenA:", tokenA.toString());
  await mintTo(connection, owner, mintA, tokenA, owner, 10);

  console.log("creating token B");
  const mintB = await createMint(connection, owner, owner.publicKey, null, 2);
  console.log("mintB:", mintB.toString());

  const tokenB = await createAccount(
    connection,
    owner,
    mintB,
    authority,
    new web3.Keypair()
  );
  console.log("tokenB:", tokenB.toString());
  await mintTo(connection, owner, mintB, tokenB, owner, 10);

  const tokenSwap = await TokenSwap.createTokenSwap(
    connection,
    swapPayer,
    tokenSwapAccount,
    authority,
    tokenA,
    tokenB,
    tokenPool,
    mintA,
    mintB,
    feeAccount,
    tokenAccountPool,
    TOKEN_SWAP_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
    TRADING_FEE_NUMERATOR,
    TRADING_FEE_DENOMINATOR,
    OWNER_TRADING_FEE_NUMERATOR,
    OWNER_TRADING_FEE_DENOMINATOR,
    OWNER_WITHDRAW_FEE_NUMERATOR,
    OWNER_WITHDRAW_FEE_DENOMINATOR,
    HOST_FEE_NUMERATOR,
    HOST_FEE_DENOMINATOR,
    CurveType.ConstantPrice,
    new BN(1)
  );
  console.log(tokenSwap);

  const balance = await connection.getBalance(swapPayer.publicKey);
  console.log(balance / web3.LAMPORTS_PER_SOL);

  console.log("loading token swap");
  const fetchedTokenSwap = await TokenSwap.loadTokenSwap(
    connection,
    tokenSwapAccount.publicKey,
    TOKEN_SWAP_PROGRAM_ID,
    swapPayer
  );

  console.log(fetchedTokenSwap);

  // const tokenSwap = await TokenSwap.createInitSwapInstruction(
  //   // swapPayer,
  //   tokenSwapAccount,
  //   authority,
  //   tokenA,
  //   tokenB,
  //   tokenPool,
  //   feeAccount,
  //   tokenAccountPool,
  //   TOKEN_PROGRAM_ID,
  //   TOKEN_SWAP_PROGRAM_ID,
  //   TRADING_FEE_NUMERATOR,
  //   TRADING_FEE_DENOMINATOR,
  //   OWNER_TRADING_FEE_NUMERATOR,
  //   OWNER_TRADING_FEE_DENOMINATOR,
  //   OWNER_WITHDRAW_FEE_NUMERATOR,
  //   OWNER_WITHDRAW_FEE_DENOMINATOR,
  //   HOST_FEE_NUMERATOR,
  //   HOST_FEE_DENOMINATOR,
  //   CurveType.ConstantPrice,
  //   new BN(1)
  // );
}
main()
  .then(() => {
    console.log("Swap");
  })
  .catch((error) => {
    console.error(error);
  });

function initializeKeypair(): web3.Keypair {
  const secret = JSON.parse(process.env.PRIVATE_KEY ?? "") as number[];
  const secretKey = Uint8Array.from(secret);
  const keypairFromSecretKey = web3.Keypair.fromSecretKey(secretKey);
  return keypairFromSecretKey;
}
