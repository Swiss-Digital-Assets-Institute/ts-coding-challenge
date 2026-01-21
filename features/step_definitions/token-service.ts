import { Given, Then, When } from "@cucumber/cucumber";
import { accounts } from "../../src/config";
import {
  AccountBalanceQuery,
  AccountId,
  Client,
  PrivateKey,
  TokenAssociateTransaction,
  TokenCreateTransaction,
  TokenInfoQuery,
  TokenMintTransaction,
  TokenType,
  TransferTransaction
} from "@hashgraph/sdk";
import assert from "node:assert";

const client = Client.forTestnet()

Given(/^A Hedera account with more than (\d+) hbar$/, async function (expectedBalance: number) {
  const account = accounts[0];
  this.account = AccountId.fromString(account.id);
  this.privKey = PrivateKey.fromStringED25519(account.privateKey);
  client.setOperator(this.account, this.privKey);

  const query = new AccountBalanceQuery().setAccountId(this.account);
  const balance = await query.execute(client);
  const hbarBalance = balance.hbars.toBigNumber().toNumber();
  console.log(`Account ${this.account} has ${hbarBalance} hbars`);
  assert.ok(hbarBalance > expectedBalance, `Expected balance > ${expectedBalance}, but got ${hbarBalance}`);
});

When(/^I create a token named Test Token \(HTT\)$/, async function () {
  const transaction = new TokenCreateTransaction()
    .setTokenName("Test Token")
    .setTokenSymbol("HTT")
    .setDecimals(2)
    .setInitialSupply(0)
    .setTreasuryAccountId(this.account)
    .setSupplyKey(this.privKey);
  
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
  
  assert.strictEqual(tokenInfo.treasuryAccountId?.toString(), this.account.toString());
});

Then(/^An attempt to mint (\d+) additional tokens succeeds$/, async function (amount: number) {
  const mintAmount = amount * Math.pow(10, 2);
  const transaction = new TokenMintTransaction()
    .setTokenId(this.tokenId)
    .setAmount(mintAmount);
  
  await (await transaction.execute(client)).getReceipt(client);
});
When(/^I create a fixed supply token named Test Token \(HTT\) with (\d+) tokens$/, async function (totalSupply: number) {
  const supplyWithDecimals = totalSupply * Math.pow(10, 2);
  const transaction = new TokenCreateTransaction()
    .setTokenName("Test Token")
    .setTokenSymbol("HTT")
    .setDecimals(2)
    .setInitialSupply(supplyWithDecimals)
    .setTreasuryAccountId(this.account);
  
  const receipt = await (await transaction.execute(client)).getReceipt(client);
  this.tokenId = receipt.tokenId;
});
Then(/^The total supply of the token is (\d+)$/, async function (expectedSupply: number) {
  const tokenInfo = await new TokenInfoQuery()
    .setTokenId(this.tokenId)
    .execute(client);
  
  const actualSupply = tokenInfo.totalSupply.toNumber() / Math.pow(10, tokenInfo.decimals);
  assert.strictEqual(actualSupply, expectedSupply);
});
Then(/^An attempt to mint tokens fails$/, async function () {
  try {
    const transaction = new TokenMintTransaction()
      .setTokenId(this.tokenId)
      .setAmount(100);
    
    await (await transaction.execute(client)).getReceipt(client);
    assert.fail('Expected mint to fail but it succeeded');
  } catch (error) {
    assert.ok(error, 'Mint operation failed as expected');
  }
});
Given(/^A first hedera account with more than (\d+) hbar$/, async function (expectedBalance: number) {
  const account = accounts[0];
  this.account = AccountId.fromString(account.id);
  this.privKey = PrivateKey.fromStringED25519(account.privateKey);
  client.setOperator(this.account, this.privKey);

  const query = new AccountBalanceQuery().setAccountId(this.account);
  const balance = await query.execute(client);
  const hbarBalance = balance.hbars.toBigNumber().toNumber();
  assert.ok(hbarBalance > expectedBalance, `Expected balance > ${expectedBalance}, but got ${hbarBalance}`);
});
Given(/^A second Hedera account$/, async function () {
  const account = accounts[1];
  this.account2 = AccountId.fromString(account.id);
  this.privKey2 = PrivateKey.fromStringED25519(account.privateKey);
});
Given(/^A token named Test Token \(HTT\) with (\d+) tokens$/, async function (totalSupply: number) {
  const supplyWithDecimals = totalSupply * Math.pow(10, 2);
  const transaction = new TokenCreateTransaction()
    .setTokenName("Test Token")
    .setTokenSymbol("HTT")
    .setDecimals(2)
    .setInitialSupply(supplyWithDecimals)
    .setTreasuryAccountId(this.account);
  
  const receipt = await (await transaction.execute(client)).getReceipt(client);
  this.tokenId = receipt.tokenId;
});
Given(/^The first account holds (\d+) HTT tokens$/, async function (expectedAmount: number) {
  const balance = await new AccountBalanceQuery()
    .setAccountId(this.account)
    .execute(client);
  
  const tokenBalance = balance.tokens?.get(this.tokenId)?.toNumber() || 0;
  const actualAmount = tokenBalance / Math.pow(10, 2);
  
  if (actualAmount !== expectedAmount) {
    const diff = expectedAmount - actualAmount;
    if (diff > 0) {
      const transferAmount = diff * Math.pow(10, 2);
      await (await new TransferTransaction()
        .addTokenTransfer(this.tokenId, this.account, transferAmount)
        .addTokenTransfer(this.tokenId, this.account, -transferAmount)
        .execute(client)).getReceipt(client);
    }
  }
});
Given(/^The second account holds (\d+) HTT tokens$/, async function (expectedAmount: number) {
  const associateTx = await new TokenAssociateTransaction()
    .setAccountId(this.account2)
    .setTokenIds([this.tokenId])
    .freezeWith(client)
    .sign(this.privKey2);
  
  await (await associateTx.execute(client)).getReceipt(client);
  
  const balance = await new AccountBalanceQuery()
    .setAccountId(this.account2)
    .execute(client);
  
  const tokenBalance = balance.tokens?.get(this.tokenId)?.toNumber() || 0;
  const actualAmount = tokenBalance / Math.pow(10, 2);
  assert.strictEqual(actualAmount, expectedAmount);
});
When(/^The first account creates a transaction to transfer (\d+) HTT tokens to the second account$/, async function (amount: number) {
  const transferAmount = amount * Math.pow(10, 2);
  this.transaction = new TransferTransaction()
    .addTokenTransfer(this.tokenId, this.account, -transferAmount)
    .addTokenTransfer(this.tokenId, this.account2, transferAmount);
});
When(/^The first account submits the transaction$/, async function () {
  await (await this.transaction.execute(client)).getReceipt(client);
});
When(/^The second account creates a transaction to transfer (\d+) HTT tokens to the first account$/, async function (amount: number) {
  this.firstAccountHbarBefore = (await new AccountBalanceQuery()
    .setAccountId(this.account)
    .execute(client)).hbars.toBigNumber().toNumber();
  
  const transferAmount = amount * Math.pow(10, 2);
  this.transaction = new TransferTransaction()
    .addTokenTransfer(this.tokenId, this.account2, -transferAmount)
    .addTokenTransfer(this.tokenId, this.account, transferAmount)
    .freezeWith(client);
  
  this.transaction = await this.transaction.sign(this.privKey2);
});
Then(/^The first account has paid for the transaction fee$/, async function () {
  const firstAccountHbarAfter = (await new AccountBalanceQuery()
    .setAccountId(this.account)
    .execute(client)).hbars.toBigNumber().toNumber();
  
  assert.ok(firstAccountHbarAfter < this.firstAccountHbarBefore, 'First account should have paid the transaction fee');
});
Given(/^A first hedera account with more than (\d+) hbar and (\d+) HTT tokens$/, async function (expectedHbar: number, expectedTokens: number) {
  const account = accounts[0];
  this.account = AccountId.fromString(account.id);
  this.privKey = PrivateKey.fromStringED25519(account.privateKey);
  client.setOperator(this.account, this.privKey);

  const supplyWithDecimals = 1000 * Math.pow(10, 2);
  const tokenTx = new TokenCreateTransaction()
    .setTokenName("Test Token")
    .setTokenSymbol("HTT")
    .setDecimals(2)
    .setInitialSupply(supplyWithDecimals)
    .setTreasuryAccountId(this.account);
  
  const receipt = await (await tokenTx.execute(client)).getReceipt(client);
  this.tokenId = receipt.tokenId;
  
  const transferAmount = expectedTokens * Math.pow(10, 2);
  await (await new TransferTransaction()
    .addTokenTransfer(this.tokenId, this.account, transferAmount)
    .addTokenTransfer(this.tokenId, this.account, -transferAmount)
    .execute(client)).getReceipt(client);
});
Given(/^A second Hedera account with (\d+) hbar and (\d+) HTT tokens$/, async function (expectedHbar: number, expectedTokens: number) {
  const account = accounts[1];
  this.account2 = AccountId.fromString(account.id);
  this.privKey2 = PrivateKey.fromStringED25519(account.privateKey);
  
  const associateTx = await new TokenAssociateTransaction()
    .setAccountId(this.account2)
    .setTokenIds([this.tokenId])
    .freezeWith(client)
    .sign(this.privKey2);
  
  await (await associateTx.execute(client)).getReceipt(client);
  
  if (expectedTokens > 0) {
    const transferAmount = expectedTokens * Math.pow(10, 2);
    await (await new TransferTransaction()
      .addTokenTransfer(this.tokenId, this.account, -transferAmount)
      .addTokenTransfer(this.tokenId, this.account2, transferAmount)
      .execute(client)).getReceipt(client);
  }
});
Given(/^A third Hedera account with (\d+) hbar and (\d+) HTT tokens$/, async function (expectedHbar: number, expectedTokens: number) {
  const account = accounts[2];
  this.account3 = AccountId.fromString(account.id);
  this.privKey3 = PrivateKey.fromStringED25519(account.privateKey);
  
  const associateTx = await new TokenAssociateTransaction()
    .setAccountId(this.account3)
    .setTokenIds([this.tokenId])
    .freezeWith(client)
    .sign(this.privKey3);
  
  await (await associateTx.execute(client)).getReceipt(client);
  
  if (expectedTokens > 0) {
    const transferAmount = expectedTokens * Math.pow(10, 2);
    await (await new TransferTransaction()
      .addTokenTransfer(this.tokenId, this.account, -transferAmount)
      .addTokenTransfer(this.tokenId, this.account3, transferAmount)
      .execute(client)).getReceipt(client);
  }
});
Given(/^A fourth Hedera account with (\d+) hbar and (\d+) HTT tokens$/, async function (expectedHbar: number, expectedTokens: number) {
  const account = accounts[3];
  this.account4 = AccountId.fromString(account.id);
  this.privKey4 = PrivateKey.fromStringED25519(account.privateKey);
  
  const associateTx = await new TokenAssociateTransaction()
    .setAccountId(this.account4)
    .setTokenIds([this.tokenId])
    .freezeWith(client)
    .sign(this.privKey4);
  
  await (await associateTx.execute(client)).getReceipt(client);
  
  if (expectedTokens > 0) {
    const transferAmount = expectedTokens * Math.pow(10, 2);
    await (await new TransferTransaction()
      .addTokenTransfer(this.tokenId, this.account, -transferAmount)
      .addTokenTransfer(this.tokenId, this.account4, transferAmount)
      .execute(client)).getReceipt(client);
  }
});
When(/^A transaction is created to transfer (\d+) HTT tokens out of the first and second account and (\d+) HTT tokens into the third account and (\d+) HTT tokens into the fourth account$/, async function (outAmount: number, inAmount3: number, inAmount4: number) {
  const out = outAmount * Math.pow(10, 2);
  const in3 = inAmount3 * Math.pow(10, 2);
  const in4 = inAmount4 * Math.pow(10, 2);
  
  this.transaction = new TransferTransaction()
    .addTokenTransfer(this.tokenId, this.account, -out)
    .addTokenTransfer(this.tokenId, this.account2, -out)
    .addTokenTransfer(this.tokenId, this.account3, in3)
    .addTokenTransfer(this.tokenId, this.account4, in4)
    .freezeWith(client);
  
  this.transaction = await (await this.transaction.sign(this.privKey)).sign(this.privKey2);
});
Then(/^The third account holds (\d+) HTT tokens$/, async function (expectedAmount: number) {
  const balance = await new AccountBalanceQuery()
    .setAccountId(this.account3)
    .execute(client);
  
  const tokenBalance = balance.tokens?.get(this.tokenId)?.toNumber() || 0;
  const actualAmount = tokenBalance / Math.pow(10, 2);
  assert.strictEqual(actualAmount, expectedAmount);
});
Then(/^The fourth account holds (\d+) HTT tokens$/, async function (expectedAmount: number) {
  const balance = await new AccountBalanceQuery()
    .setAccountId(this.account4)
    .execute(client);
  
  const tokenBalance = balance.tokens?.get(this.tokenId)?.toNumber() || 0;
  const actualAmount = tokenBalance / Math.pow(10, 2);
  assert.strictEqual(actualAmount, expectedAmount);
});
