import { Given, Then, When } from "@cucumber/cucumber";
import { accounts } from "../../src/config";
import { TransactionResponse, AccountBalanceQuery, TransactionId, 
  AccountInfoQuery, Hbar, HbarUnit, TokenId, TokenAssociateTransaction, 
  TransferTransaction, AccountCreateTransaction, AccountId, Client,TransactionReceipt, 
  PrivateKey, TokenCreateTransaction, TokenInfoQuery, TokenMintTransaction, TokenType 
} from "@hashgraph/sdk";import assert from "node:assert";

const client = Client.forTestnet()
let tokenId_const : any = null;

Given(/^A Hedera account with more than (\d+) hbar$/, async function (expectedBalance: number) {
  const account = accounts[0]
  const MY_ACCOUNT_ID = AccountId.fromString(account.id);
  const MY_PRIVATE_KEY = PrivateKey.fromStringED25519(account.privateKey);
  client.setOperator(MY_ACCOUNT_ID, MY_PRIVATE_KEY);

  const query = new AccountBalanceQuery().setAccountId(MY_ACCOUNT_ID);
  const balance = await query.execute(client)
  assert.ok(balance.hbars.toBigNumber().toNumber() > expectedBalance)

});

When(/^I create a token named Test Token \(HTT\)$/, async function () {
  const account = accounts[0];
  this.account = AccountId.fromString(account.id);
  this.privKey = PrivateKey.fromStringED25519(account.privateKey);

  const transaction = new TokenCreateTransaction()
    .setTokenName("Test Token")
    .setTokenSymbol("HTT")
    .setDecimals(2)
    .setInitialSupply(1000)
    .setTreasuryAccountId(this.account)
    .setAdminKey(this.privKey.publicKey)
    .setSupplyKey(this.privKey.publicKey)
    .setTransactionValidDuration(120); // Ajout de la durée de validité de la transaction

  const receipt = await (await transaction.execute(client)).getReceipt(client);
  this.tokenId = receipt.tokenId;
});

Then(/^The token has the name "([^"]*)"$/, async function (expectedName: string) {
  const tokenInfo = await new TokenInfoQuery()
  .setTokenId(this.tokenId)
  .execute(client);

assert.strictEqual(tokenInfo.name, expectedName);
});

Then(/^The token has the symbol "([^"]*)"$/, async function (expectedSymbol: string) {
  const tokenInfo = await new TokenInfoQuery()
  .setTokenId(this.tokenId)
  .execute(client);

assert.strictEqual(tokenInfo.symbol, expectedSymbol);
});

Then(/^The token has (\d+) decimals$/, async function (expectedDecimals: number) {
  const tokenInfo = await new TokenInfoQuery()
  .setTokenId(this.tokenId)
  .execute(client);

assert.strictEqual(tokenInfo.decimals, expectedDecimals);
});

Then(/^The token is owned by the account$/, async function () {
  const tokenInfo = await new TokenInfoQuery()
    .setTokenId(this.tokenId)
    .execute(client);

  assert.ok(tokenInfo.treasuryAccountId, "Treasury account ID is null");
  assert.strictEqual(tokenInfo.treasuryAccountId.toString(), this.account.toString());
});

Then(/^An attempt to mint (\d+) additional tokens succeeds$/, async function (amount: number) {
  const transaction = await new TokenMintTransaction()
    .setTokenId(this.tokenId)
    .setAmount(amount)
    .freezeWith(client)
    .sign(this.privKey);

  const receipt = await (await transaction.execute(client)).getReceipt(client);
  assert.strictEqual(receipt.status.toString(), "SUCCESS");
});

When(/^I create a fixed supply token named Test Token \(HTT\) with (\d+) tokens$/, async function (initialSupply: number) {
  const account = accounts[0];
  this.account = AccountId.fromString(account.id);
  this.privKey = PrivateKey.fromStringED25519(account.privateKey);

  const transaction = new TokenCreateTransaction()
    .setTokenName("Test Token")
    .setTokenSymbol("HTT")
    .setDecimals(2)
    .setInitialSupply(initialSupply)
    .setTreasuryAccountId(this.account)
    .setAdminKey(this.privKey.publicKey)
    .setSupplyKey(this.privKey.publicKey);

  const receipt = await (await transaction.execute(client)).getReceipt(client);
  this.tokenId = receipt.tokenId;
});

Then(/^The total supply of the token is (\d+)$/, async function (expectedSupply: number) {
  const tokenInfo = await new TokenInfoQuery()
  .setTokenId(this.tokenId)
  .execute(client);

assert.strictEqual(tokenInfo.totalSupply.toNumber(), expectedSupply);
});

Then(/^An attempt to mint tokens fails$/, async function () {
  try {
    const transaction = await new TokenMintTransaction()
      .setTokenId(this.tokenId)
      .setAmount(100)
      .freezeWith(client)
      .sign(this.privKey);

    await transaction.execute(client);
    assert.fail("Minting tokens should have failed but succeeded");
  } catch (error) {
    assert.ok(error, "Minting tokens failed as expected");
  }
});

Given(/^A first hedera account with more than (\d+) hbar$/, async function (expectedBalance: number) {
  const acc = accounts[0];
  const account: AccountId = AccountId.fromString(acc.id);
  this.firstAccount = account;
  const privKey: PrivateKey = PrivateKey.fromStringED25519(acc.privateKey);
  this.firstPrivKey = privKey;
  client.setOperator(this.firstAccount, privKey);

  const query = new AccountBalanceQuery().setAccountId(account);
  const balance = await query.execute(client);
  console.log(`First account balance: ${balance.hbars.toBigNumber().toNumber()} hbars`);
  console.log(`Expected balance: ${expectedBalance} hbars`);
  assert.ok(balance.hbars.toBigNumber().toNumber() > expectedBalance);
});

Given(/^A second Hedera account$/, async function () {
  const acc = accounts[1];
  const account: AccountId = AccountId.fromString(acc.id);
  this.secondAccount = account;
  const privKey: PrivateKey = PrivateKey.fromStringED25519(acc.privateKey);
  this.secondPrivKey = privKey;

  const query = new AccountBalanceQuery().setAccountId(account);
  const balance = await query.execute(client);
  console.log(`Second account balance: ${balance.hbars.toBigNumber().toNumber()} hbars`);
});

Given(/^A token named Test Token \(HTT\) with (\d+) tokens$/, async function (initialSupply: number) {
  assert.ok(this.firstAccount, "First account is not defined");
  assert.ok(this.firstPrivKey, "First private key is not defined");

  const transaction = new TokenCreateTransaction()
    .setTokenName("Test Token")
    .setTokenSymbol("HTT")
    .setDecimals(2)
    .setInitialSupply(initialSupply)
    .setTreasuryAccountId(this.firstAccount)
    .setAdminKey(this.firstPrivKey.publicKey)
    .setSupplyKey(this.firstPrivKey.publicKey);

  const receipt = await (await transaction.execute(client)).getReceipt(client);
  this.tokenId = receipt.tokenId;
  this.treasuryAccount = this.firstAccount; 
  this.treasuryPrivKey = this.firstPrivKey; 
  assert.ok(this.tokenId, "Failed to create token");
});

Given(/^The first account holds (\d+) HTT tokens$/, async function (amount: number) {
  assert.ok(this.tokenId, "Token ID is not defined");
  assert.ok(this.firstAccount, "First account is not defined");
  assert.ok(this.treasuryAccount, "Treasury account is not defined");
  assert.ok(this.treasuryPrivKey, "Treasury private key is not defined");

  console.log(`First Account: ${this.firstAccount}`);
  console.log(`First Account Public Key: ${this.firstPrivKey.publicKey}`);


  // Ensure token association
  const accountInfo = await new AccountInfoQuery()
      .setAccountId(this.firstAccount)
      .execute(client);

  if (!accountInfo.tokenRelationships.get(this.tokenId)) {
      throw new Error(`First account is not associated with token ${this.tokenId}`);
  }

  // Transfer tokens from the treasury to the first account
  console.log(`Transferring ${amount} HTT tokens to the first account...`);
  const transaction = new TransferTransaction()
      .addTokenTransfer(this.tokenId, this.treasuryAccount, -amount) // Treasury debited
      .addTokenTransfer(this.tokenId, this.firstAccount, amount) // First account credited
      .freezeWith(client);

  const signedTransaction = await transaction.sign(this.treasuryPrivKey);

  const receipt = await (await signedTransaction.execute(client)).getReceipt(client);
  assert.strictEqual(receipt.status.toString(), "SUCCESS", "Failed to transfer tokens to the first account");

  console.log(`Successfully transferred ${amount} HTT tokens to the first account.`);
});

Given(/^The second account holds (\d+) HTT tokens$/, async function (amount: number) {
  assert.ok(this.tokenId, "Token ID is not defined");
  assert.ok(this.firstAccount, "First account is not defined");
  assert.ok(this.firstPrivKey, "First private key is not defined");

  const transaction = new TransferTransaction()
    .addTokenTransfer(this.tokenId, this.firstAccount, -amount) // From treasury
    .addTokenTransfer(this.tokenId, this.secondAccount, amount)
    .freezeWith(client);

  const signedTransaction = await transaction.sign(this.firstPrivKey);

  const receipt = await (await signedTransaction.execute(client)).getReceipt(client);
  assert.strictEqual(receipt.status.toString(), "SUCCESS", "Failed to transfer tokens to the second account");
  console.log(`Successfully transferred ${amount} HTT tokens to the second account`);
});

When(/^The first account creates a transaction to transfer (\d+) HTT tokens to the second account$/, async function (amount: number) {
  const transaction = await new TransferTransaction()
  .addTokenTransfer(this.tokenId, this.firstAccount, -amount)
  .addTokenTransfer(this.tokenId, this.secondAccount, amount)
  .freezeWith(client)
  .sign(this.firstPrivKey);

this.transaction = transaction;
});

When(/^The first account submits the transaction$/, async function () {
  const receipt = await (await this.transaction.execute(client)).getReceipt(client);
  assert.strictEqual(receipt.status.toString(), "SUCCESS");
});

//+++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++

When(/^The second account creates a transaction to transfer (\d+) HTT tokens to the first account$/, async function (amount: number) {
  assert.ok(this.tokenId, "Token ID is not defined");
  assert.ok(this.secondAccount, "Second account is not defined");
  assert.ok(this.secondPrivKey, "Second private key is not defined");
  const transaction = await new TransferTransaction()
    .addTokenTransfer(this.tokenId, this.secondAccount, -amount) 
    .addTokenTransfer(this.tokenId, this.firstAccount, amount)  
    .setTransactionId(TransactionId.generate(this.secondAccount))
    .setTransactionValidDuration(120)
    .freezeWith(client)
    .sign(this.secondPrivKey);
  this.transaction = transaction;
});

Then(/^The first account has paid for the transaction fee$/, async function () {
  console.log(`Transaction ID: ${this.transaction.transactionId}`);
  const response = await this.transaction.execute(client);
  const receipt = await response.getReceipt(client);
  console.log(`Transaction successfully executed. Fee payer account: ${receipt.accountId}`);
  const firstAccountBalanceAfter = await new AccountBalanceQuery()
    .setAccountId(this.firstAccount)
    .execute(client);
  console.log(`First account balance after transaction: ${firstAccountBalanceAfter.hbars}`);
  assert.ok(
    firstAccountBalanceAfter.hbars
      .toTinybars()
      .toNumber() < this.firstAccountInitialBalance.toTinybars().toNumber(),
    "The first account did not pay for the transaction fee"
  );
});

//+++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
Given(/^A first hedera account with more than (\d+) hbar and (\d+) HTT tokens$/, async function (hbar: number, tokens: number) {
  const acc = accounts[0];
  const account: AccountId = AccountId.fromString(acc.id);
  this.firstAccount = account;
  const privKey: PrivateKey = PrivateKey.fromStringED25519(acc.privateKey);
  this.firstPrivKey = privKey;
  client.setOperator(this.firstAccount, privKey);

  const balance = await new AccountBalanceQuery().setAccountId(account).execute(client);
  assert.ok(balance.hbars.toBigNumber().toNumber() > hbar, `Account doesn't have enough Hbar`);

  const tokenBalance = balance.tokens?.get(this.tokenId);

  if (!tokenBalance) {
    throw new Error(`Token with ID ${this.tokenId} is not associated with the account.`);
  }
    assert.ok(tokenBalance?.toNumber() === tokens, `Account doesn't have ${tokens} tokens`);
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
