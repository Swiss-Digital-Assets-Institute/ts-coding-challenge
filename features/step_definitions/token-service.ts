import { Given, Then, When } from "@cucumber/cucumber";
import { accounts } from "../../src/config";
import { AccountBalanceQuery, Hbar, HbarUnit, TokenId, TokenAssociateTransaction, TransferTransaction, AccountCreateTransaction, AccountId, Client,TransactionReceipt, PrivateKey, TokenCreateTransaction, TokenInfoQuery, TokenMintTransaction, TokenType } from "@hashgraph/sdk";import assert from "node:assert";

const client = Client.forTestnet()

Given(/^A Hedera account with more than (\d+) hbar$/, async function (expectedBalance: number) {
  const account = accounts[0]
  const MY_ACCOUNT_ID = AccountId.fromString(account.id);
  const MY_PRIVATE_KEY = PrivateKey.fromStringED25519(account.privateKey);
  this.account_id = MY_ACCOUNT_ID;
  this.privateKey = MY_PRIVATE_KEY;
  client.setOperator(MY_ACCOUNT_ID, MY_PRIVATE_KEY);

//Create the query request
  const query = new AccountBalanceQuery().setAccountId(MY_ACCOUNT_ID);
  const balance = await query.execute(client)
  assert.ok(balance.hbars.toBigNumber().toNumber() > expectedBalance)

});

When(/^I create a token named Test Token \(HTT\)$/, async function () {
  const transaction = await new TokenCreateTransaction()
    .setTokenName("Test Token")
    .setTokenSymbol("HTT")
    .setTokenType(TokenType.FungibleCommon)
    .setDecimals(2)
    .setInitialSupply(0)
    .setTreasuryAccountId(this.account_id)
    .setSupplyKey(this.privateKey)
    .freezeWith(client);

  const signTx = await transaction.sign(this.privateKey );
  const txResponse = await signTx.execute(client);
  const receipt = await txResponse.getReceipt(client);
  const tokenId = receipt.tokenId;
  this.tokenId = tokenId;
  assert.ok(tokenId !== null);
});

Then(/^The token has the name "([^"]*)"$/, async function (expectedName: string) {
  const tokenInfo = await new TokenInfoQuery().setTokenId(this.tokenId).execute(client);
  assert.strictEqual(tokenInfo.name, expectedName);
});

Then(/^The token has the symbol "([^"]*)"$/, async function (expectedSymbol: string) {
  const tokenInfo = await new TokenInfoQuery().setTokenId(this.tokenId).execute(client);
  assert.strictEqual(tokenInfo.symbol, expectedSymbol);
});

Then(/^The token has (\d+) decimals$/, async function (expectedDecimals: number) {
  const tokenInfo = await new TokenInfoQuery().setTokenId(this.tokenId).execute(client);
  assert.strictEqual(tokenInfo.decimals, expectedDecimals);
});

Then(/^The token is owned by the account$/, async function () {
});

Then(/^An attempt to mint (\d+) additional tokens succeeds$/, async function (amount: number) {
  // Mint additional tokens
  const mintTransaction = await new TokenMintTransaction()
    .setTokenId(this.tokenId)
    .setAmount(amount)
    .freezeWith(client);

  const signTx = await mintTransaction.sign(PrivateKey.fromStringED25519(accounts[0].privateKey));
  const submitTx = await signTx.execute(client);
  const receipt = await submitTx.getReceipt(client);

  assert.strictEqual(receipt.status.toString(), "SUCCESS", "Minting failed.");
});

When(/^I create a fixed supply token named Test Token \(HTT\) with (\d+) tokens$/, async function (supply: number) {
  const transaction = await new TokenCreateTransaction()
    .setTokenName("Test Token")
    .setTokenSymbol("HTT")
    .setDecimals(2)
    .setInitialSupply(supply)
    .setTreasuryAccountId(this.account_id)
    .freezeWith(client);
  const signTx = await transaction.sign(this.privateKey);
  const submitTx = await signTx.execute(client);
  const receipt = await submitTx.getReceipt(client);
  this.tokenId_fixed_supply = receipt.tokenId;
});

Then(/^The total supply of the token is (\d+)$/, async function (expectedSupply: number) {
  const tokenInfo = await new TokenInfoQuery().setTokenId(this.tokenId_fixed_supply).execute(client);
  assert.strictEqual(tokenInfo.totalSupply.toString(), expectedSupply.toString());
});

Then(/^An attempt to mint tokens fails$/, async function () {
  try {
    const mintTransaction = new TokenMintTransaction()
      .setTokenId(this.tokenId)
      .setAmount(100)
      .freezeWith(client);

    const signTx = await mintTransaction.sign(this.privateKey);
    const submitTx = await signTx.execute(client);
    const receipt: TransactionReceipt = await submitTx.getReceipt(client);
    assert.strictEqual(receipt.status.toString(), "TOKEN_SUPPLY_EXCEEDED", "Minting should have failed.");
  } catch (error) {
    console.log("Minting attempt failed as expected:", error);
  }
});

let firstAccountId: AccountId;
let firstAccountPrivateKey: PrivateKey;
let secondAccountId: AccountId;
let secondAccountPrivateKey: PrivateKey;
let transferTransaction: TransferTransaction;

Given(/^A first hedera account with more than (\d+) hbar$/, async function (expectedBalance: number) {
  firstAccountPrivateKey = PrivateKey.generateED25519();
  const transaction = await new AccountCreateTransaction()
    .setKey(firstAccountPrivateKey.publicKey)
    .setInitialBalance(Hbar.from(20, HbarUnit.Hbar))
    .execute(client);
  const receipt = await transaction.getReceipt(client);
  firstAccountId = receipt.accountId!;
  
  const balance = await new AccountBalanceQuery().setAccountId(firstAccountId).execute(client);
  assert(balance.hbars.toTinybars().toNumber() > expectedBalance * 100_000_000);
});

Given(/^A second Hedera account$/, async function () {
  secondAccountPrivateKey = PrivateKey.generateED25519();
  const transaction = await new AccountCreateTransaction()
    .setKey(secondAccountPrivateKey.publicKey)
    .setInitialBalance(Hbar.from(20, HbarUnit.Hbar))
    .execute(client);
  const receipt = await transaction.getReceipt(client);
  secondAccountId = receipt.accountId!;
});

Given(/^A token named Test Token \(HTT\) with (\d+) tokens$/, async function (supply: number) {
  const transaction = await new TokenCreateTransaction()
    .setTokenName("Test Token")
    .setTokenSymbol("HTT")
    .setTokenType(TokenType.FungibleCommon)
    .setDecimals(0)
    .setInitialSupply(supply)
    .setTreasuryAccountId(firstAccountId)
    .setAdminKey(firstAccountPrivateKey.publicKey)
    .setSupplyKey(firstAccountPrivateKey.publicKey)
    .freezeWith(client);
  const signTx = await transaction.sign(firstAccountPrivateKey);
  const txResponse = await signTx.execute(client);
  const receipt = await txResponse.getReceipt(client);
  this.tokenId_1 = receipt.tokenId!;
  const associateTransaction = await new TokenAssociateTransaction()
    .setAccountId(secondAccountId)
    .setTokenIds([this.tokenId_1])
    .freezeWith(client)
    .sign(secondAccountPrivateKey);
  await associateTransaction.execute(client);
});

Given(/^The first account holds (\d+) HTT tokens$/, async function (amount: number) {
  const tokenInfo = await new TokenInfoQuery().setTokenId(this.tokenId_1).execute(client);
  assert.strictEqual(tokenInfo.totalSupply.toNumber(), amount);
});

Given(/^The second account holds (\d+) HTT tokens$/, async function (amount: number) {
  const balance = await new AccountBalanceQuery().setAccountId(secondAccountId).execute(client);
  const tokenBalance = balance.tokens ? balance.tokens.get(this.tokenId_1)?.toNumber() : 0;
  assert.strictEqual(tokenBalance, amount);
});


When(/^The first account creates a transaction to transfer (\d+) HTT tokens to the second account$/, async function (amount: number) {
  transferTransaction = await new TransferTransaction()
    .addTokenTransfer(this.tokenId_1, firstAccountId, -amount)
    .addTokenTransfer(this.tokenId_1, secondAccountId, amount)
    .freezeWith(client);
});

When(/^The first account submits the transaction$/, async function () {
  const signTx = await transferTransaction.sign(firstAccountPrivateKey);
  const txResponse = await signTx.execute(client);
  await txResponse.getReceipt(client);
});

Then(/^The second account holds (\d+) HTT tokens$/, async function (expectedAmount: number) {
  const balance = await new AccountBalanceQuery().setAccountId(secondAccountId).execute(client);
  const tokenBalance = balance.tokens ? balance.tokens.get(this.tokenId_1)?.toNumber() : 0;
  assert.strictEqual(tokenBalance, expectedAmount);
});

Then(/^The first account holds (\d+) HTT tokens$/, async function (expectedAmount: number) {
  const balance = await new AccountBalanceQuery().setAccountId(firstAccountId).execute(client);
  const tokenBalance = balance.tokens ? balance.tokens.get(this.tokenId_1)?.toNumber() : 0;
  assert.strictEqual(tokenBalance, expectedAmount);
});

async function checkTokenBalance(accountId: string, tokenId: TokenId): Promise<number> {
  const balance = await new AccountBalanceQuery().setAccountId(accountId).execute(client);
  return balance.tokens ? balance.tokens.get(tokenId)?.toNumber() : 0;
}

// Given steps for checking hbar and HTT token balances
Given(/^A first hedera account with more than (\d+) hbar and (\d+) HTT tokens$/, async function (expectedHbar: number, expectedTokens: number) {
  const account = accounts[0];
  const MY_ACCOUNT_ID = AccountId.fromString(account.id);
  const MY_PRIVATE_KEY = PrivateKey.fromStringED25519(account.privateKey);
  client.setOperator(MY_ACCOUNT_ID, MY_PRIVATE_KEY);

  // Check Hbar balance
  const query = new AccountBalanceQuery().setAccountId(MY_ACCOUNT_ID);
  const balance = await query.execute(client);
  assert.ok(balance.hbars.toBigNumber().toNumber() > expectedHbar, `Account must have more than ${expectedHbar} hbars`);

  // Check HTT token balance
  const tokenBalance = await checkTokenBalance(account.id, this.tokenId_1);
  assert.strictEqual(tokenBalance, expectedTokens, `Account must have ${expectedTokens} HTT tokens`);
});

Given(/^A second Hedera account with (\d+) hbar and (\d+) HTT tokens$/, async function (expectedHbar: number, expectedTokens: number) {
  const account = accounts[1];
  const MY_ACCOUNT_ID = AccountId.fromString(account.id);
  const MY_PRIVATE_KEY = PrivateKey.fromStringED25519(account.privateKey);
  client.setOperator(MY_ACCOUNT_ID, MY_PRIVATE_KEY);

  // Check Hbar balance
  const query = new AccountBalanceQuery().setAccountId(MY_ACCOUNT_ID);
  const balance = await query.execute(client);
  assert.ok(balance.hbars.toBigNumber().toNumber() > expectedHbar, `Account must have more than ${expectedHbar} hbars`);

  // Check HTT token balance
  const tokenBalance = await checkTokenBalance(account.id, this.tokenId_1);
  assert.strictEqual(tokenBalance, expectedTokens, `Account must have ${expectedTokens} HTT tokens`);
});

Given(/^A third Hedera account with (\d+) hbar and (\d+) HTT tokens$/, async function (expectedHbar: number, expectedTokens: number) {
  const account = accounts[2];
  const MY_ACCOUNT_ID = AccountId.fromString(account.id);
  const MY_PRIVATE_KEY = PrivateKey.fromStringED25519(account.privateKey);
  client.setOperator(MY_ACCOUNT_ID, MY_PRIVATE_KEY);

  // Check Hbar balance
  const query = new AccountBalanceQuery().setAccountId(MY_ACCOUNT_ID);
  const balance = await query.execute(client);
  assert.ok(balance.hbars.toBigNumber().toNumber() > expectedHbar, `Account must have more than ${expectedHbar} hbars`);

  // Check HTT token balance
  const tokenBalance = await checkTokenBalance(account.id, this.tokenId_1);
  assert.strictEqual(tokenBalance, expectedTokens, `Account must have ${expectedTokens} HTT tokens`);
});

Given(/^A fourth Hedera account with (\d+) hbar and (\d+) HTT tokens$/, async function (expectedHbar: number, expectedTokens: number) {
  const account = accounts[3];
  const MY_ACCOUNT_ID = AccountId.fromString(account.id);
  const MY_PRIVATE_KEY = PrivateKey.fromStringED25519(account.privateKey);
  client.setOperator(MY_ACCOUNT_ID, MY_PRIVATE_KEY);

  // Check Hbar balance
  const query = new AccountBalanceQuery().setAccountId(MY_ACCOUNT_ID);
  const balance = await query.execute(client);
  assert.ok(balance.hbars.toBigNumber().toNumber() > expectedHbar, `Account must have more than ${expectedHbar} hbars`);

  // Check HTT token balance
  const tokenBalance = await checkTokenBalance(account.id, this.tokenId_1);
  assert.strictEqual(tokenBalance, expectedTokens, `Account must have ${expectedTokens} HTT tokens`);
});

// When step for transferring tokens
When(/^A transaction is created to transfer (\d+) HTT tokens out of the first and second account and (\d+) HTT tokens into the third account and (\d+) HTT tokens into the fourth account$/, async function (transferOutFromFirst: number, transferOutFromSecond: number, transferInToThird: number, transferInToFourth: number) {
  const firstAccountId = AccountId.fromString(accounts[0].id);
  const secondAccountId = AccountId.fromString(accounts[1].id);
  const thirdAccountId = AccountId.fromString(accounts[2].id);
  const fourthAccountId = AccountId.fromString(accounts[3].id);
  const transaction = new TransferTransaction()
    .addHbarTransfer(firstAccountId, Hbar.from(-transferOutFromFirst, HbarUnit.Hbar)) 
    .addHbarTransfer(secondAccountId, Hbar.from(-transferOutFromSecond, HbarUnit.Hbar))
    .addHbarTransfer(thirdAccountId, Hbar.from(transferInToThird, HbarUnit.Hbar)) 
    .addHbarTransfer(fourthAccountId, Hbar.from(transferInToFourth, HbarUnit.Hbar)); 
  await transaction.execute(client);
});

Then(/^The third account holds (\d+) HTT tokens$/, async function (expectedAmount: number) {
  const tokenBalance = await checkTokenBalance(accounts[2].id, this.tokenId_1);
  assert.strictEqual(tokenBalance, expectedAmount, `Third account must have ${expectedAmount} HTT tokens`);
});

Then(/^The fourth account holds (\d+) HTT tokens$/, async function (expectedAmount: number) {
  const tokenBalance = await checkTokenBalance(accounts[3].id, this.tokenId_1);
  assert.strictEqual(tokenBalance, expectedAmount, `Fourth account must have ${expectedAmount} HTT tokens`);
});
