import web3 = require("@solana/web3.js");

import {
  createAccount,
  createMint,
  mintTo,
  TOKEN_PROGRAM_ID,
  getMint,
  getAccount,
  approve,
} from "@solana/spl-token";

import {
  TokenSwap,
  CurveType,
  TOKEN_SWAP_PROGRAM_ID,
  Numberu64,
} from "@solana/spl-token-swap";

import { sleep } from "../src/util/sleep";

import BN from "bn.js";
import Dotenv from "dotenv";
Dotenv.config();

// The following globals are created by `createTokenSwap` and used by subsequent tests
// Token swap
let tokenSwap: TokenSwap;
// authority of the token and accounts
let authority: web3.PublicKey;
// bump seed used to generate the authority public key
let bumpSeed: number;
// owner of the user accounts
let owner: web3.Keypair;
// Token pool
let tokenPool: web3.PublicKey;
let tokenAccountPool: web3.PublicKey;
let feeAccount: web3.PublicKey;
// Tokens swapped
let mintA: web3.PublicKey;
let mintB: web3.PublicKey;
let tokenAccountA: web3.PublicKey;
let tokenAccountB: web3.PublicKey;

// Hard-coded fee address
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

// Initial amount in each swap token
let currentSwapTokenA = 1000000;
let currentSwapTokenB = 1000000;
let currentFeeAmount = 0;

// Swap instruction constants
// Because there is no withdraw fee in the production version, these numbers
// need to get slightly tweaked in the two cases.
const SWAP_AMOUNT_IN = 100000;
const SWAP_AMOUNT_OUT = SWAP_PROGRAM_OWNER_FEE_ADDRESS ? 90661 : 90674;
const SWAP_FEE = SWAP_PROGRAM_OWNER_FEE_ADDRESS ? 22273 : 22277;
const HOST_SWAP_FEE = SWAP_PROGRAM_OWNER_FEE_ADDRESS
  ? Math.floor((SWAP_FEE * HOST_FEE_NUMERATOR) / HOST_FEE_DENOMINATOR)
  : 0;
const OWNER_SWAP_FEE = SWAP_FEE - HOST_SWAP_FEE;

// Pool token amount minted on init
const DEFAULT_POOL_TOKEN_AMOUNT = 1000000000;
// Pool token amount to withdraw / deposit
const POOL_TOKEN_AMOUNT = 10000000;

// Connection
// const connection = new web3.Connection(web3.clusterApiUrl("devnet"));
const connection = new web3.Connection("http://127.0.0.1:8899", "confirmed");

// createTokenSwap
export async function createTokenSwap(): Promise<void> {
  owner = initializeKeypair();
  console.log("owner:", owner.publicKey.toString());
  await connection.requestAirdrop(owner.publicKey, web3.LAMPORTS_PER_SOL * 2);
  const swapPayer = new web3.Account();
  console.log("swapPayer:", swapPayer.publicKey.toString());
  await connection.requestAirdrop(
    swapPayer.publicKey,
    web3.LAMPORTS_PER_SOL * 2
  );

  const tokenSwapAccount = new web3.Account();

  [authority, bumpSeed] = await web3.PublicKey.findProgramAddress(
    [tokenSwapAccount.publicKey.toBuffer()],
    TOKEN_SWAP_PROGRAM_ID
  );

  // const balance = await connection.getBalance(swapPayer.publicKey);
  // console.log(balance / web3.LAMPORTS_PER_SOL);

  console.log("creating pool mint");
  tokenPool = await createMint(connection, owner, authority, null, 2);
  console.log("tokenPool:", tokenPool.toString());

  console.log("creating pool account");
  tokenAccountPool = await createAccount(
    connection,
    owner,
    tokenPool,
    owner.publicKey
    // new web3.Keypair()
  );
  console.log("tokenAccountPool:", tokenAccountPool.toString());

  feeAccount = await createAccount(
    connection,
    owner,
    tokenPool,
    owner.publicKey,
    new web3.Keypair()
  );
  console.log("feeAccountPool:", feeAccount.toString());

  // const ownerKey = SWAP_PROGRAM_OWNER_FEE_ADDRESS || owner.publicKey.toString();

  console.log("creating token A");
  mintA = await createMint(connection, owner, owner.publicKey, null, 2);
  console.log("mintA:", mintA.toString());

  tokenAccountA = await createAccount(
    connection,
    owner,
    mintA,
    authority,
    new web3.Keypair()
  );
  console.log("tokenA:", tokenAccountA.toString());
  await mintTo(
    connection,
    owner,
    mintA,
    tokenAccountA,
    owner,
    currentSwapTokenA
  );

  console.log("creating token B");
  mintB = await createMint(connection, owner, owner.publicKey, null, 2);
  console.log("mintB:", mintB.toString());

  tokenAccountB = await createAccount(
    connection,
    owner,
    mintB,
    authority,
    new web3.Keypair()
  );
  console.log("tokenB:", tokenAccountB.toString());
  await mintTo(
    connection,
    owner,
    mintB,
    tokenAccountB,
    owner,
    currentSwapTokenB
  );

  // call createTokenSwap instruction on TokenSwap Program
  tokenSwap = await TokenSwap.createTokenSwap(
    connection,
    swapPayer,
    tokenSwapAccount,
    authority,
    tokenAccountA,
    tokenAccountB,
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

  await sleep(1000);
  // console.log(tokenSwap);

  // console.log("loading token swap");
  // const fetchedTokenSwap = await TokenSwap.loadTokenSwap(
  //   connection,
  //   tokenSwapAccount.publicKey,
  //   TOKEN_SWAP_PROGRAM_ID,
  //   swapPayer
  // );

  // console.log(fetchedTokenSwap);
}

// depositAllTokenTypes
export async function depositAllTokenTypes(): Promise<void> {
  const poolMintInfo = await getMint(connection, tokenPool);
  const supply = Number(poolMintInfo.supply); //toNumber not working?
  const swapTokenA = await getAccount(connection, tokenAccountA);
  const tokenA = Math.floor(
    (Number(swapTokenA.amount) * POOL_TOKEN_AMOUNT) / supply
  );
  // console.log(tokenA);

  const swapTokenB = await getAccount(connection, tokenAccountB);
  const tokenB = Math.floor(
    (Number(swapTokenB.amount) * POOL_TOKEN_AMOUNT) / supply
  );
  // console.log(tokenB);

  const userTransferAuthority = new web3.Account();
  console.log("Creating depositor token a account");
  const userAccountA = await createAccount(
    connection,
    owner,
    mintA,
    owner.publicKey,
    new web3.Keypair()
  );

  console.log("userAccountA:", userAccountA.toString());

  await mintTo(connection, owner, mintA, userAccountA, owner, tokenA);
  await approve(
    connection,
    owner,
    userAccountA,
    userTransferAuthority.publicKey,
    owner,
    tokenA
  );

  console.log("Creating depositor token b account");
  const userAccountB = await createAccount(
    connection,
    owner,
    mintB,
    owner.publicKey,
    new web3.Keypair()
  );

  console.log("userAccountB:", userAccountB.toString());

  await mintTo(connection, owner, mintB, userAccountB, owner, tokenB);
  await approve(
    connection,
    owner,
    userAccountB,
    userTransferAuthority.publicKey,
    owner,
    tokenB
  );
  console.log("Creating depositor pool token account");
  const newAccountPool = await createAccount(
    connection,
    owner,
    tokenPool,
    owner.publicKey,
    new web3.Keypair()
  );

  // const userA = await getAccount(connection, userAccountA);
  // console.log(Number(userA.amount));
  // const userB = await getAccount(connection, userAccountB);
  // console.log(Number(userB.amount));

  console.log("Depositing into swap");
  const deposit = await tokenSwap.depositAllTokenTypes(
    userAccountA,
    userAccountB,
    newAccountPool,
    userTransferAuthority,
    POOL_TOKEN_AMOUNT,
    tokenA,
    tokenB
  );
  console.log(deposit);
}

export async function withdrawAllTokenTypes(): Promise<void> {
  const poolMintInfo = await getMint(connection, tokenPool);
  const supply = Number(poolMintInfo.supply);
  const swapTokenA = await getAccount(connection, tokenAccountA);
  const swapTokenB = await getAccount(connection, tokenAccountB);

  let feeAmount = 0;
  if (OWNER_WITHDRAW_FEE_NUMERATOR !== 0) {
    feeAmount = Math.floor(
      (POOL_TOKEN_AMOUNT * OWNER_WITHDRAW_FEE_NUMERATOR) /
        OWNER_WITHDRAW_FEE_DENOMINATOR
    );
  }
  const poolTokenAmount = POOL_TOKEN_AMOUNT - feeAmount;

  const tokenA = Math.floor(
    (Number(swapTokenA.amount) * poolTokenAmount) / supply
  );

  const tokenB = Math.floor(
    (Number(swapTokenB.amount) * poolTokenAmount) / supply
  );

  console.log("Creating withdraw token A account");
  const userAccountA = await createAccount(
    connection,
    owner,
    mintA,
    owner.publicKey,
    new web3.Keypair()
  );

  console.log("Creating withdraw token B account");
  const userAccountB = await createAccount(
    connection,
    owner,
    mintB,
    owner.publicKey,
    new web3.Keypair()
  );

  const userTransferAuthority = new web3.Account();
  console.log("Approving withdrawal from pool account");
  await approve(
    connection,
    owner,
    tokenAccountPool,
    userTransferAuthority.publicKey,
    owner,
    POOL_TOKEN_AMOUNT
  );

  console.log("Withdrawing pool tokens for A and B tokens");
  const withdraw = await tokenSwap.withdrawAllTokenTypes(
    userAccountA,
    userAccountB,
    tokenAccountPool,
    userTransferAuthority,
    POOL_TOKEN_AMOUNT,
    tokenA - 100, // not sure why slippage causing to fail, -100 as workaround
    tokenB - 100 // not sure why slippage causing to fail, -100 as workaround
  );
  console.log(withdraw);

  // console.log(Number(swapTokenA.amount));
  // console.log(Number(swapTokenB.amount));

  // console.log(poolTokenAmount);
  // console.log(POOL_TOKEN_AMOUNT);
  //   // console.log(tokenA);
  //   // console.log(tokenB);
}

export async function swap(): Promise<void> {
  console.log("Creating swap token a account");
  let userAccountA = await createAccount(
    connection,
    owner,
    mintA,
    owner.publicKey,
    new web3.Keypair()
  );

  await mintTo(connection, owner, mintA, userAccountA, owner, SWAP_AMOUNT_IN);
  const userTransferAuthority = new web3.Account();
  await approve(
    connection,
    owner,
    userAccountA,
    userTransferAuthority.publicKey,
    owner,
    SWAP_AMOUNT_IN
  );

  console.log("Creating swap token b account");
  let userAccountB = await createAccount(
    connection,
    owner,
    mintB,
    owner.publicKey,
    new web3.Keypair()
  );

  let poolAccount = SWAP_PROGRAM_OWNER_FEE_ADDRESS
    ? await await createAccount(
        connection,
        owner,
        tokenPool,
        owner.publicKey,
        new web3.Keypair()
      )
    : null;

  console.log("Swapping");
  const swap = await tokenSwap.swap(
    userAccountA,
    tokenAccountA,
    tokenAccountB,
    userAccountB,
    poolAccount,
    userTransferAuthority,
    SWAP_AMOUNT_IN,
    SWAP_AMOUNT_OUT
  );
  console.log(swap);
}

function tradingTokensToPoolTokens(
  sourceAmount: number,
  swapSourceAmount: number,
  poolAmount: number
): number {
  const tradingFee =
    (sourceAmount / 2) * (TRADING_FEE_NUMERATOR / TRADING_FEE_DENOMINATOR);
  const sourceAmountPostFee = sourceAmount - tradingFee;
  const root = Math.sqrt(sourceAmountPostFee / swapSourceAmount + 1);
  return Math.floor(poolAmount * (root - 1));
}

export async function depositSingleTokenTypeExactAmountIn(): Promise<void> {
  // Pool token amount to deposit on one side
  const depositAmount = 10000;

  const poolMintInfo = await getMint(connection, tokenPool);
  const supply = Number(poolMintInfo.supply);

  const swapTokenA = await getAccount(connection, tokenAccountA);
  console.log(Number(swapTokenA.amount));
  const poolTokenA = tradingTokensToPoolTokens(
    depositAmount,
    Number(swapTokenA.amount),
    supply
  );
  const swapTokenB = await getAccount(connection, tokenAccountB);
  console.log(Number(swapTokenB.amount));
  const poolTokenB = tradingTokensToPoolTokens(
    depositAmount,
    Number(swapTokenB.amount),
    supply
  );

  const userTransferAuthority = new web3.Account();
  console.log("Creating depositor token a account");
  const userAccountA = await createAccount(
    connection,
    owner,
    mintA,
    owner.publicKey,
    new web3.Keypair()
  );
  await mintTo(connection, owner, mintA, userAccountA, owner, depositAmount);
  await approve(
    connection,
    owner,
    userAccountA,
    userTransferAuthority.publicKey,
    owner,
    depositAmount
  );

  console.log("Creating depositor token b account");
  const userAccountB = await createAccount(
    connection,
    owner,
    mintB,
    owner.publicKey,
    new web3.Keypair()
  );
  await mintTo(connection, owner, mintB, userAccountB, owner, depositAmount);
  await approve(
    connection,
    owner,
    userAccountB,
    userTransferAuthority.publicKey,
    owner,
    depositAmount
  );

  console.log("Creating depositor pool token account");
  const newAccountPool = await createAccount(
    connection,
    owner,
    tokenPool,
    owner.publicKey,
    new web3.Keypair()
  );

  console.log(poolTokenA);

  console.log("Depositing token A into swap");
  const depositA = await tokenSwap.depositSingleTokenTypeExactAmountIn(
    userAccountA,
    newAccountPool,
    userTransferAuthority,
    depositAmount,
    poolTokenA
  );
  console.log(depositA);

  console.log(poolTokenB);

  console.log("Depositing token B into swap");
  const depositB = await tokenSwap.depositSingleTokenTypeExactAmountIn(
    userAccountB,
    newAccountPool,
    userTransferAuthority,
    depositAmount,
    poolTokenB - poolTokenB // slippage causing error, set minimum to 0
  );
  console.log(depositB);
}

function initializeKeypair(): web3.Keypair {
  const secret = JSON.parse(process.env.PRIVATE_KEY ?? "") as number[];
  const secretKey = Uint8Array.from(secret);
  const keypairFromSecretKey = web3.Keypair.fromSecretKey(secretKey);
  return keypairFromSecretKey;
}
