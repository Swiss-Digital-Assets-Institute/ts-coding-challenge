import { Given, Then, When } from "@cucumber/cucumber";
import { accounts, Account } from "../../src/config";
import {
  AccountId, Client, Key, PrivateKey, TokenId, TokenType, TokenSupplyType,
  TokenInfoQuery, TokenMintTransaction, TokenCreateTransaction, AccountBalanceQuery,
  ReceiptStatusError
} from "@hashgraph/sdk";
import assert from "node:assert";

let firstAccount: Account;
let tokenId: TokenId;
let tokenName: string;
let tokenSymbol: string;
let tokenSupply: number;
let tokenDecimals: number;
let treasuryAccountId: AccountId;

const client = Client.forTestnet();

Given(/^A Hedera account with more than (\d+) hbar$/, async function (expectedBalance: number) {
  const account = accounts[5]
  const MY_ACCOUNT_ID = AccountId.fromString(account.id);
  const MY_PRIVATE_KEY = PrivateKey.fromStringED25519(account.privateKey);
  client.setOperator(MY_ACCOUNT_ID, MY_PRIVATE_KEY);

  firstAccount = account;
  // Create the query request
  const query = new AccountBalanceQuery().setAccountId(MY_ACCOUNT_ID);
  const balance = await query.execute(client);
  assert.ok(balance.hbars.toBigNumber().toNumber() > expectedBalance);

});

When(/^I create a token named Test Token \(HTT\)$/, async function () {
  const accountId = AccountId.fromString(firstAccount.id);
  const privateKey = PrivateKey.fromStringED25519(firstAccount.privateKey);
  // Create the transaction and freeze for manual signing
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
  const transaction = new TokenMintTransaction()
    .setTokenId(tokenId)
    .setAmount(amountWithDecimal)
    .freezeWith(client);

  const privateKey = PrivateKey.fromStringED25519(firstAccount.privateKey);

  const signTx = await transaction.sign(privateKey);
  const txResponse = await signTx.execute(client);
  const receipt = await txResponse.getReceipt(client);
  const transactionStatus = receipt.status;

  console.log("The transaction consensus status " + transactionStatus.toString());

  const query = new AccountBalanceQuery().setAccountId(firstAccount.id);
  const tokenBalance = await query.execute(client);
  assert.ok(tokenBalance.tokens && amountWithDecimal === Number(tokenBalance.tokens.get(tokenId.toString())));
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
    const transaction = new TokenMintTransaction()
      .setTokenId(tokenId)
      .setAmount(tokenSupply + 100)
      .freezeWith(client);

    const privateKey = PrivateKey.fromStringED25519(firstAccount.privateKey);

    const signTx = await transaction.sign(privateKey);
    const txResponse = await signTx.execute(client);
    const receipt = await txResponse.getReceipt(client);
    const transactionStatus = receipt.status;
    console.log("The transaction consensus status " + transactionStatus.toString());
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

Given(/^A first hedera account with more than (\d+) hbar$/, async function () {

});

Given(/^A second Hedera account$/, async function () {

});

Given(/^A token named Test Token \(HTT\) with (\d+) tokens$/, async function () {

});

Given(/^The first account holds (\d+) HTT tokens$/, async function () {

});

Given(/^The second account holds (\d+) HTT tokens$/, async function () {

});

When(/^The first account creates a transaction to transfer (\d+) HTT tokens to the second account$/, async function () {

});

When(/^The first account submits the transaction$/, async function () {

});

When(/^The second account creates a transaction to transfer (\d+) HTT tokens to the first account$/, async function () {

});

Then(/^The first account has paid for the transaction fee$/, async function () {

});

Given(/^A first hedera account with more than (\d+) hbar and (\d+) HTT tokens$/, async function () {

});

Given(/^A second Hedera account with (\d+) hbar and (\d+) HTT tokens$/, async function () {

});

Given(/^A third Hedera account with (\d+) hbar and (\d+) HTT tokens$/, async function () {

});

Given(/^A fourth Hedera account with (\d+) hbar and (\d+) HTT tokens$/, async function () {

});

When(/^A transaction is created to transfer (\d+) HTT tokens out of the first and second account and (\d+) HTT tokens into the third account and (\d+) HTT tokens into the fourth account$/, async function () {

});

Then(/^The third account holds (\d+) HTT tokens$/, async function () {

});

Then(/^The fourth account holds (\d+) HTT tokens$/, async function () {

});
