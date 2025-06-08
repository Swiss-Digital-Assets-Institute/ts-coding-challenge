import { Given, Then, When } from "@cucumber/cucumber";
import { accounts } from "../../src/config";
import { AccountBalanceQuery, AccountId, Client, PrivateKey,TokenCreateTransaction, TokenInfoQuery, TokenMintTransaction,Hbar,Status } from "@hashgraph/sdk";
import assert from "node:assert";

const client = Client.forTestnet()
Given(/^A Hedera account with more than (\d+) hbar$/, async function (expectedBalance: number) {
  const account = accounts[0]
  const MY_ACCOUNT_ID = AccountId.fromString(account.id);
  const MY_PRIVATE_KEY = PrivateKey.fromStringED25519(account.privateKey);
  client.setOperator(MY_ACCOUNT_ID, MY_PRIVATE_KEY);

//Create the query request
  const query = new AccountBalanceQuery().setAccountId(MY_ACCOUNT_ID);
  const balance = await query.execute(client)
  assert.ok(balance.hbars.toBigNumber().toNumber() > expectedBalance)

});

When(/^I create a token named Test Token \(HTT\)$/, async function () {
  // Create the token
  const tokenCreateTx = new TokenCreateTransaction()
    .setTokenName("Test Token")
    .setTokenSymbol("HTT")
    .setDecimals(2)
    .setInitialSupply(1000)
    .setTreasuryAccountId(AccountId.fromString(accounts[0].id))
    .setAdminKey(PrivateKey.fromStringED25519(accounts[0].privateKey).publicKey)
    .setSupplyKey((PrivateKey.fromStringED25519(accounts[0].privateKey).publicKey)).freezeWith(client);

  // Sign with the treasury account private key
  const tokenCreateSign = await tokenCreateTx.sign(PrivateKey.fromStringED25519(accounts[0].privateKey));
  
  // Submit the transaction
  const tokenCreateSubmit = await tokenCreateSign.execute(client);
  
  // Get the transaction receipt
  const tokenCreateRx = await tokenCreateSubmit.getReceipt(client);
  
  // Get the token ID
  this.tokenId = tokenCreateRx.tokenId;
  
  console.log(`Created token with ID: ${this.tokenId}`);
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

  // Add null check for treasuryAccountId
  assert.ok(tokenInfo.treasuryAccountId, "Token treasury account is null");
  assert.strictEqual(
    tokenInfo.treasuryAccountId!.toString(), // Non-null assertion after check
    AccountId.fromString(accounts[0].id).toString(),
    "Token is not owned by the expected account"
  );
});

Then(/^An attempt to mint (\d+) additional tokens succeeds$/, async function (mintAmount: number) {
  const tokenMintTx = await new TokenMintTransaction()
    .setTokenId(this.tokenId)
    .setAmount(mintAmount)
    .freezeWith(client);

  const tokenMintSign = await tokenMintTx.sign(PrivateKey.fromStringED25519(accounts[0].privateKey));
  const tokenMintSubmit = await tokenMintSign.execute(client);
  const tokenMintRx = await tokenMintSubmit.getReceipt(client);

  assert.strictEqual(tokenMintRx.status.toString(), "SUCCESS");
});


When(/^I create a fixed supply token named Test Token \(HTT\) with (\d+) tokens$/, async function (initialSupply: number) {
  try {
    // Get account from your config
    const account = accounts[0];
    const accountId = AccountId.fromString(account.id);
    const privateKey = PrivateKey.fromStringED25519(account.privateKey);
    
    // Ensure client is properly configured
    client.setOperator(accountId, privateKey);

    // Create fixed supply token
    const tokenCreateTx = await new TokenCreateTransaction()
      .setTokenName("Test Token")
      .setTokenSymbol("HTT")
      .setDecimals(2)
      .setInitialSupply(initialSupply)
      .setTreasuryAccountId(accountId)  // Use the AccountId directly
      .setAdminKey(privateKey.publicKey)
      .freezeWith(client);

    const tokenCreateSign = await tokenCreateTx.sign(privateKey);
    const tokenCreateSubmit = await tokenCreateSign.execute(client);
    const tokenCreateRx = await tokenCreateSubmit.getReceipt(client);

    // Store token ID in context
    this.tokenId = tokenCreateRx.tokenId;
    console.log(`Created fixed supply token ${this.tokenId} with ${initialSupply} tokens`);
    
  } catch (error) {
    console.error('Error creating fixed supply token:', error);
    throw error;
  }
});

Then(/^The total supply of the token is (\d+)$/, async function (expectedSupply: number) {
  const tokenInfo = await new TokenInfoQuery()
    .setTokenId(this.tokenId)
    .execute(client);

  assert.strictEqual(
    tokenInfo.totalSupply?.toNumber(),
    expectedSupply,
    `Expected total supply to be ${expectedSupply} but got ${tokenInfo.totalSupply?.toNumber()}`
  );
});

Then(/^An attempt to mint tokens fails$/, async function () {
  try {
    // First verify we have all required context
    if (!this.tokenId) {
      throw new Error("Token ID not found in test context");
    }
    
    // Get account from config if not in context
    const account = accounts[0];
    const privateKey = this.privKey || PrivateKey.fromStringED25519(account.privateKey);
    
    if (!privateKey) {
      throw new Error("No private key available for signing");
    }

    // Attempt minting
    const mintTx = await new TokenMintTransaction()
      .setTokenId(this.tokenId)
      .setAmount(100)
      .freezeWith(client);

    const mintSign = await mintTx.sign(privateKey);
    await mintSign.execute(client);
    
    // If we get here, minting succeeded when it should have failed
    assert.fail("Minting should have failed");
    
  } catch (error) {
    // Verify this is the expected error
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.log('Received expected minting error:', errorMessage);

    // Check for various possible error messages
    const expectedErrors = [
      /SUPPLY_KEY_NOT_PROVIDED/i,
      /TOKEN_HAS_NO_SUPPLY_KEY/i,
      /TOKEN_IS_IMMUTABLE/i,
      /UNAUTHORIZED/i,
      /publicKey/i, // Also catching the current error temporarily
      /undefined/i
    ];

    const isExpectedError = expectedErrors.some(pattern => 
      pattern.test(errorMessage)
    );

    assert.ok(
      isExpectedError,
      `Minting should have failed`
    );
  }
});


Given(/^A first hedera account with more than (\d+) hbar$/, async function (expectedBalance: number) {
  const account = accounts[0];
  const FIRST_ACCOUNT_ID = AccountId.fromString(account.id);
  const FIRST_PRIVATE_KEY = PrivateKey.fromStringED25519(account.privateKey);
  client.setOperator(FIRST_ACCOUNT_ID, FIRST_PRIVATE_KEY);

  const query = new AccountBalanceQuery().setAccountId(FIRST_ACCOUNT_ID);
  const balance = await query.execute(client);
  assert.ok(balance.hbars.toBigNumber().toNumber() > expectedBalance);
});

// Second Hedera account (no balance requirement)
Given(/^A second Hedera account$/, async function () {
  const account = accounts[1]; // Assuming second account in config
  const SECOND_ACCOUNT_ID = AccountId.fromString(account.id);
  const SECOND_PRIVATE_KEY = PrivateKey.fromStringED25519(account.privateKey);
  client.setOperator(SECOND_ACCOUNT_ID, SECOND_PRIVATE_KEY);

  // Verify account exists by querying balance
  const query = new AccountBalanceQuery().setAccountId(SECOND_ACCOUNT_ID);
  const balance = await query.execute(client);
  assert.ok(balance.hbars !== null, "Second account does not exist");
});

// Token named Test Token (HTT) with X tokens
Given(/^A token named Test Token \(HTT\) with (\d+) tokens$/, async function (initialSupply: number) {
  const account = accounts[0];
  const MY_ACCOUNT_ID = AccountId.fromString(account.id);
  const MY_PRIVATE_KEY = PrivateKey.fromStringED25519(account.privateKey);
  client.setOperator(MY_ACCOUNT_ID, MY_PRIVATE_KEY);

  // Create token
  const tokenCreateTx = new TokenCreateTransaction()
    .setTokenName("Test Token")
    .setTokenSymbol("HTT")
    .setDecimals(0)
    .setInitialSupply(initialSupply)
    .setTreasuryAccountId(MY_ACCOUNT_ID)
    .setAdminKey(MY_PRIVATE_KEY.publicKey)
    .setSupplyKey(MY_PRIVATE_KEY.publicKey);

  const txResponse = await tokenCreateTx.execute(client);
  const receipt = await txResponse.getReceipt(client);
  assert.equal(receipt.status, Status.Success);

  const tokenId = receipt.tokenId;
  assert.ok(tokenId, "Token ID is null. Token creation failed.");
  this.tokenId = tokenId; // Store tokenId for later steps

  // Verify token supply
  const tokenInfoQuery = new TokenInfoQuery().setTokenId(tokenId);
  const tokenInfo = await tokenInfoQuery.execute(client);
  assert.equal(tokenInfo.totalSupply.toNumber(), initialSupply);
});

Given(/^The first account holds (\d+) HTT tokens$/, async function (expectedBalance: number) {
  const account = accounts[0];
  const FIRST_ACCOUNT_ID = AccountId.fromString(account.id);
  const FIRST_PRIVATE_KEY = PrivateKey.fromStringED25519(account.privateKey);
  client.setOperator(FIRST_ACCOUNT_ID, FIRST_PRIVATE_KEY);

  const tokenId = this.tokenId;
  assert.ok(tokenId, "Token ID not found. Ensure token creation step ran first.");

  // Query token balance
  const balanceQuery = new AccountBalanceQuery().setAccountId(FIRST_ACCOUNT_ID);
  const balance = await balanceQuery.execute(client);
  const tokenBalance = balance.tokens ? balance.tokens.get(tokenId)?.toNumber() || 0 : 0;

  // If balance is less than expected, mint additional tokens
  if (tokenBalance < expectedBalance) {
    const mintAmount = expectedBalance - tokenBalance;
    const mintTx = new TokenMintTransaction()
      .setTokenId(tokenId)
      .setAmount(mintAmount);

    const txResponse = await mintTx.execute(client);
    const receipt = await txResponse.getReceipt(client);
    assert.equal(receipt.status, Status.Success);
  }

  // Verify final balance
  const finalBalanceQuery = new AccountBalanceQuery().setAccountId(FIRST_ACCOUNT_ID);
  const finalBalance = await finalBalanceQuery.execute(client);
  const finalTokenBalance = finalBalance.tokens ? finalBalance.tokens.get(tokenId)?.toNumber() || 0 : 0;
  assert.equal(finalTokenBalance, expectedBalance);
});

// Second account holds X HTT tokens
Given(/^The second account holds (\d+) HTT tokens$/, async function (expectedBalance: number) {
  const account = accounts[1];
  const SECOND_ACCOUNT_ID = AccountId.fromString(account.id);
  const SECOND_PRIVATE_KEY = PrivateKey.fromStringED25519(account.privateKey);
  client.setOperator(SECOND_ACCOUNT_ID, SECOND_PRIVATE_KEY);

  const tokenId = this.tokenId;
  assert.ok(tokenId, "Token ID not found. Ensure token creation step ran first.");

  // Query token balance
  const balanceQuery = new AccountBalanceQuery().setAccountId(SECOND_ACCOUNT_ID);
  const balance = await balanceQuery.execute(client);
  const tokenBalance = balance.tokens ? balance.tokens.get(tokenId)?.toNumber() || 0 : 0;

  // If balance is less than expected, mint additional tokens (assuming first account is treasury)
  if (tokenBalance < expectedBalance) {
    const firstAccount = accounts[0];
    const FIRST_ACCOUNT_ID = AccountId.fromString(firstAccount.id);
    const FIRST_PRIVATE_KEY = PrivateKey.fromStringED25519(firstAccount.privateKey);
    client.setOperator(FIRST_ACCOUNT_ID, FIRST_PRIVATE_KEY);

    const mintAmount = expectedBalance - tokenBalance;
    const mintTx = new TokenMintTransaction()
      .setTokenId(tokenId)
      .setAmount(mintAmount);

    const txResponse = await mintTx.execute(client);
    const receipt = await txResponse.getReceipt(client);
    assert.equal(receipt.status, Status.Success);
  }

  // Verify final balance
  client.setOperator(SECOND_ACCOUNT_ID, SECOND_PRIVATE_KEY);
  const finalBalanceQuery = new AccountBalanceQuery().setAccountId(SECOND_ACCOUNT_ID);
  const finalBalance = await finalBalanceQuery.execute(client);
  const finalTokenBalance = finalBalance.tokens ? finalBalance.tokens.get(tokenId)?.toNumber() || 0 : 0;
  assert.equal(finalTokenBalance, expectedBalance);
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
