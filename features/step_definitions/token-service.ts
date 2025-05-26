import { Given, Then, When } from "@cucumber/cucumber";
import { accounts } from "../../src/config";
import { AccountBalanceQuery, AccountId, Client,
  PrivateKey, TokenCreateTransaction, TokenInfoQuery,
  TokenMintTransaction, 
  TokenSupplyType, TransferTransaction, TokenAssociateTransaction,
  TransactionRecordQuery, TransactionId,
  TokenId} from "@hashgraph/sdk";
import assert from "node:assert";
import { setDefaultTimeout } from '@cucumber/cucumber';
setDefaultTimeout(20 * 1000);

const client = Client.forTestnet()

const accountIdArr = accounts.map(account => AccountId.fromString(account.id));
const privateKeyArr = accounts.map(account => PrivateKey.fromStringED25519(account.privateKey));
const ecdsaPrivateKeyArr = accounts.map(account => PrivateKey.fromStringECDSA(account.privateKey));
const clients = accountIdArr.map((accountId, index) => {
  return Client.forTestnet().setOperator(accountId, privateKeyArr[index]);
});

async function verifyAccountTokenBalance(accountSequence: number, tokenId: TokenId, expectedTokens: number) {
  const query = new AccountBalanceQuery().setAccountId(accountIdArr[accountSequence]);
  const balance = await query.execute(clients[accountSequence]);
  // Check if the token is associated
  if(balance.tokens?.get(tokenId) == undefined) {
    const associateTransaction = new TokenAssociateTransaction()
    .setAccountId(accountIdArr[accountSequence])
    .setTokenIds([tokenId])
    .setTransactionId(TransactionId.generate(accountIdArr[2]))
    .freezeWith(clients[accountSequence]);

    const signedAssociateTx = await associateTransaction.sign(privateKeyArr[accountSequence]);
    const payerSignature = await signedAssociateTx.sign(privateKeyArr[2]);
    const associateResponse = await payerSignature.execute(clients[2]);
    const associateReceipt = await associateResponse.getReceipt(clients[2]);
  }

  const existingBalance = balance.tokens?.get(tokenId)?.toNumber() ?? 0;

  // Only transfer if actual balance is lower than expected
  const tokensToTransfer = expectedTokens - existingBalance;

  if(tokensToTransfer>0){  
    const transferTransaction = new TransferTransaction()
        .addTokenTransfer(tokenId, accountIdArr[2], -tokensToTransfer)
        .addTokenTransfer(tokenId, accountIdArr[accountSequence], tokensToTransfer)
        .freezeWith(clients[2]);
  
    //Sign with the sender account private key
    const signTx = await transferTransaction.sign(ecdsaPrivateKeyArr[2]);
  
    //Sign with the client operator private key and submit to a Hedera network
    const txResponse = await signTx.execute(clients[2]);
  
    //Request the receipt of the transaction
    const receipt = await txResponse.getReceipt(clients[2]);
    //Obtain the transaction consensus status
    const transactionStatus = receipt.status;
    }
  //Sign with the client operator private key and submit to a Hedera network
  const tokenBalance = await query.execute(clients[accountSequence]);

  const actualBalance = tokenBalance.tokens 
    ? tokenBalance.tokens.get(tokenId)?.toNumber() 
    : null;

    assert.strictEqual(actualBalance, expectedTokens)
} 


Given(/^A Hedera account with more than (\d+) hbar$/, async function (expectedBalance: number) {
  //Create the query request
  const query = new AccountBalanceQuery().setAccountId(accountIdArr[0]);
  const balance = await query.execute(clients[0]);
  assert.ok(balance.hbars.toBigNumber().toNumber() > expectedBalance)
});

When(/^I create a token named Test Token \(HTT\)$/, async function () {
  const transaction = new TokenCreateTransaction()
  .setTokenName("Test Token")
  .setTokenSymbol("HTT")
  .setDecimals(2)
  .setSupplyKey(ecdsaPrivateKeyArr[0])
  .setTreasuryAccountId(accountIdArr[0])
  .freezeWith(clients[0]);

  // Sign the transaction with the operator's private key
  const tokenCreateTxSigned = await transaction.sign(ecdsaPrivateKeyArr[0]);

  // Submit the signed transaction to the Hedera network
  const tokenCreateTxSubmitted = await tokenCreateTxSigned.execute(clients[0]);

  // Get the transaction receipt
  const tokenCreateTxReceipt = await tokenCreateTxSubmitted.getReceipt(clients[0]);

  // Get and log the newly created token ID to the console
  const tokenId = tokenCreateTxReceipt.tokenId;
  this.tokenId = tokenId;
});

Then(/^The token has the name "([^"]*)"$/, async function (name: string) {
  const query = new TokenInfoQuery()
  .setTokenId(this.tokenId);

  const tokenName = (await query.execute(clients[0])).name;
  assert.ok(tokenName === name, `Expected token name to be "Test Token", but got "${tokenName}"`);
});

Then(/^The token has the symbol "([^"]*)"$/, async function (symbol: string) {
  const query = new TokenInfoQuery()
  .setTokenId(this.tokenId);

  const tokenSym = (await query.execute(clients[0])).symbol;
  assert.ok(tokenSym === symbol);
});

Then(/^The token has (\d+) decimals$/, async function (decimals: number) {
  const query = new TokenInfoQuery()
  .setTokenId(this.tokenId);

  const tokenDecimal = (await query.execute(clients[0])).decimals;
  assert.ok(tokenDecimal === decimals);
});

Then(/^The token is owned by the account$/, async function () {
  const query = new TokenInfoQuery()
  .setTokenId(this.tokenId);

  const tokenOwner = (await query.execute(clients[0])).treasuryAccountId;
  if (!tokenOwner) {
    throw new Error('Token owner is null');
  }
  assert.ok(tokenOwner.toString() === accountIdArr[0].toString(), `Expected token owner to be ${accountIdArr[0]}, but got ${tokenOwner}`);
});

Then(/^An attempt to mint (\d+) additional tokens succeeds$/, async function (numberOfToken: number) {
  const transaction = new TokenMintTransaction()
      .setTokenId(this.tokenId)
      .setAmount(numberOfToken)
      .freezeWith(clients[0]);

  //Sign with the supply private key of the token 
  const signTx = await transaction.sign(ecdsaPrivateKeyArr[0]);

  //Submit the transaction to a Hedera network    
  const txResponse = await signTx.execute(clients[0]);

  //Request the receipt of the transaction
  const receipt = await txResponse.getReceipt(clients[0]);

  const tokensMinted = receipt.totalSupply?.toNumber();
  assert.ok(tokensMinted === numberOfToken)
});


When(/^I create a fixed supply token named Test Token \(HTT\) with (\d+) tokens$/, async function (supply: Long) {
  const transaction = new TokenCreateTransaction()
  .setTokenName("Test Token")
  .setTokenSymbol("HTT")
  .setDecimals(2)
  .setSupplyKey(ecdsaPrivateKeyArr[0])
  .setTreasuryAccountId(accountIdArr[0])
  .setSupplyType(TokenSupplyType.Finite)
  .setInitialSupply(supply)
  .setMaxSupply(supply)
  .freezeWith(clients[0]);

  // Sign the transaction with the operator's private key
  const tokenCreateTxSigned = await transaction.sign(ecdsaPrivateKeyArr[0]);

  // Submit the signed transaction to the Hedera network
  const tokenCreateTxSubmitted = await tokenCreateTxSigned.execute(clients[0]);

  // Get the transaction receipt
  const tokenCreateTxReceipt = await tokenCreateTxSubmitted.getReceipt(clients[0]);

  // Get and log the newly created token ID to the console
  const tokenId = tokenCreateTxReceipt.tokenId;
  this.tokenId = tokenId;
});
Then(/^The total supply of the token is (\d+)$/, async function (supply: string) {
  const query = new TokenInfoQuery()
  .setTokenId(this.tokenId);

  const tokenSupply = (await query.execute(clients[0])).totalSupply;

  const actualSupply = tokenSupply.toNumber();
  const expected = parseInt(supply, 10);

  assert.strictEqual(actualSupply, expected);
});
Then(/^An attempt to mint tokens fails$/, async function () {
  try{
  const transaction = new TokenMintTransaction()
      .setTokenId(this.tokenId)
      .setAmount(10)
      .freezeWith(clients[0]);

  //Sign with the supply private key of the token 
  const signTx = await transaction.sign(ecdsaPrivateKeyArr[0]);

  //Submit the transaction to a Hedera network    
  const txResponse = await signTx.execute(clients[0]);

  //Request the receipt of the transaction
  const receipt = await txResponse.getReceipt(clients[0]);
  assert.fail("Minting succeeded, but it should have failed.");
} catch (err: any) {
  assert.ok(err.status && err.status.toString() === "TOKEN_MAX_SUPPLY_REACHED", "Expected TOKEN_MAX_SUPPLY_REACHED error");
}

});
Given(/^A first hedera account with more than (\d+) hbar$/, async function (expectedBalance: number) {
  //Create the query request
  const query = new AccountBalanceQuery().setAccountId(accountIdArr[0]);
  const balance = await query.execute(clients[0])
  assert.ok(balance.hbars.toBigNumber().toNumber() > expectedBalance)
});
Given(/^A second Hedera account$/, async function () {
  const query = new AccountBalanceQuery().setAccountId(accountIdArr[1]);
});
Given(/^A token named Test Token \(HTT\) with (\d+) tokens$/, async function (supply: Long) {
  const transaction = new TokenCreateTransaction()
  .setTokenName("Test Token")
  .setTokenSymbol("HTT")
  .setDecimals(2)
  .setSupplyKey(ecdsaPrivateKeyArr[2])
  .setTreasuryAccountId(accountIdArr[2])
  .setSupplyType(TokenSupplyType.Infinite)
  .setInitialSupply(supply)
  .freezeWith(clients[2]);

  // Sign the transaction with the operator's private key
  const tokenCreateTxSigned = await transaction.sign(ecdsaPrivateKeyArr[2]);

  // Submit the signed transaction to the Hedera network
  const tokenCreateTxSubmitted = await tokenCreateTxSigned.execute(clients[2]);

  // Get the transaction receipt
  const tokenCreateTxReceipt = await tokenCreateTxSubmitted.getReceipt(clients[2]);

  // Get and log the newly created token ID to the console
  const tokenId = tokenCreateTxReceipt.tokenId;
  this.tokenId = tokenId;
});

Given(/^The first account holds (\d+) HTT tokens$/, async function (expectedTokens: number) {
 await verifyAccountTokenBalance(0, this.tokenId, expectedTokens);
});

Given(/^The second account holds (\d+) HTT tokens$/, async function (expectedTokens: number) {
  await verifyAccountTokenBalance(1, this.tokenId, expectedTokens);
});
When(/^The first account creates a transaction to transfer (\d+) HTT tokens to the second account$/, async function (transferTokens: number) {
  // Prepare the transfer transaction
  const transferTransaction = new TransferTransaction()
    .addTokenTransfer(this.tokenId, accountIdArr[0], -transferTokens)
    .addTokenTransfer(this.tokenId, accountIdArr[1], transferTokens)
    .freezeWith(clients[0]);

  const signTx = await transferTransaction.sign(privateKeyArr[1]);

  this.signTx = signTx;
});
When(/^The first account submits the transaction$/, async function () {
  const signedByPayer = await this.signTx.sign(privateKeyArr[0]);

  const txResponse = await signedByPayer.execute(clients[0]);
  const receipt = await txResponse.getReceipt(clients[0]);
  const transactionStatus = receipt.status;
  this.transactionId = txResponse.transactionId;

  assert.ok(transactionStatus.toString() === "SUCCESS", "Transaction did not succeed");
});
When(/^The second account creates a transaction to transfer (\d+) HTT tokens to the first account$/, async function (transferTokens: number) {
  const transferTransaction = new TransferTransaction()
    .addTokenTransfer(this.tokenId, accountIdArr[1], -transferTokens)
    .addTokenTransfer(this.tokenId, accountIdArr[0], transferTokens)
    .setTransactionId(TransactionId.generate(accountIdArr[0]))
    .freezeWith(clients[1]);

  const signTx = await transferTransaction.sign(privateKeyArr[1]);
  this.signTx = signTx;
});
Then(/^The first account has paid for the transaction fee$/, async function () {
  const txRecord = await new TransactionRecordQuery()
    .setTransactionId(this.transactionId)
    .execute(clients[0])

   assert.equal(txRecord.transactionId.accountId?.toString(), accountIdArr[0]);

});
Given(/^A first hedera account with more than (\d+) hbar and (\d+) HTT tokens$/, async function (expectedBalance: number, expectedTokens: number) {
  //Create the query request
  const query = new AccountBalanceQuery().setAccountId(accountIdArr[0]);
  const balance = await query.execute(clients[0]);
  assert.ok(balance.hbars.toBigNumber().toNumber() > expectedBalance)

  await verifyAccountTokenBalance(0, this.tokenId, expectedTokens);
});

Given(/^A second Hedera account with (\d+) hbar and (\d+) HTT tokens$/, async function (expectedBalance: number, expectedTokens: number) {
    //Create the query request
    const query = new AccountBalanceQuery().setAccountId(accountIdArr[5]);
    const balance = await query.execute(clients[5]);
    assert.ok(balance.hbars.toBigNumber().toNumber() == expectedBalance)

    await verifyAccountTokenBalance(5, this.tokenId, expectedTokens);
});

Given(/^A third Hedera account with (\d+) hbar and (\d+) HTT tokens$/, async function (expectedBalance: number, expectedTokens: number) {
    //Create the query request
    const query = new AccountBalanceQuery().setAccountId(accountIdArr[6]);
    const balance = await query.execute(clients[6]);
    assert.ok(balance.hbars.toBigNumber().toNumber() == expectedBalance)

    await verifyAccountTokenBalance(6, this.tokenId, expectedTokens);
});
Given(/^A fourth Hedera account with (\d+) hbar and (\d+) HTT tokens$/, async function (expectedBalance: number, expectedTokens: number) {
    //Create the query request
    const query = new AccountBalanceQuery().setAccountId(accountIdArr[7]);
    const balance = await query.execute(clients[7]);
    assert.ok(balance.hbars.toBigNumber().toNumber() == expectedBalance)

    await verifyAccountTokenBalance(7, this.tokenId, expectedTokens);
});
When(/^A transaction is created to transfer (\d+) HTT tokens out of the first and second account and (\d+) HTT tokens into the third account and (\d+) HTT tokens into the fourth account$/, async function (transferOut: number, transferIn3: number, transferIn4: number) {
  const tx = await new TransferTransaction()
    .addTokenTransfer(this.tokenId, accountIdArr[0], -transferOut)
    .addTokenTransfer(this.tokenId, accountIdArr[5], -transferOut)
    .addTokenTransfer(this.tokenId, accountIdArr[6], transferIn3)
    .addTokenTransfer(this.tokenId, accountIdArr[7], transferIn4)
    .setTransactionId(TransactionId.generate(accountIdArr[0]))
    .freezeWith(clients[0]);

    const signTx = await tx.sign(privateKeyArr[5]);
    this.signTx = signTx;
});
Then(/^The third account holds (\d+) HTT tokens$/, async function (expectedTokens: number) {
  await verifyAccountTokenBalance(6, this.tokenId, expectedTokens);
});
Then(/^The fourth account holds (\d+) HTT tokens$/, async function (expectedTokens: number) {
  await verifyAccountTokenBalance(7, this.tokenId, expectedTokens);
});
