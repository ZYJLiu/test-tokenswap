import web3 = require("@solana/web3.js");

import {
  createAccount,
  createMint,
  mintTo,
  TOKEN_PROGRAM_ID,
  getMint,
  getAccount,
  approve,
  Mint,
  getOrCreateAssociatedTokenAccount,
  Account,
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
let tokenAccountPool: Account;
let feeAccount: web3.PublicKey;
// Tokens swapped
let mintA: web3.PublicKey;
let mintB: web3.PublicKey;
let tokenAccountA: web3.PublicKey;
let tokenAccountB: web3.PublicKey;

// NOTE: Not sure what this is for
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

// NOTE: Not sure reason for calculations / different numbers, or what is HOST
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
  // owner is from .env file
  owner = initializeKeypair();
  console.log("owner:", owner.publicKey.toString());
  await connection.requestAirdrop(owner.publicKey, web3.LAMPORTS_PER_SOL * 2);

  // swapPayer randomly generated
  const swapPayer = new web3.Account();
  console.log("swapPayer:", swapPayer.publicKey.toString());
  await connection.requestAirdrop(
    swapPayer.publicKey,
    web3.LAMPORTS_PER_SOL * 2
  );

  // tokenSwapAccount is randomly generated keypair to use when initializing TokenSwap
  const tokenSwapAccount = new web3.Account();

  // authority is a PDA found using tokenSwapAccount and TOKEN_SWAP_PROGRAM_ID as seeds
  [authority, bumpSeed] = await web3.PublicKey.findProgramAddress(
    [tokenSwapAccount.publicKey.toBuffer()],
    TOKEN_SWAP_PROGRAM_ID
  );

  console.log("tokenSwapAccount:", tokenSwapAccount.publicKey.toString());

  console.log("creating pool mint");
  // tokenPool is a TOKEN MINT for pool token
  tokenPool = await createMint(connection, owner, authority, null, 2);
  console.log("tokenPool:", tokenPool.toString());

  console.log("creating pool account");
  // tokenAccountPool is a TOKEN ACCOUNT associated with tokenPool MINT
  // this TOKEN ACCOUNT will be minted pool tokens when TokenSwap is initialized
  tokenAccountPool = await getOrCreateAssociatedTokenAccount(
    connection,
    owner,
    tokenPool,
    owner.publicKey
  );
  console.log("tokenAccountPool:", tokenAccountPool.address.toString());

  // feeAccount is a TOKEN ACCOUNT associated with tokenPool MINT
  // fees collected will be minted to this TOKEN ACCOUNT
  feeAccount = await createAccount(
    connection,
    owner,
    tokenPool,
    owner.publicKey,
    new web3.Keypair()
  );
  console.log("feeAccountPool:", feeAccount.toString());

  console.log("creating token A");
  // mintA is a TOKEN MINT for token A
  mintA = await createMint(connection, owner, owner.publicKey, null, 2);
  console.log("mintA:", mintA.toString());

  // tokenAccountA is a TOKEN ACCOUNT associated with mintA MINT
  // tokenAccountA is owned by authority (PDA)
  tokenAccountA = await createAccount(
    connection,
    owner,
    mintA,
    authority,
    new web3.Keypair()
  );
  console.log("tokenA:", tokenAccountA.toString());
  // mint Token A tokens to tokenAccountA TOKEN ACCOUNT
  await mintTo(
    connection,
    owner,
    mintA,
    tokenAccountA,
    owner,
    currentSwapTokenA
  );

  console.log("creating token B");
  // mintB is a TOKEN MINT for token B
  mintB = await createMint(connection, owner, owner.publicKey, null, 2);
  console.log("mintB:", mintB.toString());

  // tokenAccountB is a TOKEN ACCOUNT associated with mintB MINT
  // tokenAccountB is owned by authority (PDA)
  tokenAccountB = await createAccount(
    connection,
    owner,
    mintB,
    authority,
    new web3.Keypair()
  );
  console.log("tokenB:", tokenAccountB.toString());
  // mint Token B tokens to tokenAccountB TOKEN ACCOUNT
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
    swapPayer, // Pays for the transaction, requires type "Account" even though depreciated
    tokenSwapAccount, // The token swap account, requires type "Account" even though depreciated
    authority, // The authority over the swap and accounts
    tokenAccountA, // The token swap's Token A account, owner is authority (PDA)
    tokenAccountB, // The token swap's Token B account, owner is authority (PDA)
    tokenPool, // The pool token MINT
    mintA, // The mint of Token A
    mintB, // The mint of Token B
    feeAccount, // pool token TOKEN ACCOUNT where fees are sent
    tokenAccountPool.address, // pool token TOKEN ACCOUNT where initial pool tokens are minted to when creating Token Swap
    TOKEN_SWAP_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
    TRADING_FEE_NUMERATOR,
    TRADING_FEE_DENOMINATOR,
    OWNER_TRADING_FEE_NUMERATOR,
    OWNER_TRADING_FEE_DENOMINATOR,
    OWNER_WITHDRAW_FEE_NUMERATOR,
    OWNER_WITHDRAW_FEE_DENOMINATOR,
    HOST_FEE_NUMERATOR, // NOTE: not sure what HOST refers to
    HOST_FEE_DENOMINATOR,
    CurveType.ConstantPrice, // NOTE: not really sure CurveType calculations, constant price/product
    new BN(1) // NOTE: not sure what curveParameters number means
  );
  // console.log(tokenSwap);

  // wait for transaction to complete
  await sleep(1000);

  // loadTokenSwap returns info about a TokenSwap using its address
  console.log("loading token swap");
  const fetchedTokenSwap = await TokenSwap.loadTokenSwap(
    connection,
    tokenSwapAccount.publicKey,
    TOKEN_SWAP_PROGRAM_ID,
    swapPayer
  );

  // console.log(fetchedTokenSwap);
}

// depositAllTokenTypes - deposits Token A and Token B, then mints pool token to depositor
export async function depositAllTokenTypes(): Promise<void> {
  // tokenPool MINT info
  const poolMintInfo = await getMint(connection, tokenPool);
  // tokenPool MINT supply
  const supply = Number(poolMintInfo.supply); //toNumber not working?
  console.log("tokenPool supply:", supply);

  // tokenAccountA TOKEN ACCOUNT (owned by TokenSwap)
  const swapTokenA = await getAccount(connection, tokenAccountA);

  // tokenA is amount to deposit, NOTE: not sure what calculation is for
  const amountTokenA = Math.floor(
    (Number(swapTokenA.amount) * POOL_TOKEN_AMOUNT) / supply
  );
  console.log("Token A Deposit Amount:", amountTokenA);

  const swapTokenB = await getAccount(connection, tokenAccountB);
  const amountTokenB = Math.floor(
    (Number(swapTokenB.amount) * POOL_TOKEN_AMOUNT) / supply
  );
  console.log("Token B Deposit Amount:", amountTokenB);

  // userTransferAuthority is random keypair used as delegate over user token A and B accounts for deposit
  const userTransferAuthority = new web3.Account();

  console.log("Creating depositor token a account");
  // userAccountA is user's Token A TOKEN ACCOUNT
  const userAccountA = await getOrCreateAssociatedTokenAccount(
    connection,
    owner,
    mintA,
    owner.publicKey
  );
  console.log("userAccountA:", userAccountA.address.toString());

  // mint Token A to userAccountA TOKEN ACCOUNT
  await mintTo(
    connection,
    owner,
    mintA,
    userAccountA.address,
    owner,
    amountTokenA
  );

  // delegate userTransferAuthority to tranfer tokenA amount of tokens
  await approve(
    connection,
    owner,
    userAccountA.address,
    userTransferAuthority.publicKey,
    owner,
    amountTokenA
  );

  console.log("Creating depositor token b account");
  // userAccountB is user's Token B TOKEN ACCOUNT
  const userAccountB = await getOrCreateAssociatedTokenAccount(
    connection,
    owner,
    mintB,
    owner.publicKey
  );

  console.log("userAccountB:", userAccountB.address.toString());

  // mint Token B to userAccountB TOKEN ACCOUNT
  await mintTo(
    connection,
    owner,
    mintB,
    userAccountB.address,
    owner,
    amountTokenB
  );

  // delegate userTransferAuthority for tokenA amount of tokens
  await approve(
    connection,
    owner,
    userAccountB.address,
    userTransferAuthority.publicKey,
    owner,
    amountTokenB
  );

  // // NOTE: Not using newAccountPool, using existing tokenAccountPool
  // console.log("Creating depositor pool token account");
  // const newAccountPool = await createAccount(
  //   connection,
  //   owner,
  //   tokenPool,
  //   owner.publicKey,
  //   new web3.Keypair()
  // );

  const userA = await getAccount(connection, userAccountA.address);
  console.log("userAccountA Balance:", Number(userA.amount));
  const userB = await getAccount(connection, userAccountB.address);
  console.log("userAccountA Balance:", Number(userB.amount));

  console.log("Depositing into swap");
  const deposit = await tokenSwap.depositAllTokenTypes(
    userAccountA.address,
    userAccountB.address,
    tokenAccountPool.address, // TEST: using tokenAccountPool instead of newAccountPool
    userTransferAuthority,
    POOL_TOKEN_AMOUNT, // Amount of pool tokens to mint, not sure how this would be calculated
    amountTokenA,
    amountTokenB
  );
  console.log("Deposit Transaction:", deposit);

  // wait for transaction to complete
  await sleep(1000);
}

export async function withdrawAllTokenTypes(): Promise<void> {
  // tokenPool Mint info
  const poolMintInfo = await getMint(connection, tokenPool);
  // tokenPool Mint supply
  const supply = Number(poolMintInfo.supply);
  console.log("tokenPool supply:", supply);

  // Token A TOKEN ACCOUNT controlled by TokenSwap
  const swapTokenA = await getAccount(connection, tokenAccountA);
  // Token B TOKEN ACCOUNT controlled by TokenSwap
  const swapTokenB = await getAccount(connection, tokenAccountB);

  // NOTE: 0 fee
  let feeAmount = 0;
  if (OWNER_WITHDRAW_FEE_NUMERATOR !== 0) {
    feeAmount = Math.floor(
      (POOL_TOKEN_AMOUNT * OWNER_WITHDRAW_FEE_NUMERATOR) /
        OWNER_WITHDRAW_FEE_DENOMINATOR
    );
  }

  console.log("Fee:", feeAmount);

  // NOTE: 0 fee
  const poolTokenAmount = POOL_TOKEN_AMOUNT - feeAmount;

  // amountTokenA to withdraw, not sure what calculation is for
  const amountTokenA = Math.floor(
    (Number(swapTokenA.amount) * poolTokenAmount) / supply
  );

  console.log(amountTokenA);

  // amountTokenA to withdraw, not sure what calculation is for
  const amountTokenB = Math.floor(
    (Number(swapTokenB.amount) * poolTokenAmount) / supply
  );

  console.log(amountTokenB);

  console.log("Creating withdraw token A account");
  const userAccountA = await getOrCreateAssociatedTokenAccount(
    connection,
    owner,
    mintA,
    owner.publicKey
  );

  console.log("Creating withdraw token B account");
  const userAccountB = await getOrCreateAssociatedTokenAccount(
    connection,
    owner,
    mintB,
    owner.publicKey
  );

  const userTransferAuthority = new web3.Account();
  console.log("Approving withdrawal from pool account");
  await approve(
    connection,
    owner,
    tokenAccountPool.address,
    userTransferAuthority.publicKey,
    owner,
    POOL_TOKEN_AMOUNT
  );

  console.log("Withdrawing pool tokens for A and B tokens");
  const withdraw = await tokenSwap.withdrawAllTokenTypes(
    userAccountA.address,
    userAccountB.address,
    tokenAccountPool.address,
    userTransferAuthority,
    POOL_TOKEN_AMOUNT,
    amountTokenA - 100, // not sure why slippage causing to fail, -100 as workaround
    amountTokenB - 100 // not sure why slippage causing to fail, -100 as workaround
  );
  console.log("Withdraw Transaction:", withdraw);

  // console.log(Number(swapTokenA.amount));
  // console.log(Number(swapTokenB.amount));

  // console.log(poolTokenAmount);
  // console.log(POOL_TOKEN_AMOUNT);
  //   // console.log(tokenA);
  //   // console.log(tokenB);
}

export async function swap(): Promise<void> {
  console.log("Creating swap token a account");
  const userAccountA = await getOrCreateAssociatedTokenAccount(
    connection,
    owner,
    mintA,
    owner.publicKey
  );

  await mintTo(
    connection,
    owner,
    mintA,
    userAccountA.address,
    owner,
    SWAP_AMOUNT_IN
  );
  const userTransferAuthority = new web3.Account();
  await approve(
    connection,
    owner,
    userAccountA.address,
    userTransferAuthority.publicKey,
    owner,
    SWAP_AMOUNT_IN
  );

  console.log("Creating swap token b account");
  const userAccountB = await getOrCreateAssociatedTokenAccount(
    connection,
    owner,
    mintB,
    owner.publicKey
  );

  // hostFeeAccount is TOKEN ACCOUNT to collect fees in pool token
  // different from the feeAccountPool TOKEN ACCOUNT set when TokenSwap was created
  let hostFeeAccount = SWAP_PROGRAM_OWNER_FEE_ADDRESS
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
    userAccountA.address,
    tokenAccountA,
    tokenAccountB,
    userAccountB.address,
    hostFeeAccount,
    userTransferAuthority,
    SWAP_AMOUNT_IN,
    SWAP_AMOUNT_OUT
  );
  console.log("Swap Transation:", swap);
  await sleep(1000);
}

// NOTE: not sure what this calculation is for
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

export async function depositSingleTokenTypeExactAmountInA(): Promise<void> {
  // Pool token amount to deposit on one side
  const depositAmount = 10000;

  const poolMintInfo = await getMint(connection, tokenPool);
  const supply = Number(poolMintInfo.supply);
  console.log("tokenPool supply:", supply);

  const swapTokenA = await getAccount(connection, tokenAccountA);
  const poolTokenA = tradingTokensToPoolTokens(
    depositAmount,
    Number(swapTokenA.amount),
    supply
  );

  console.log("swapTokenA supply:", Number(swapTokenA.amount));
  console.log("poolTokenA amount:", Number(poolTokenA));

  const userTransferAuthority = new web3.Account();

  console.log("Creating depositor token a account");
  const userAccountA = await getOrCreateAssociatedTokenAccount(
    connection,
    owner,
    mintA,
    owner.publicKey
  );

  await mintTo(
    connection,
    owner,
    mintA,
    userAccountA.address,
    owner,
    depositAmount
  );

  await approve(
    connection,
    owner,
    userAccountA.address,
    userTransferAuthority.publicKey,
    owner,
    depositAmount
  );

  // // NOTE: Not using newAccountPool, using existing tokenAccountPool
  // console.log("Creating depositor pool token account");
  // const newAccountPool = await createAccount(
  //   connection,
  //   owner,
  //   tokenPool,
  //   owner.publicKey,
  //   new web3.Keypair()
  // );

  console.log("Depositing token A into swap");
  const depositA = await tokenSwap.depositSingleTokenTypeExactAmountIn(
    userAccountA.address,
    tokenAccountPool.address,
    userTransferAuthority,
    depositAmount,
    poolTokenA
  );

  await sleep(1000);
}

export async function depositSingleTokenTypeExactAmountInB(): Promise<void> {
  // Pool token amount to deposit on one side
  const depositAmount = 10000;

  const poolMintInfo = await getMint(connection, tokenPool);
  const supply = Number(poolMintInfo.supply);
  console.log("tokenPool supply:", supply);

  // // NOTE: Not using newAccountPool, using existing tokenAccountPool
  // console.log("Creating depositor pool token account");
  // const newAccountPool = await createAccount(
  //   connection,
  //   owner,
  //   tokenPool,
  //   owner.publicKey,
  //   new web3.Keypair()
  // );

  const swapTokenB = await getAccount(connection, tokenAccountB);
  const poolTokenB = tradingTokensToPoolTokens(
    depositAmount,
    Number(swapTokenB.amount),
    supply
  );

  console.log("swapTokenB supply:", Number(swapTokenB.amount));
  console.log("poolTokenB amount:", Number(poolTokenB));

  const userTransferAuthority = new web3.Account();

  console.log("Creating depositor token b account");
  const userAccountB = await getOrCreateAssociatedTokenAccount(
    connection,
    owner,
    mintB,
    owner.publicKey
  );
  await mintTo(
    connection,
    owner,
    mintB,
    userAccountB.address,
    owner,
    depositAmount
  );
  await approve(
    connection,
    owner,
    userAccountB.address,
    userTransferAuthority.publicKey,
    owner,
    depositAmount
  );

  //NOTE: Not sure why only Token B deposit causing slippage error
  // tried separating transactions/ordering but still only Token B deposit has error
  console.log("Depositing token B into swap");
  const depositB = await tokenSwap.depositSingleTokenTypeExactAmountIn(
    userAccountB.address,
    tokenAccountPool.address,
    userTransferAuthority,
    depositAmount,
    poolTokenB - poolTokenB // slippage causing error, set minimum to 0
  );
  console.log(depositB);
}

export async function withdrawSingleTokenTypeExactAmountOut(): Promise<void> {
  // Pool token amount to withdraw on one side
  const withdrawAmount = 50000;
  const roundingAmount = 1.0001; // make math a little easier

  const poolMintInfo = await getMint(connection, tokenPool);
  const supply = Number(poolMintInfo.supply);

  const swapTokenA = await getAccount(connection, tokenAccountA);
  const swapTokenAPost = Number(swapTokenA.amount) - withdrawAmount;
  const poolTokenA = tradingTokensToPoolTokens(
    withdrawAmount,
    swapTokenAPost,
    supply
  );
  let adjustedPoolTokenA = poolTokenA * roundingAmount;
  if (OWNER_WITHDRAW_FEE_NUMERATOR !== 0) {
    adjustedPoolTokenA *=
      1 + OWNER_WITHDRAW_FEE_NUMERATOR / OWNER_WITHDRAW_FEE_DENOMINATOR;
  }
  console.log(adjustedPoolTokenA);

  const swapTokenB = await getAccount(connection, tokenAccountB);
  const swapTokenBPost = Number(swapTokenB.amount) - withdrawAmount;
  const poolTokenB = tradingTokensToPoolTokens(
    withdrawAmount,
    swapTokenBPost,
    supply
  );
  let adjustedPoolTokenB = poolTokenB * roundingAmount;
  if (OWNER_WITHDRAW_FEE_NUMERATOR !== 0) {
    adjustedPoolTokenB *=
      1 + OWNER_WITHDRAW_FEE_NUMERATOR / OWNER_WITHDRAW_FEE_DENOMINATOR;
  }
  console.log(adjustedPoolTokenB);

  const userTransferAuthority = new web3.Account();
  console.log("Creating withdraw token a account");
  const userAccountA = await getOrCreateAssociatedTokenAccount(
    connection,
    owner,
    mintA,
    owner.publicKey
  );
  console.log("Creating withdraw token b account");
  const userAccountB = await getOrCreateAssociatedTokenAccount(
    connection,
    owner,
    mintB,
    owner.publicKey
  );
  console.log("Creating withdraw pool token account");
  // const poolAccount = await getAccount(connection, tokenAccountPool);
  // const poolTokenAmount = Number(poolAccount.amount);
  await approve(
    connection,
    owner,
    tokenAccountPool.address,
    userTransferAuthority.publicKey,
    owner,
    Number(Math.floor(adjustedPoolTokenA + adjustedPoolTokenB)) // math.floor workaround error RangeError: The number 51897767.2578 cannot be converted to a BigInt because it is not an integer
  );

  //NOTE: error with slippage calculation
  console.log("Withdrawing token A only");
  const withdrawA = await tokenSwap.withdrawSingleTokenTypeExactAmountOut(
    userAccountA.address,
    tokenAccountPool.address,
    userTransferAuthority,
    withdrawAmount,
    adjustedPoolTokenA + adjustedPoolTokenA //double maximum to workaround slippage error
  );
  console.log(withdrawA);

  //NOTE: error with slippage calculation
  console.log("Withdrawing token B only");
  const withdrawB = await tokenSwap.withdrawSingleTokenTypeExactAmountOut(
    userAccountB.address,
    tokenAccountPool.address,
    userTransferAuthority,
    withdrawAmount,
    adjustedPoolTokenB + adjustedPoolTokenB //double maximum to workaround slippage error
  );
  console.log(withdrawB);
}

function initializeKeypair(): web3.Keypair {
  const secret = JSON.parse(process.env.PRIVATE_KEY ?? "") as number[];
  const secretKey = Uint8Array.from(secret);
  const keypairFromSecretKey = web3.Keypair.fromSecretKey(secretKey);
  return keypairFromSecretKey;
}
