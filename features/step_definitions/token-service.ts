import { Given, Then, When, setDefaultTimeout } from "@cucumber/cucumber";
import { accounts } from "../../src/config";
import { Client, TokenId, Transaction, TransactionId } from "@hashgraph/sdk";
import assert from "node:assert";
import { AccountService } from "../../src/hedera/account-service";
import { TokenService } from "../../src/hedera/token-service";
import { Account } from "../../src/types";

// Set default timeout for steps
setDefaultTimeout(20000)

// Setup test client and services
const client = Client.forTestnet()
const accountService = new AccountService(client)
const tokenService = new TokenService(client)

// Import test accounts
const operatorAccount = accounts[0]
let accountOne = accounts[1]
let accountTwo = accounts[2]
let accountThree: Account
let accountFour: Account

// Set operator using the first account
accountService.setOperator(operatorAccount)

// Variables used across steps
let tokenId: TokenId
const initialTokenSupply = 1000
let tokenTransferTransaction: Transaction

Given(/^A Hedera account with more than (\d+) hbar$/, async function (expectedBalance: number) {
  const balance = await accountService.getHbarBalance(accountOne.id)
  assert.ok(balance > expectedBalance)
});

When(/^I create a token named Test Token \(HTT\)$/, async function () {
  const receipt = await tokenService.createToken('Test Token', 'HTT', 2, initialTokenSupply, operatorAccount)
  assert(receipt.tokenId != null)
  tokenId = receipt.tokenId
});

Then(/^The token has the name "([^"]*)"$/, async function (expectedTokenName: string) {
  const tokenInfo = await tokenService.getTokenInfo(tokenId)
  assert.ok(tokenInfo.name === expectedTokenName)
});

Then(/^The token has the symbol "([^"]*)"$/, async function (expectedSymbol: string) {
  const tokenInfo = await tokenService.getTokenInfo(tokenId)
  assert.ok(tokenInfo.symbol === expectedSymbol)
});

Then(/^The token has (\d+) decimals$/, async function (expectedDecimals: number) {
  const tokenInfo = await tokenService.getTokenInfo(tokenId)
  assert.ok(tokenInfo.decimals === expectedDecimals)
});

Then(/^The token is owned by the account$/, async function () {
  const tokenInfo = await tokenService.getTokenInfo(tokenId)
  assert.ok(tokenInfo.treasuryAccountId?.toString() === operatorAccount.id.toString())
});

Then(/^An attempt to mint (\d+) additional tokens succeeds$/, async function (expectedNewToken) {
  const receipt = await tokenService.mintToken(tokenId, expectedNewToken, operatorAccount)
  assert.ok(parseInt(receipt.totalSupply) === (initialTokenSupply + expectedNewToken))
});

When(/^I create a fixed supply token named Test Token \(HTT\) with (\d+) tokens$/, async function (initialTokenSupply: number) {
  const receipt = await tokenService.createToken('Test Token', 'HTT', 2, initialTokenSupply, operatorAccount, true)
  assert(receipt.tokenId != null)
  tokenId = receipt.tokenId
});

Then(/^The total supply of the token is (\d+)$/, async function (expectedTotalTokenSupply) {
  const tokenInfo = await tokenService.getTokenInfo(tokenId)
  assert.ok(parseInt(tokenInfo.totalSupply) === expectedTotalTokenSupply)
});

Then(/^An attempt to mint tokens fails$/, async function () {
  let errorOccurred = false;
  try {
    await tokenService.mintToken(tokenId, 100, operatorAccount);
  } catch (error) {
    errorOccurred = true;
  }
  assert.ok(errorOccurred === true);
});

Given(/^A first hedera account with more than (\d+) hbar$/, async function (expectedBalance: number) {
  const balance = await accountService.getHbarBalance(accountOne.id)
  assert.ok(balance > expectedBalance)
});

Given(/^A second Hedera account$/, async function () {
  const balance = await accountService.getHbarBalance(accountTwo.id)
  assert.ok(balance > 0)
});

/**
 * Creates a token with the specified total supply and associates it with two accounts.
 */
Given(/^A token named Test Token \(HTT\) with (\d+) tokens$/, async function (expectedTotalTokenSupply: number) {
  const receipt = await tokenService.createToken('Test token', 'HTT', 2, expectedTotalTokenSupply, operatorAccount)
  assert.ok(receipt.tokenId !== null)

  const tokenInfo = await tokenService.getTokenInfo(receipt.tokenId)
  assert.ok(parseInt(tokenInfo.totalSupply) === expectedTotalTokenSupply)
  tokenId = receipt.tokenId

  await tokenService.associateToken(accountOne, tokenId)
  await tokenService.associateToken(accountTwo, tokenId)

  const transferReceipt = await tokenService.transferToken(operatorAccount, accountOne, tokenId, 100)
  assert.ok(transferReceipt.status.toString() === 'SUCCESS')
});

Given(/^The first account holds (\d+) HTT tokens$/, async function (expectedToken: number) {
  const balance = await tokenService.getTokenBalance(accountOne.id, tokenId)
  assert.ok(balance === expectedToken)
});

/**
 * Verifies that the second account holds the expected number of HTT tokens.
 * 
 * If the balance is not equal to the expected token count, it reassigns accountOne and accountTwo
 * to alternative accounts and transfers tokens accordingly.
 * 
 * This workaround was added because multiple scenarios use this step definition. For example, in the scenario
 * "Create a token transfer transaction paid for by the recipient", the step requires that the second account
 * holds 100 HTT tokens.
 * 
 * Note: In other scenarios, the token transfer has already been completed in an earlier step,
 * so this reassignment and transfer are not necessary.
 * 
 * highlighting a potential mistake in the test definitions.
 */
Given(/^The second account holds (\d+) HTT tokens$/, async function (expectedToken: number) {
  let balance = await tokenService.getTokenBalance(accountTwo.id, tokenId)

  if (balance !== expectedToken) {
    accountOne = accounts[3]
    accountTwo = accounts[4]

    await tokenService.associateToken(accountOne, tokenId)
    await tokenService.associateToken(accountTwo, tokenId)

    const transferReceipt = await tokenService.transferToken(operatorAccount, accountTwo, tokenId, expectedToken)
    assert.ok(transferReceipt.status.toString() === 'SUCCESS')
  }

  balance = await tokenService.getTokenBalance(accountTwo.id, tokenId)
  assert.ok(balance === expectedToken)
});

When(/^The first account creates a transaction to transfer (\d+) HTT tokens to the second account$/, async function (amount: number) {
  const transaction = await tokenService.createTokenTransferTransaction([{ account: accountOne, amount: -amount }, { account: accountTwo, amount }], tokenId)
  tokenTransferTransaction = await transaction.sign(accountOne.privateKey)

  assert.ok(tokenTransferTransaction !== null)
});

When(/^The first account submits the transaction$/, async function () {
  const receipt = await tokenService.executeTransaction(tokenTransferTransaction)
  assert.ok(receipt.status.toString() === 'SUCCESS')
});

When(/^The second account creates a transaction to transfer (\d+) HTT tokens to the first account$/, async function (amount: number) {
  const payerTransactionId = TransactionId.generate(accountOne.id)
  let transaction = await tokenService.createTokenTransferTransaction([{ account: accountTwo, amount: -amount }, { account: accountOne, amount }], tokenId, payerTransactionId)
  transaction = await transaction.sign(accountOne.privateKey)
  tokenTransferTransaction = await transaction.sign(accountTwo.privateKey)

  assert.ok(tokenTransferTransaction != null)

  this.firstAccountHbarBalanceBeforeTransaction = await accountService.getHbarBalance(accountOne.id)
});

Then(/^The first account has paid for the transaction fee$/, async function () {
  const firstAccountHbarBalanceAfterTransaction = await accountService.getHbarBalance(accountOne.id)
  assert.ok(this.firstAccountHbarBalanceBeforeTransaction > firstAccountHbarBalanceAfterTransaction)
});

/**
 * Sets up a first Hedera account with specified hbar and HTT tokens.
 */
Given(/^A first hedera account with more than (\d+) hbar and (\d+) HTT tokens$/, async function (expectedHbar: number, expectedToken: number) {
  accountOne = accounts[9]

  const hbarBalance = await accountService.getHbarBalance(accountOne.id)
  assert.ok(hbarBalance > expectedHbar)

  await tokenService.associateToken(accountOne, tokenId)

  const receipt = await tokenService.transferToken(operatorAccount, accountOne, tokenId, expectedToken)
  assert.ok(receipt.status.toString() === 'SUCCESS')

  const tokenBalance = await tokenService.getTokenBalance(accountOne.id, tokenId)
  assert.ok(tokenBalance === expectedToken)
});

/**
 * Sets up a second Hedera account with specified hbar and HTT tokens.
 */
Given(/^A second Hedera account with (\d+) hbar and (\d+) HTT tokens$/, async function (expectedHbar: number, expectedToken: number) {
  accountTwo = accounts[10]

  const hbarBalance = await accountService.getHbarBalance(accountTwo.id)
  assert.ok(hbarBalance === expectedHbar)

  await tokenService.associateToken(accountTwo, tokenId)

  const receipt = await tokenService.transferToken(operatorAccount, accountTwo, tokenId, expectedToken)
  assert.ok(receipt.status.toString() === 'SUCCESS')

  const tokenBalance = await tokenService.getTokenBalance(accountTwo.id, tokenId)
  assert.ok(tokenBalance === expectedToken)
});

/**
 * Sets up a third Hedera account with specified hbar and HTT tokens.
 */
Given(/^A third Hedera account with (\d+) hbar and (\d+) HTT tokens$/, async function (expectedHbar: number, expectedToken: number) {
  accountThree = accounts[11]

  const hbarBalance = await accountService.getHbarBalance(accountThree.id)
  assert.ok(hbarBalance === expectedHbar)

  await tokenService.associateToken(accountThree, tokenId)

  const receipt = await tokenService.transferToken(operatorAccount, accountThree, tokenId, expectedToken)
  assert.ok(receipt.status.toString() === 'SUCCESS')

  const tokenBalance = await tokenService.getTokenBalance(accountThree.id, tokenId)
  assert.ok(tokenBalance === expectedToken)
});

/**
 * Sets up a fourth Hedera account with specified hbar and HTT tokens.
 */
Given(/^A fourth Hedera account with (\d+) hbar and (\d+) HTT tokens$/, async function (expectedHbar: number, expectedToken: number) {
  accountFour = accounts[12]

  const hbarBalance = await accountService.getHbarBalance(accountFour.id)
  assert.ok(hbarBalance === expectedHbar)

  await tokenService.associateToken(accountFour, tokenId)

  const receipt = await tokenService.transferToken(operatorAccount, accountFour, tokenId, expectedToken)
  assert.ok(receipt.status.toString() === 'SUCCESS')

  const tokenBalance = await tokenService.getTokenBalance(accountFour.id, tokenId)
  assert.ok(tokenBalance === expectedToken)
});

/**
 * Creates a multi-party token transfer transaction with specified amounts.
 */
When(/^A transaction is created to transfer (\d+) HTT tokens out of the first and second account and (\d+) HTT tokens into the third account and (\d+) HTT tokens into the fourth account$/, async function (amountOut: number, amountInThird: number, amountInFourth: number) {
  const transaction = await tokenService.createTokenTransferTransaction([
    { account: accountOne, amount: -amountOut },
    { account: accountTwo, amount: -amountOut },
    { account: accountThree, amount: amountInThird },
    { account: accountFour, amount: amountInFourth }
  ], tokenId)
  tokenTransferTransaction = await transaction.sign(accountOne.privateKey)
  tokenTransferTransaction = await transaction.sign(accountTwo.privateKey)

  assert.ok(tokenTransferTransaction !== null)
});

Then(/^The third account holds (\d+) HTT tokens$/, async function (expectedToken: number) {
  const tokenBalance = await tokenService.getTokenBalance(accountThree.id, tokenId)
  assert.ok(tokenBalance === expectedToken)
});

Then(/^The fourth account holds (\d+) HTT tokens$/, async function (expectedToken: number) {
  const tokenBalance = await tokenService.getTokenBalance(accountFour.id, tokenId)
  assert.ok(tokenBalance === expectedToken)
});
