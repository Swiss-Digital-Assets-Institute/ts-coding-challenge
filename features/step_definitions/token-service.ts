import assert from "node:assert";
import { accounts, Account } from "../../src/config";
import { Before, Given, Then, When } from "@cucumber/cucumber";
import {
  AccountId, Client, Hbar, PrivateKey, TokenId, TokenSupplyType, TransactionRecord,
  TokenInfoQuery, TokenMintTransaction, TokenCreateTransaction, AccountBalanceQuery,
  ReceiptStatusError, TransferTransaction, TokenAssociateTransaction, AccountCreateTransaction
} from "@hashgraph/sdk";

let scenarioName: string;
let firstAccount: Account;
let secondAccount: Account;
let thirdAccount: Account;
let forthAccount: Account;
let tokenId: TokenId;
let tokenName: string;
let tokenSymbol: string;
let tokenSupply: number;
let tokenDecimals: number;
let treasuryAccountId: AccountId;
let transactionRecord: TransactionRecord;
let transferTransaction: TransferTransaction;

interface Balance {
  hbar: number;
  tokens: number;
}

const client = Client.forTestnet();

// private methods
const mintTokens = async (tokenAmount: number): Promise<string> => {
  const mintTransaction = new TokenMintTransaction()
    .setTokenId(tokenId)
    .setAmount(tokenAmount)
    .freezeWith(client);

  const signTx = await mintTransaction.sign(PrivateKey.fromStringED25519(firstAccount.privateKey));
  const txResponse = await signTx.execute(client);
  const receipt = await txResponse.getReceipt(client);
  const transactionStatus = receipt.status;

  return transactionStatus.toString();
};
const transferTokens = async (fromAccount: Account, toAccount: Account, tokenId: TokenId, tokenAmount: number) => {
  const accountId = AccountId.fromString(toAccount.id);
  const privateKey = PrivateKey.fromStringED25519(toAccount.privateKey);

  const transaction = new TokenAssociateTransaction()
    .setAccountId(accountId)
    .setTokenIds([tokenId])
    .freezeWith(client);

  const signTx = await transaction.sign(privateKey);
  await signTx.execute(client);

  const transferTx = new TransferTransaction()
    .addTokenTransfer(tokenId, fromAccount.id, -1 * tokenAmount)
    .addTokenTransfer(tokenId, accountId, tokenAmount)
    .freezeWith(client);

  const txResponse = await transferTx.execute(client);
  const receipt = await txResponse.getReceipt(client);
  return receipt.status.toString();
}
const getAccountBalance = async (account: Account, tokenId?: TokenId): Promise<Balance> => {
  const query = new AccountBalanceQuery().setAccountId(account.id);
  const tokenBalance = await query.execute(client);
  return {
    tokens: tokenBalance.tokens && tokenId ? Number(tokenBalance.tokens.get(tokenId.toString())) : 0,
    hbar: tokenBalance.hbars.toBigNumber().toNumber()
  };
}
const createAccountWithHBar = async (client: Client, hbarAmount: number): Promise<Account> => {
  const newPrivateKey = PrivateKey.generateED25519();
  const newPublicKey = newPrivateKey.publicKey;

  // Create a new account with 10 HBAR
  const transaction = new AccountCreateTransaction()
    .setKey(newPublicKey)
    .setInitialBalance(new Hbar(hbarAmount));

  // Submit the transaction and get the receipt
  const txResponse = await transaction.execute(client);
  const receipt = await txResponse.getReceipt(client);
  const newAccountId = receipt.accountId;

  return {
    id: newAccountId!.toString(),
    privateKey: newPrivateKey.toString()
  };
}

Before((scenario) => {
  scenarioName = scenario.pickle.name;
});

Given(/^A Hedera account with more than (\d+) hbar$/, async function (expectedBalance: number) {
  for (let i = 0; i < accounts.length; i++) {
    const acc = accounts[i]
    const account: AccountId = AccountId.fromString(acc.id);
    const privKey: PrivateKey = PrivateKey.fromStringED25519(acc.privateKey);
    const { hbar: hbarBalance } = await getAccountBalance(acc);

    if (hbarBalance > expectedBalance) {
      client.setOperator(account, privKey);
      firstAccount = acc;
      assert.ok(true);
      return;
    }
  }
});

When(/^I create a token named Test Token \(HTT\)$/, async function () {
  const accountId = AccountId.fromString(firstAccount.id);
  const privateKey = PrivateKey.fromStringED25519(firstAccount.privateKey);

  const transaction = new TokenCreateTransaction()
    .setDecimals(2)
    .setTokenSymbol("HTT")
    .setSupplyKey(privateKey)
    .setTokenName("Test Token")
    .setTreasuryAccountId(accountId)
    .freezeWith(client);

  const signTx = await transaction.sign(privateKey);
  const txResponse = await signTx.execute(client);
  const receipt = await txResponse.getReceipt(client);
  tokenId = receipt.tokenId!;

  const query = new TokenInfoQuery().setTokenId(tokenId);
  const tokenInfo = await query.execute(client);

  const incomingTokenId = tokenInfo.tokenId;
  tokenName = tokenInfo.name;
  tokenSymbol = tokenInfo.symbol;
  tokenDecimals = tokenInfo.decimals;
  treasuryAccountId = tokenInfo.treasuryAccountId!;

  assert.ok(tokenId.toString() === incomingTokenId.toString());
});

Then(/^The token has the name "([^"]*)"$/, async function (expectedTokenName: string) {
  assert.ok(expectedTokenName === tokenName);
});

Then(/^The token has the symbol "([^"]*)"$/, async function (expectedsymbol: string) {
  assert.ok(expectedsymbol === tokenSymbol);
});

Then(/^The token has (\d+) decimals$/, async function (expectedDeciamls: number) {
  assert.ok(expectedDeciamls === tokenDecimals);
});

Then(/^The token is owned by the account$/, async function () {
  assert.ok(treasuryAccountId?.toString() === firstAccount.id);
});

Then(/^An attempt to mint (\d+) additional tokens succeeds$/, async function (tokenAmount: number) {
  const amountWithDecimal = tokenAmount * (10 ** tokenDecimals);
  const status = await mintTokens(amountWithDecimal);
  console.log("The transaction status " + status);
  const { tokens: tokenbalance } = await getAccountBalance(firstAccount, tokenId);
  assert.ok(amountWithDecimal === tokenbalance);
});

When(/^I create a fixed supply token named Test Token \(HTT\) with (\d+) tokens$/, async function (maxSupply: number) {
  const accountId = AccountId.fromString(firstAccount.id);
  const privateKey = PrivateKey.fromStringED25519(firstAccount.privateKey);
  // Create the transaction and freeze for manual signing
  const transaction = new TokenCreateTransaction()
    .setDecimals(2)
    .setTokenSymbol("HTT")
    .setMaxSupply(maxSupply)
    .setSupplyKey(privateKey)
    .setTokenName("Test Token")
    .setTreasuryAccountId(accountId)
    .setSupplyType(TokenSupplyType.Finite)
    .freezeWith(client);

  const signTx = await transaction.sign(privateKey);
  const txResponse = await signTx.execute(client);
  const receipt = await txResponse.getReceipt(client);
  tokenId = receipt.tokenId!;

  const query = new TokenInfoQuery().setTokenId(tokenId);
  const tokenInfo = await query.execute(client);

  const incomingTokenId = tokenInfo.tokenId;
  tokenName = tokenInfo.name;
  tokenSymbol = tokenInfo.symbol;
  tokenDecimals = tokenInfo.decimals;
  tokenSupply = Number(tokenInfo.maxSupply);
  treasuryAccountId = tokenInfo.treasuryAccountId!;

  assert.ok(tokenId.toString() === incomingTokenId.toString() && maxSupply === tokenSupply);
});

Then(/^The total supply of the token is (\d+)$/, async function (expectedSupply: number) {
  assert.ok(tokenSupply === expectedSupply)
});

Then(/^An attempt to mint tokens fails$/, async function () {
  let errorStatus;
  try {
    const status = await mintTokens(tokenSupply + 100);
    console.log("The transaction status " + status);
  } catch (error) {
    if (error instanceof ReceiptStatusError) {
      errorStatus = error.status._code;
    } else {
      console.log("ERROR:", error);
    }
  }
  // TOKEN_MAX_SUPPLY_REACHED = 236;
  assert.ok(errorStatus === 236);
});

Given(/^A first hedera account with more than (\d+) hbar$/, async function (expectedBalance: number) {
  const { hbar } = await getAccountBalance(firstAccount);
  assert.ok(hbar > expectedBalance);

});

Given(/^A second Hedera account$/, async function () {
  secondAccount = await createAccountWithHBar(client, 0);
});

Given(/^A token named Test Token \(HTT\) with (\d+) tokens$/, { timeout: 2 * 5000 }, async function (tokenCount: number) {
  const accountId = AccountId.fromString(firstAccount.id);
  const privateKey = PrivateKey.fromStringED25519(firstAccount.privateKey);
  // Create the transaction and freeze for manual signing
  const transaction = new TokenCreateTransaction()
    .setTokenSymbol("HTT")
    .setInitialSupply(100)
    .setSupplyKey(privateKey)
    .setMaxSupply(tokenCount)
    .setTokenName("Test Token")
    .setTreasuryAccountId(accountId)
    .setSupplyType(TokenSupplyType.Finite)
    .freezeWith(client);

  const signTx = await transaction.sign(privateKey);
  const txResponse = await signTx.execute(client);
  const receipt = await txResponse.getReceipt(client);
  tokenId = receipt.tokenId!;

  const query = new TokenInfoQuery().setTokenId(tokenId);
  const tokenInfo = await query.execute(client);

  tokenName = tokenInfo.name;
  tokenSymbol = tokenInfo.symbol;
  tokenDecimals = tokenInfo.decimals;
  tokenSupply = Number(tokenInfo.maxSupply);
  treasuryAccountId = tokenInfo.treasuryAccountId!;

  if (scenarioName === 'Create a token transfer transaction paid for by the recipient') {
    await transferTokens(firstAccount, secondAccount, tokenId, 100)
  }
  assert.ok(tokenSupply === tokenCount);
});

Given(/^The first account holds (\d+) HTT tokens$/, async function (tokenAmount: number) {
  const { tokens: tokenbalance } = await getAccountBalance(firstAccount, tokenId);
  assert.ok(tokenbalance === tokenAmount);
});

Given(/^The second account holds (\d+) HTT tokens$/, async function (tokenAmount: number) {
  const { tokens: tokenbalance } = await getAccountBalance(secondAccount, tokenId);
  assert.ok(tokenbalance === tokenAmount);
});

When(/^The first account creates a transaction to transfer (\d+) HTT tokens to the second account$/, async function (tokenAmount: number) {
  const secondAccId = AccountId.fromString(secondAccount.id);
  const secondAccPrivateKey = PrivateKey.fromStringED25519(secondAccount.privateKey);

  const transaction = new TokenAssociateTransaction()
    .setAccountId(secondAccId)
    .setTokenIds([tokenId])
    .freezeWith(client);

  const signTx = await transaction.sign(secondAccPrivateKey);
  const txResponse = await signTx.execute(client);
  const receipt = await txResponse.getReceipt(client);
  const transactionStatus = receipt.status;

  console.log("The transaction status " + transactionStatus.toString());

  const firstAccPrivateKey = PrivateKey.fromStringED25519(firstAccount.privateKey);

  transferTransaction = new TransferTransaction()
    .addTokenTransfer(tokenId, firstAccount.id, -1 * tokenAmount)
    .addTokenTransfer(tokenId, secondAccount.id, tokenAmount)
    .freezeWith(client);

  transferTransaction = await transferTransaction.sign(firstAccPrivateKey);
});

When(/^The first account submits the transaction$/, async function () {
  const txResponse = await transferTransaction.execute(client);
  const receipt = await txResponse.getReceipt(client);
  const transactionStatus = receipt.status;
  transactionRecord = await txResponse.getRecord(client);

  console.log("The transaction status " + transactionStatus.toString());
});

When(/^The second account creates a transaction to transfer (\d+) HTT tokens to the first account$/, async function (tokenAmount: number) {
  const secondAccPrivateKey = PrivateKey.fromStringED25519(secondAccount.privateKey);
  // Create the transfer transaction
  const transaction = new TransferTransaction()
    .addTokenTransfer(tokenId, secondAccount.id, -1 * tokenAmount)
    .addTokenTransfer(tokenId, firstAccount.id, tokenAmount)
    .freezeWith(client)

  // Sign with the sender account private key
  transferTransaction = await transaction.sign(secondAccPrivateKey);
});

Then(/^The first account has paid for the transaction fee$/, async function () {
  const payerAccountId = transactionRecord.transactionId.accountId?.toString();
  assert.ok(payerAccountId === firstAccount.id);
});

Given(/^A first hedera account with more than (\d+) hbar and (\d+) HTT tokens$/, async function (expectedhbar: number, expectedTokens: number) {
  const { tokens, hbar } = await getAccountBalance(firstAccount, tokenId);
  assert.ok(hbar > expectedhbar && tokens === expectedTokens);
});

Given(/^A second Hedera account with (\d+) hbar and (\d+) HTT tokens$/, { timeout: 2 * 5000 }, async function (expectedhbar: number, expectedTokens: number) {
  secondAccount = await createAccountWithHBar(client, expectedhbar);
  await mintTokens(expectedTokens);
  await transferTokens(firstAccount, secondAccount, tokenId, expectedTokens);
  const { tokens, hbar } = await getAccountBalance(secondAccount, tokenId);
  assert.ok(tokens === expectedTokens && hbar === expectedhbar && secondAccount.id != firstAccount.id);
});

Given(/^A third Hedera account with (\d+) hbar and (\d+) HTT tokens$/, { timeout: 2 * 5000 }, async function (expectedhbar: number, expectedTokens: number) {
  thirdAccount = await createAccountWithHBar(client, expectedhbar);
  await mintTokens(expectedTokens);
  await transferTokens(firstAccount, thirdAccount, tokenId, expectedTokens)
  const { tokens, hbar } = await getAccountBalance(thirdAccount, tokenId);
  assert.ok(tokens === expectedTokens && hbar === expectedhbar && thirdAccount.id != firstAccount.id && thirdAccount.id != secondAccount.id);
});

Given(/^A fourth Hedera account with (\d+) hbar and (\d+) HTT tokens$/, { timeout: 2 * 5000 }, async function (expectedhbar: number, expectedTokens: number) {
  forthAccount = await createAccountWithHBar(client, expectedhbar);
  await mintTokens(expectedTokens);
  await transferTokens(firstAccount, forthAccount, tokenId, expectedTokens)
  const { tokens, hbar } = await getAccountBalance(forthAccount, tokenId);
  assert.ok(tokens === expectedTokens && hbar === expectedhbar && forthAccount.id != firstAccount.id && forthAccount.id != secondAccount.id && forthAccount.id != thirdAccount.id);
});

When(/^A transaction is created to transfer (\d+) HTT tokens out of the first and second account and (\d+) HTT tokens into the third account and (\d+) HTT tokens into the fourth account$/, async function (deductTokens: number, addToThird: number, addToForth: number) {
  const firstAccPrivateKey = PrivateKey.fromStringED25519(firstAccount.privateKey);
  const secondAccPrivateKey = PrivateKey.fromStringED25519(secondAccount.privateKey);

  transferTransaction = new TransferTransaction()
    .addTokenTransfer(tokenId, firstAccount.id, -1 * deductTokens)
    .addTokenTransfer(tokenId, secondAccount.id, -1 * deductTokens)
    .addTokenTransfer(tokenId, thirdAccount.id, addToThird)
    .addTokenTransfer(tokenId, forthAccount.id, addToForth)
    .freezeWith(client);

  transferTransaction = await transferTransaction.sign(firstAccPrivateKey);
  transferTransaction = await transferTransaction.sign(secondAccPrivateKey);
});

Then(/^The third account holds (\d+) HTT tokens$/, async function (tokenAmount: number) {
  const { tokens: tokenbalance } = await getAccountBalance(thirdAccount, tokenId);
  assert.ok(tokenbalance === tokenAmount);
});

Then(/^The fourth account holds (\d+) HTT tokens$/, async function (tokenAmount: number) {
  const { tokens: tokenbalance } = await getAccountBalance(forthAccount, tokenId);
  assert.ok(tokenbalance === tokenAmount);
});
