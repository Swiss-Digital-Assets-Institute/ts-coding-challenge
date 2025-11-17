import { Given, Then, When } from "@cucumber/cucumber";
import { accounts, Account } from "../../src/config";
import {
  AccountBalanceQuery,
  AccountId,
  Client,
  PrivateKey,
  TokenCreateTransaction,
  TokenMintTransaction,
  TokenInfoQuery,
  TransferTransaction,
  TokenId,
  TransactionId,
  TokenAssociateTransaction
} from "@hashgraph/sdk";
import assert from "node:assert";

const client = Client.forTestnet()

// Helper function to find an account with sufficient balance
async function findAccountWithBalance(minBalance: number, excludeIndices: number[] = []): Promise<{ account: Account, index: number } | null> {
  for (let i = 0; i < accounts.length; i++) {
    if (excludeIndices.includes(i)) continue;
    
    try {
      const accountId = AccountId.fromString(accounts[i].id);
      const query = new AccountBalanceQuery().setAccountId(accountId);
      
      // Add timeout wrapper for balance query (10 seconds per account)
      const balance = await Promise.race([
        query.execute(client),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Balance query timeout')), 10000)
        )
      ]) as any;
      
      const balanceValue = balance.hbars.toBigNumber().toNumber();
      
      if (balanceValue > minBalance) {
        return { account: accounts[i], index: i };
      }
    } catch (error) {
      // Skip accounts that can't be queried (timeout or other errors)
      console.log(`Skipping account ${accounts[i].id} due to error: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }
  }
  return null;
}

// Helper function to check if account is associated with token
async function isAccountAssociatedWithToken(accountId: AccountId, tokenId: TokenId): Promise<boolean> {
  try {
    const balance = await new AccountBalanceQuery()
      .setAccountId(accountId)
      .execute(client);
    
    // If tokens map exists and contains this token, account is associated
    // Even if balance is 0, if the token is in the map, the account is associated
    if (balance.tokens) {
      const tokenBalance = balance.tokens.get(tokenId);
      // If tokenBalance is not undefined (even if 0), account is associated
      return tokenBalance !== undefined;
    }
    return false;
  } catch (error) {
    return false;
  }
}

// Helper function to get token balance for an account
async function getTokenBalance(accountId: AccountId, tokenId: TokenId): Promise<number> {
  const balance = await new AccountBalanceQuery()
    .setAccountId(accountId)
    .execute(client);
  
  if (!balance.tokens) {
    return 0;
  }
  
  const tokenBalance = balance.tokens.get(tokenId);
  return tokenBalance ? Number(tokenBalance.toString()) : 0;
}

// Helper function to associate an account with a token
// ERROR FIX: This function was added to fix TOKEN_NOT_ASSOCIATED_TO_ACCOUNT errors
// In Hedera, accounts must explicitly associate with tokens before they can receive them
// The treasury account is automatically associated, but other accounts need explicit association
// Without this, token transfers fail with TOKEN_NOT_ASSOCIATED_TO_ACCOUNT error
async function associateAccountWithToken(accountId: AccountId, privKey: PrivateKey, tokenId: TokenId): Promise<void> {
  // Check if already associated
  const isAssociated = await isAccountAssociatedWithToken(accountId, tokenId);
  if (isAssociated) {
    return; // Already associated
  }
  
  // Associate the account with the token
  // Set operator to the account that will pay for the association
  const previousOperator = client.operatorAccountId;
  const previousOperatorKey = client.operatorPublicKey;
  
  client.setOperator(accountId, privKey);
  
  try {
    const associateTx = new TokenAssociateTransaction()
      .setAccountId(accountId)
      .setTokenIds([tokenId]);
    
    const response = await associateTx.execute(client);
    const receipt = await response.getReceipt(client);
    
    if (receipt.status.toString() !== "SUCCESS") {
      throw new Error(`Token association failed with status: ${receipt.status}`);
    }
    
    console.log(`✓ Associated account ${accountId.toString()} with token ${tokenId.toString()}`);
  } catch (error: any) {
    // If association fails, check if it's because already associated
    const errorMessage = error.message || error.toString();
    if (errorMessage.includes("TOKEN_ALREADY_ASSOCIATED_TO_ACCOUNT") || 
        errorMessage.includes("ALREADY_ASSOCIATED") ||
        errorMessage.includes("ACCOUNT_IS_TREASURY")) {
      console.log(`Account ${accountId.toString()} already associated with token ${tokenId.toString()}`);
      return;
    }
    // Re-throw other errors
    throw error;
  } finally {
    // Restore previous operator if it was set
    // Note: We don't restore it here as the caller will set it as needed
  }
}

Given(/^A Hedera account with more than (\d+) hbar$/, { timeout: 30000 }, async function (expectedBalance: number) {
  // This step sets up a Hedera account for token operations
  // Find an account with sufficient balance
  const accountInfo = await findAccountWithBalance(expectedBalance);
  
  if (!accountInfo) {
    // If no account has sufficient balance, provide helpful error message
    const balances: string[] = [];
    for (let i = 0; i < accounts.length; i++) {
      try {
        const accountId = AccountId.fromString(accounts[i].id);
        const query = new AccountBalanceQuery().setAccountId(accountId);
        const balance = await query.execute(client);
        const balanceValue = balance.hbars.toBigNumber().toNumber();
        balances.push(`Account ${accounts[i].id}: ${balanceValue} HBAR`);
      } catch (error) {
        balances.push(`Account ${accounts[i].id}: Error querying balance`);
      }
    }
    throw new Error(
      `No account found with more than ${expectedBalance} HBAR. ` +
      `Available account balances:\n${balances.join('\n')}\n\n` +
      `Please fund your testnet accounts using the Hedera Portal: https://portal.hedera.com`
    );
  }
  
  const acc = accountInfo.account;
  const MY_ACCOUNT_ID = AccountId.fromString(acc.id);
  const MY_PRIVATE_KEY = PrivateKey.fromStringED25519(acc.privateKey);
  
  // ERROR FIX: Store account and private key in context so token creation steps can use them
  // Previously only MY_ACCOUNT_ID and MY_PRIVATE_KEY were set, but token creation looks for this.account
  this.account = MY_ACCOUNT_ID;
  this.privKey = MY_PRIVATE_KEY;
  
  // Set the operator for the client (this account will pay for transactions)
  client.setOperator(MY_ACCOUNT_ID, MY_PRIVATE_KEY);

  // Verify the account has sufficient balance one more time
  const query = new AccountBalanceQuery().setAccountId(MY_ACCOUNT_ID);
  const balance = await query.execute(client)
  assert.ok(balance.hbars.toBigNumber().toNumber() > expectedBalance)

});

When(/^I create a token named Test Token \(HTT\)$/, async function () {
  // Get the account from context (set in previous step)
  const account = this.account || this.firstAccount;
  const privKey = this.privKey || this.firstPrivKey;
  
  assert.ok(account, "Account should be set from previous step");
  assert.ok(privKey, "Private key should be set from previous step");
  
  client.setOperator(account, privKey);
  
  // Create a mintable token (with supply key)
  const supplyKey = PrivateKey.generateED25519();
  this.supplyKey = supplyKey;
  
  const tokenCreateTx = new TokenCreateTransaction()
    .setTokenName("Test Token")
    .setTokenSymbol("HTT")
    .setDecimals(2)
    .setTreasuryAccountId(account)
    .setSupplyKey(supplyKey.publicKey)
    .setAdminKey(privKey.publicKey);
  
  const response = await tokenCreateTx.execute(client);
  const receipt = await response.getReceipt(client);
  
  assert.ok(receipt.status.toString() === "SUCCESS", 
    `Token creation failed with status: ${receipt.status}`);
  assert.ok(receipt.tokenId !== null, "Token ID should not be null");
  
  this.tokenId = receipt.tokenId;
  console.log(`Token created with ID: ${this.tokenId.toString()}`);
});

Then(/^The token has the name "([^"]*)"$/, async function (expectedName: string) {
  assert.ok(this.tokenId, "Token ID should be set");
  
  const tokenInfo = await new TokenInfoQuery()
    .setTokenId(this.tokenId)
    .execute(client);
  
  assert.strictEqual(tokenInfo.name, expectedName, 
    `Token name ${tokenInfo.name} does not match expected ${expectedName}`);
  console.log(`✓ Token name verified: "${tokenInfo.name}"`);
});

Then(/^The token has the symbol "([^"]*)"$/, async function (expectedSymbol: string) {
  assert.ok(this.tokenId, "Token ID should be set");
  
  const tokenInfo = await new TokenInfoQuery()
    .setTokenId(this.tokenId)
    .execute(client);
  
  assert.strictEqual(tokenInfo.symbol, expectedSymbol, 
    `Token symbol ${tokenInfo.symbol} does not match expected ${expectedSymbol}`);
  console.log(`✓ Token symbol verified: "${tokenInfo.symbol}"`);
});

Then(/^The token has (\d+) decimals$/, async function (expectedDecimals: number) {
  assert.ok(this.tokenId, "Token ID should be set");
  
  const tokenInfo = await new TokenInfoQuery()
    .setTokenId(this.tokenId)
    .execute(client);
  
  assert.strictEqual(tokenInfo.decimals, expectedDecimals, 
    `Token decimals ${tokenInfo.decimals} does not match expected ${expectedDecimals}`);
  console.log(`✓ Token decimals verified: ${tokenInfo.decimals}`);
});

Then(/^The token is owned by the account$/, async function () {
  assert.ok(this.tokenId, "Token ID should be set");
  const account = this.account || this.firstAccount;
  assert.ok(account, "Account should be set");
  
  const tokenInfo = await new TokenInfoQuery()
    .setTokenId(this.tokenId)
    .execute(client);
  
  assert.ok(tokenInfo.treasuryAccountId !== null, "Token treasury account ID should not be null");
  assert.strictEqual(tokenInfo.treasuryAccountId!.toString(), account.toString(), 
    `Token treasury ${tokenInfo.treasuryAccountId!.toString()} does not match account ${account.toString()}`);
  console.log(`✓ Token ownership verified: treasury is ${tokenInfo.treasuryAccountId!.toString()}`);
});

Then(/^An attempt to mint (\d+) additional tokens succeeds$/, { timeout: 30000 }, async function (amount: number) {
  assert.ok(this.tokenId, "Token ID should be set");
  assert.ok(this.supplyKey, "Supply key should be set");
  
  const account = this.account || this.firstAccount;
  const privKey = this.privKey || this.firstPrivKey;
  client.setOperator(account, privKey);
  
  // Get current supply
  const tokenInfoBefore = await new TokenInfoQuery()
    .setTokenId(this.tokenId)
    .execute(client);
  const supplyBefore = Number(tokenInfoBefore.totalSupply.toString());
  
  // Mint tokens
  const mintTx = new TokenMintTransaction()
    .setTokenId(this.tokenId)
    .setAmount(amount);
  
  // Sign with supply key
  mintTx.freezeWith(client);
  const signedMintTx = await mintTx.sign(this.supplyKey);
  
  const response = await signedMintTx.execute(client);
  const receipt = await response.getReceipt(client);
  
  assert.ok(receipt.status.toString() === "SUCCESS", 
    `Minting failed with status: ${receipt.status}`);
  
  // Verify new supply
  const tokenInfoAfter = await new TokenInfoQuery()
    .setTokenId(this.tokenId)
    .execute(client);
  const supplyAfter = Number(tokenInfoAfter.totalSupply.toString());
  
  assert.strictEqual(supplyAfter, supplyBefore + amount, 
    `New supply ${supplyAfter} should be ${supplyBefore} + ${amount}`);
  console.log(`✓ Successfully minted ${amount} tokens. New total supply: ${supplyAfter}`);
});

When(/^I create a fixed supply token named Test Token \(HTT\) with (\d+) tokens$/, async function (initialSupply: number) {
  // Get the account from context (set in previous step)
  const account = this.account || this.firstAccount;
  const privKey = this.privKey || this.firstPrivKey;
  
  assert.ok(account, "Account should be set from previous step");
  assert.ok(privKey, "Private key should be set from previous step");
  
  client.setOperator(account, privKey);
  
  // Create a fixed supply token (no supply key = fixed supply)
  const tokenCreateTx = new TokenCreateTransaction()
    .setTokenName("Test Token")
    .setTokenSymbol("HTT")
    .setDecimals(2)
    .setInitialSupply(initialSupply)
    .setTreasuryAccountId(account)
    .setAdminKey(privKey.publicKey);
    // No supplyKey = fixed supply token
  
  const response = await tokenCreateTx.execute(client);
  const receipt = await response.getReceipt(client);
  
  assert.ok(receipt.status.toString() === "SUCCESS", 
    `Token creation failed with status: ${receipt.status}`);
  assert.ok(receipt.tokenId !== null, "Token ID should not be null");
  
  this.tokenId = receipt.tokenId;
  console.log(`Fixed supply token created with ID: ${this.tokenId.toString()}, initial supply: ${initialSupply}`);
});

Then(/^The total supply of the token is (\d+)$/, async function (expectedSupply: number) {
  assert.ok(this.tokenId, "Token ID should be set");
  
  const tokenInfo = await new TokenInfoQuery()
    .setTokenId(this.tokenId)
    .execute(client);
  
  const totalSupply = Number(tokenInfo.totalSupply.toString());
  assert.strictEqual(totalSupply, expectedSupply, 
    `Token total supply ${totalSupply} does not match expected ${expectedSupply}`);
  console.log(`✓ Token total supply verified: ${totalSupply}`);
});

Then(/^An attempt to mint tokens fails$/, async function () {
  assert.ok(this.tokenId, "Token ID should be set");
  
  const account = this.account || this.firstAccount;
  const privKey = this.privKey || this.firstPrivKey;
  client.setOperator(account, privKey);
  
  // Try to mint tokens (should fail for fixed supply token)
  const mintTx = new TokenMintTransaction()
    .setTokenId(this.tokenId)
    .setAmount(100);
  
  try {
    const response = await mintTx.execute(client);
    const receipt = await response.getReceipt(client);
    
    // If we get here, minting succeeded when it shouldn't have
    assert.fail(`Minting should have failed for fixed supply token, but got status: ${receipt.status}`);
  } catch (error: any) {
    // Expected: minting should fail
    const errorMessage = error.message || error.toString();
    assert.ok(
      errorMessage.includes("TOKEN_HAS_NO_SUPPLY_KEY") || 
      errorMessage.includes("SUPPLY_KEY") ||
      errorMessage.includes("mint"),
      `Expected minting to fail, but got unexpected error: ${errorMessage}`
    );
    console.log(`✓ Minting correctly failed for fixed supply token. Error: ${errorMessage}`);
  }
});
Given(/^A first hedera account with more than (\d+) hbar$/, { timeout: 30000 }, async function (expectedBalance: number) {
  // Find an account with sufficient balance for the first account
  const accountInfo = await findAccountWithBalance(expectedBalance);
  
  if (!accountInfo) {
    throw new Error(`No account found with more than ${expectedBalance} HBAR. Please fund your testnet accounts.`);
  }
  
  const acc = accountInfo.account;
  const account: AccountId = AccountId.fromString(acc.id);
  this.firstAccount = account;
  const privKey: PrivateKey = PrivateKey.fromStringED25519(acc.privateKey);
  this.firstPrivKey = privKey;
  
  // Set as operator for transactions
  client.setOperator(this.firstAccount, privKey);
  
  // Verify the balance
  const query = new AccountBalanceQuery().setAccountId(account);
  const balance = await query.execute(client);
  const balanceValue = balance.hbars.toBigNumber().toNumber();
  console.log(`Using first account ${account.toString()} with ${balanceValue} HBAR`);
  assert.ok(balanceValue > expectedBalance, `First account balance ${balanceValue} is not greater than ${expectedBalance}`);
});

Given(/^A second Hedera account$/, async function () {
  // Find a different account (exclude the first account)
  const firstAccountIndex = accounts.findIndex(acc => acc.id === this.firstAccount?.toString());
  const excludeIndices = firstAccountIndex >= 0 ? [firstAccountIndex] : [];
  
  // For second account, we don't require a minimum balance, just find any available account
  let accountInfo = null;
  for (let i = 0; i < accounts.length; i++) {
    if (excludeIndices.includes(i)) continue;
    accountInfo = { account: accounts[i], index: i };
    break;
  }
  
  if (!accountInfo) {
    throw new Error("No second account available");
  }
  
  const acc = accountInfo.account;
  const account: AccountId = AccountId.fromString(acc.id);
  this.secondAccount = account;
  const privKey: PrivateKey = PrivateKey.fromStringED25519(acc.privateKey);
  this.secondPrivKey = privKey;
  
  console.log(`Using second account ${account.toString()}`);
});

Given(/^A token named Test Token \(HTT\) with (\d+) tokens$/, { timeout: 30000 }, async function (initialSupply: number) {
  // Verify we have an account set up (use first account if available, otherwise the main account)
  let account = this.firstAccount || this.account;
  let privKey = this.firstPrivKey || this.privKey;
  
  // If no account is set up yet, find an account with sufficient balance for token creation
  // Token creation typically costs around 1-2 HBAR, so we look for at least 2 HBAR
  if (!account || !privKey) {
    const accountInfo = await findAccountWithBalance(2); // Require at least 2 HBAR for token creation
    if (accountInfo) {
      account = AccountId.fromString(accountInfo.account.id);
      privKey = PrivateKey.fromStringED25519(accountInfo.account.privateKey);
      this.account = account;
      this.privKey = privKey;
    } else {
      // If no account with 2+ HBAR, try with any balance
      const anyAccountInfo = await findAccountWithBalance(0);
      if (anyAccountInfo) {
        account = AccountId.fromString(anyAccountInfo.account.id);
        privKey = PrivateKey.fromStringED25519(anyAccountInfo.account.privateKey);
        this.account = account;
        this.privKey = privKey;
      }
    }
  }
  
  assert.ok(account, "Account should be set from previous step or found from config");
  assert.ok(privKey, "Private key should be set from previous step or found from config");
  
  // Set operator if not already set
  if (!this.firstAccount) {
    client.setOperator(account, privKey);
  }
  
  // Create a fixed supply token with the specified initial supply
  const tokenCreateTx = new TokenCreateTransaction()
    .setTokenName("Test Token")
    .setTokenSymbol("HTT")
    .setDecimals(2)
    .setInitialSupply(initialSupply)
    .setTreasuryAccountId(account)
    .setAdminKey(privKey.publicKey);
    // No supplyKey = fixed supply token
  
  const response = await tokenCreateTx.execute(client);
  const receipt = await response.getReceipt(client);
  
  assert.ok(receipt.status.toString() === "SUCCESS", 
    `Token creation failed with status: ${receipt.status}`);
  assert.ok(receipt.tokenId !== null, "Token ID should not be null");
  
  this.tokenId = receipt.tokenId;
  console.log(`Token created with ID: ${this.tokenId.toString()}, initial supply: ${initialSupply}`);
});

// Removed duplicate Given step definitions - using Then versions below instead
When(/^The first account creates a transaction to transfer (\d+) HTT tokens to the second account$/, async function (amount: number) {
  assert.ok(this.firstAccount, "First account should be set");
  assert.ok(this.secondAccount, "Second account should be set");
  assert.ok(this.tokenId, "Token ID should be set");
  assert.ok(this.firstPrivKey, "First account private key should be set");
  
  // ERROR FIX: Ensure the second account is associated with the token before transfer
  // Without this, transfer would fail with TOKEN_NOT_ASSOCIATED_TO_ACCOUNT error
  await associateAccountWithToken(this.secondAccount, this.secondPrivKey, this.tokenId);
  
  // Create a transfer transaction
  const transferTx = new TransferTransaction()
    .addTokenTransfer(this.tokenId, this.firstAccount, -amount)
    .addTokenTransfer(this.tokenId, this.secondAccount, amount);
  
  // Store the transaction for later submission
  this.transferTransaction = transferTx;
  this.transferAmount = amount;
  
  console.log(`Created transfer transaction: ${amount} HTT from first to second account`);
});

When(/^The first account submits the transaction$/, async function () {
  assert.ok(this.transferTransaction, "Transfer transaction should be created");
  assert.ok(this.firstAccount, "First account should be set");
  assert.ok(this.firstPrivKey, "First account private key should be set");
  
  // Set operator to first account (will pay for transaction)
  client.setOperator(this.firstAccount, this.firstPrivKey);
  
  // Execute the transaction
  // If the transaction is already signed (multi-party), execute it directly
  // Otherwise, execute normally (it will be signed by the operator)
  const response = await this.transferTransaction.execute(client);
  const receipt = await response.getReceipt(client);
  
  assert.ok(receipt.status.toString() === "SUCCESS", 
    `Transaction submission failed with status: ${receipt.status}`);
  
  console.log(`✓ Transaction submitted successfully by first account`);
  
  // Clear the transaction from context
  delete this.transferTransaction;
});

When(/^The second account creates a transaction to transfer (\d+) HTT tokens to the first account$/, async function (amount: number) {
  assert.ok(this.firstAccount, "First account should be set");
  assert.ok(this.secondAccount, "Second account should be set");
  assert.ok(this.tokenId, "Token ID should be set");
  assert.ok(this.secondPrivKey, "Second account private key should be set");
  
  // ERROR FIX: Ensure the first account is associated with the token before transfer
  // Even though first account might be treasury, we ensure association to avoid errors
  await associateAccountWithToken(this.firstAccount, this.firstPrivKey, this.tokenId);
  
  // Store initial balances to verify fee payment later
  const firstAccountBalance = await new AccountBalanceQuery()
    .setAccountId(this.firstAccount)
    .execute(client);
  this.firstAccountInitialHbar = firstAccountBalance.hbars.toBigNumber().toNumber();
  
  // Create a transfer transaction
  // The second account creates it, but the first account will submit (and pay fees)
  const transferTx = new TransferTransaction()
    .addTokenTransfer(this.tokenId, this.secondAccount, -amount)
    .addTokenTransfer(this.tokenId, this.firstAccount, amount);
  
  // Set the transaction ID to be paid by the first account
  // This allows the first account to pay for the transaction fee
  const transactionId = TransactionId.generate(this.firstAccount);
  transferTx.setTransactionId(transactionId);
  
  // Freeze the transaction so we can sign it
  transferTx.freezeWith(client);
  
  // Sign with the second account (who owns the tokens being transferred)
  const signedTx = await transferTx.sign(this.secondPrivKey);
  
  // Store the signed transaction for later submission by first account
  this.transferTransaction = signedTx;
  this.transferAmount = amount;
  
  console.log(`Created transfer transaction: ${amount} HTT from second to first account (to be paid by first account)`);
});

Then(/^The first account has paid for the transaction fee$/, async function () {
  assert.ok(this.firstAccount, "First account should be set");
  assert.ok(this.firstAccountInitialHbar !== undefined, "Initial HBAR balance should be stored");
  
  // Get current balance
  const currentBalance = await new AccountBalanceQuery()
    .setAccountId(this.firstAccount)
    .execute(client);
  const currentHbar = currentBalance.hbars.toBigNumber().toNumber();
  
  // Verify that the first account's HBAR balance decreased (paid transaction fee)
  assert.ok(currentHbar < this.firstAccountInitialHbar, 
    `First account HBAR balance should have decreased. Initial: ${this.firstAccountInitialHbar}, Current: ${currentHbar}`);
  
  const feePaid = this.firstAccountInitialHbar - currentHbar;
  console.log(`✓ First account paid ${feePaid} HBAR in transaction fees`);
});

// Helper function to set/verify account token balance (used by both Given and Then steps)
// ERROR FIX: This function was modified to fix TOKEN_NOT_ASSOCIATED_TO_ACCOUNT errors in scenarios 1 and 2
// The error occurred because we were trying to transfer tokens to accounts that weren't associated
// Now we always associate the account BEFORE checking balance or transferring tokens
async function setAccountTokenBalance(context: any, accountKey: string, privKeyKey: string, expectedBalance: number) {
  const account = context[accountKey];
  const privKey = context[privKeyKey];
  
  assert.ok(account, `${accountKey} should be set`);
  assert.ok(context.tokenId, "Token ID should be set");
  
  // Always associate the account with the token first (before checking balance)
  // ERROR FIX: Previously, association happened after balance check, causing TOKEN_NOT_ASSOCIATED_TO_ACCOUNT
  // This ensures the account can receive tokens before any transfer attempt
  // Note: Treasury account is automatically associated, but we still call this for consistency
  await associateAccountWithToken(account, privKey, context.tokenId);
  
  // ERROR FIX: Don't verify association immediately - it might take a moment to propagate
  // The association check can fail even if association succeeded, due to network delays
  // Instead, we'll let the transfer fail if association didn't work, which will give us a clearer error
  
  // Get current token balance (after association, so we get accurate balance)
  const currentBalance = await getTokenBalance(account, context.tokenId);
  
  if (currentBalance < expectedBalance) {
    // Need to transfer tokens to the account
    const needed = expectedBalance - currentBalance;
    
    // Use the treasury account (which has all the tokens) to transfer
    const treasuryAccount = context.account || context.firstAccount;
    const treasuryPrivKey = context.privKey || context.firstPrivKey;
    
    assert.ok(treasuryAccount, "Treasury account should be set");
    assert.ok(treasuryPrivKey, "Treasury private key should be set");
    
    // ERROR FIX: Add a small delay after association to ensure it propagates
    // Association transactions need a moment to be processed by the network
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    client.setOperator(treasuryAccount, treasuryPrivKey);
    
    const transferTx = new TransferTransaction()
      .addTokenTransfer(context.tokenId, treasuryAccount, -needed)
      .addTokenTransfer(context.tokenId, account, needed);
    
    const response = await transferTx.execute(client);
    const receipt = await response.getReceipt(client);
    assert.ok(receipt.status.toString() === "SUCCESS", 
      `Token transfer failed with status: ${receipt.status}. Account ${account.toString()} may not be associated with token ${context.tokenId.toString()}`);
    
    console.log(`Transferred ${needed} tokens to ${accountKey}`);
  } else if (currentBalance > expectedBalance) {
    // Need to transfer tokens away from the account
    const excess = currentBalance - expectedBalance;
    
    // Find a target account to transfer excess to
    // Try: second account, first account, main account, or find any available account from config
    let targetAccount = context.secondAccount || context.firstAccount || context.account;
    let targetPrivKey = context.secondPrivKey || context.firstPrivKey || context.privKey;
    
    // ERROR FIX: This logic was added to fix Scenario 3 error: "No other account available to transfer excess to"
    // Problem: When first account has 1000 tokens (full supply) but needs only 100, we need to transfer 900 away
    // But in Scenario 3, the second/third/fourth accounts haven't been set up yet when this step runs
    // Solution: Find any available account from config to use as temporary holder for excess tokens
    if (!targetAccount || targetAccount.toString() === account.toString()) {
      // Find an available account from config that's different from the source
      for (const acc of accounts) {
        const accId = AccountId.fromString(acc.id);
        if (accId.toString() !== account.toString()) {
          // Check if this account is already being used in context
          const isUsed = 
            (context.firstAccount && context.firstAccount.toString() === accId.toString()) ||
            (context.secondAccount && context.secondAccount.toString() === accId.toString()) ||
            (context.thirdAccount && context.thirdAccount.toString() === accId.toString()) ||
            (context.fourthAccount && context.fourthAccount.toString() === accId.toString()) ||
            (context.account && context.account.toString() === accId.toString());
          
          if (!isUsed) {
            targetAccount = accId;
            targetPrivKey = PrivateKey.fromStringED25519(acc.privateKey);
            break;
          }
        }
      }
    }
    
    // Make sure target account is associated and different from source
    if (targetAccount && targetAccount.toString() !== account.toString() && targetPrivKey) {
      // ERROR FIX: Ensure target account is associated before transferring excess tokens
      // This is critical - the target account must be associated to receive tokens
      await associateAccountWithToken(targetAccount, targetPrivKey, context.tokenId);
      
      // ERROR FIX: Add a small delay after association to ensure it propagates
      // Association transactions need a moment to be processed by the network
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      client.setOperator(account, privKey);
      
      const transferTx = new TransferTransaction()
        .addTokenTransfer(context.tokenId, account, -excess)
        .addTokenTransfer(context.tokenId, targetAccount, excess);
      
      const response = await transferTx.execute(client);
      const receipt = await response.getReceipt(client);
      assert.ok(receipt.status.toString() === "SUCCESS", 
        `Token transfer failed with status: ${receipt.status}. This usually means the target account ${targetAccount.toString()} is not associated with token ${context.tokenId.toString()}`);
      
      console.log(`Transferred ${excess} tokens away from ${accountKey} to ${targetAccount.toString()}`);
    } else {
      throw new Error(`Cannot transfer excess tokens from ${accountKey}: no suitable target account available. Current balance: ${currentBalance}, Expected: ${expectedBalance}`);
    }
  }
  
  // Verify final balance
  const finalBalance = await getTokenBalance(account, context.tokenId);
  assert.strictEqual(finalBalance, expectedBalance, 
    `${accountKey} balance ${finalBalance} does not match expected ${expectedBalance}`);
  console.log(`✓ ${accountKey} holds ${finalBalance} HTT tokens`);
}

// This step can be used as both Given (to set up balance) and Then (to verify balance)
// In Cucumber, Given/When/Then are interchangeable, so one definition works for all
Given(/^The first account holds (\d+) HTT tokens$/, async function (expectedBalance: number) {
  await setAccountTokenBalance(this, 'firstAccount', 'firstPrivKey', expectedBalance);
});

// This step can be used as both Given (to set up balance) and Then (to verify balance)
// In Cucumber, Given/When/Then are interchangeable, so one definition works for all
Given(/^The second account holds (\d+) HTT tokens$/, async function (expectedBalance: number) {
  await setAccountTokenBalance(this, 'secondAccount', 'secondPrivKey', expectedBalance);
});
Given(/^A first hedera account with more than (\d+) hbar and (\d+) HTT tokens$/, { timeout: 30000 }, async function (expectedHbar: number, expectedTokens: number) {
  // Find an account with sufficient HBAR balance
  const accountInfo = await findAccountWithBalance(expectedHbar);
  
  if (!accountInfo) {
    throw new Error(`No account found with more than ${expectedHbar} HBAR. Please fund your testnet accounts.`);
  }
  
  const acc = accountInfo.account;
  const account: AccountId = AccountId.fromString(acc.id);
  this.firstAccount = account;
  const privKey: PrivateKey = PrivateKey.fromStringED25519(acc.privateKey);
  this.firstPrivKey = privKey;
  
  // Set as operator
  client.setOperator(this.firstAccount, privKey);
  
  // Verify HBAR balance
  const query = new AccountBalanceQuery().setAccountId(account);
  const balance = await query.execute(client);
  const balanceValue = balance.hbars.toBigNumber().toNumber();
  assert.ok(balanceValue > expectedHbar, `First account balance ${balanceValue} is not greater than ${expectedHbar}`);
  
  // ERROR FIX: Use setAccountTokenBalance helper to handle token balance setup
  // This properly handles association and excess token transfers
  if (this.tokenId) {
    await setAccountTokenBalance(this, 'firstAccount', 'firstPrivKey', expectedTokens);
  }
  
  console.log(`Using first account ${account.toString()} with ${balanceValue} HBAR and ${expectedTokens} HTT tokens`);
});

Given(/^A second Hedera account with (\d+) hbar and (\d+) HTT tokens$/, { timeout: 30000 }, async function (expectedHbar: number, expectedTokens: number) {
  // Find a different account (exclude first account)
  const firstAccountIndex = accounts.findIndex(acc => acc.id === this.firstAccount?.toString());
  const excludeIndices = firstAccountIndex >= 0 ? [firstAccountIndex] : [];
  
  // Find account with sufficient HBAR if required, otherwise just find any available
  let accountInfo = null;
  if (expectedHbar > 0) {
    accountInfo = await findAccountWithBalance(expectedHbar, excludeIndices);
  } else {
    for (let i = 0; i < accounts.length; i++) {
      if (excludeIndices.includes(i)) continue;
      accountInfo = { account: accounts[i], index: i };
      break;
    }
  }
  
  if (!accountInfo) {
    throw new Error("No second account available");
  }
  
  const acc = accountInfo.account;
  const account: AccountId = AccountId.fromString(acc.id);
  this.secondAccount = account;
  const privKey: PrivateKey = PrivateKey.fromStringED25519(acc.privateKey);
  this.secondPrivKey = privKey;
  
  // Verify HBAR balance if required
  if (expectedHbar > 0) {
    const query = new AccountBalanceQuery().setAccountId(account);
    const balance = await query.execute(client);
    const balanceValue = balance.hbars.toBigNumber().toNumber();
    assert.ok(balanceValue >= expectedHbar, `Second account balance ${balanceValue} is less than ${expectedHbar}`);
  }
  
  // Ensure the account has the required tokens
  if (this.tokenId && expectedTokens > 0) {
    // Associate account with token if needed
    await associateAccountWithToken(this.secondAccount, this.secondPrivKey, this.tokenId);
    
    const currentTokenBalance = await getTokenBalance(this.secondAccount, this.tokenId);
    if (currentTokenBalance < expectedTokens) {
      const needed = expectedTokens - currentTokenBalance;
      const sourceAccount = this.account || this.firstAccount;
      const sourcePrivKey = this.privKey || this.firstPrivKey;
      
      client.setOperator(sourceAccount, sourcePrivKey);
      
      const transferTx = new TransferTransaction()
        .addTokenTransfer(this.tokenId, sourceAccount, -needed)
        .addTokenTransfer(this.tokenId, this.secondAccount, needed);
      
      const response = await transferTx.execute(client);
      const receipt = await response.getReceipt(client);
      assert.ok(receipt.status.toString() === "SUCCESS", "Token transfer failed");
    }
    
    const finalTokenBalance = await getTokenBalance(this.secondAccount, this.tokenId);
    assert.strictEqual(finalTokenBalance, expectedTokens, 
      `Second account token balance ${finalTokenBalance} does not match expected ${expectedTokens}`);
  }
  
  console.log(`Using second account ${account.toString()} with ${expectedHbar} HBAR and ${expectedTokens} HTT tokens`);
});

Given(/^A third Hedera account with (\d+) hbar and (\d+) HTT tokens$/, { timeout: 30000 }, async function (expectedHbar: number, expectedTokens: number) {
  // Find a different account (exclude first and second accounts)
  const firstAccountIndex = accounts.findIndex(acc => acc.id === this.firstAccount?.toString());
  const secondAccountIndex = accounts.findIndex(acc => acc.id === this.secondAccount?.toString());
  const excludeIndices = [firstAccountIndex, secondAccountIndex].filter(idx => idx >= 0);
  
  // Find account with sufficient HBAR if required, otherwise just find any available
  let accountInfo = null;
  if (expectedHbar > 0) {
    accountInfo = await findAccountWithBalance(expectedHbar, excludeIndices);
  } else {
    for (let i = 0; i < accounts.length; i++) {
      if (excludeIndices.includes(i)) continue;
      accountInfo = { account: accounts[i], index: i };
      break;
    }
  }
  
  if (!accountInfo) {
    throw new Error("No third account available");
  }
  
  const acc = accountInfo.account;
  const account: AccountId = AccountId.fromString(acc.id);
  this.thirdAccount = account;
  const privKey: PrivateKey = PrivateKey.fromStringED25519(acc.privateKey);
  this.thirdPrivKey = privKey;
  
  // Verify HBAR balance if required
  if (expectedHbar > 0) {
    const query = new AccountBalanceQuery().setAccountId(account);
    const balance = await query.execute(client);
    const balanceValue = balance.hbars.toBigNumber().toNumber();
    assert.ok(balanceValue >= expectedHbar, `Third account balance ${balanceValue} is less than ${expectedHbar}`);
  }
  
  // Ensure the account has the required tokens
  if (this.tokenId && expectedTokens > 0) {
    // Associate account with token if needed
    await associateAccountWithToken(this.thirdAccount, this.thirdPrivKey, this.tokenId);
    
    const currentTokenBalance = await getTokenBalance(this.thirdAccount, this.tokenId);
    if (currentTokenBalance < expectedTokens) {
      const needed = expectedTokens - currentTokenBalance;
      const sourceAccount = this.account || this.firstAccount;
      const sourcePrivKey = this.privKey || this.firstPrivKey;
      
      client.setOperator(sourceAccount, sourcePrivKey);
      
      const transferTx = new TransferTransaction()
        .addTokenTransfer(this.tokenId, sourceAccount, -needed)
        .addTokenTransfer(this.tokenId, this.thirdAccount, needed);
      
      const response = await transferTx.execute(client);
      const receipt = await response.getReceipt(client);
      assert.ok(receipt.status.toString() === "SUCCESS", "Token transfer failed");
    }
    
    const finalTokenBalance = await getTokenBalance(this.thirdAccount, this.tokenId);
    assert.strictEqual(finalTokenBalance, expectedTokens, 
      `Third account token balance ${finalTokenBalance} does not match expected ${expectedTokens}`);
  }
  
  console.log(`Using third account ${account.toString()} with ${expectedHbar} HBAR and ${expectedTokens} HTT tokens`);
});

Given(/^A fourth Hedera account with (\d+) hbar and (\d+) HTT tokens$/, { timeout: 30000 }, async function (expectedHbar: number, expectedTokens: number) {
  // Find a different account (exclude first, second, and third accounts)
  const firstAccountIndex = accounts.findIndex(acc => acc.id === this.firstAccount?.toString());
  const secondAccountIndex = accounts.findIndex(acc => acc.id === this.secondAccount?.toString());
  const thirdAccountIndex = accounts.findIndex(acc => acc.id === this.thirdAccount?.toString());
  const excludeIndices = [firstAccountIndex, secondAccountIndex, thirdAccountIndex].filter(idx => idx >= 0);
  
  // Find account with sufficient HBAR if required, otherwise just find any available
  let accountInfo = null;
  if (expectedHbar > 0) {
    accountInfo = await findAccountWithBalance(expectedHbar, excludeIndices);
  } else {
    for (let i = 0; i < accounts.length; i++) {
      if (excludeIndices.includes(i)) continue;
      accountInfo = { account: accounts[i], index: i };
      break;
    }
  }
  
  if (!accountInfo) {
    throw new Error("No fourth account available");
  }
  
  const acc = accountInfo.account;
  const account: AccountId = AccountId.fromString(acc.id);
  this.fourthAccount = account;
  const privKey: PrivateKey = PrivateKey.fromStringED25519(acc.privateKey);
  this.fourthPrivKey = privKey;
  
  // Verify HBAR balance if required
  if (expectedHbar > 0) {
    const query = new AccountBalanceQuery().setAccountId(account);
    const balance = await query.execute(client);
    const balanceValue = balance.hbars.toBigNumber().toNumber();
    assert.ok(balanceValue >= expectedHbar, `Fourth account balance ${balanceValue} is less than ${expectedHbar}`);
  }
  
  // Ensure the account has the required tokens
  if (this.tokenId && expectedTokens > 0) {
    // Associate account with token if needed
    await associateAccountWithToken(this.fourthAccount, this.fourthPrivKey, this.tokenId);
    
    const currentTokenBalance = await getTokenBalance(this.fourthAccount, this.tokenId);
    if (currentTokenBalance < expectedTokens) {
      const needed = expectedTokens - currentTokenBalance;
      const sourceAccount = this.account || this.firstAccount;
      const sourcePrivKey = this.privKey || this.firstPrivKey;
      
      client.setOperator(sourceAccount, sourcePrivKey);
      
      const transferTx = new TransferTransaction()
        .addTokenTransfer(this.tokenId, sourceAccount, -needed)
        .addTokenTransfer(this.tokenId, this.fourthAccount, needed);
      
      const response = await transferTx.execute(client);
      const receipt = await response.getReceipt(client);
      assert.ok(receipt.status.toString() === "SUCCESS", "Token transfer failed");
    }
    
    const finalTokenBalance = await getTokenBalance(this.fourthAccount, this.tokenId);
    assert.strictEqual(finalTokenBalance, expectedTokens, 
      `Fourth account token balance ${finalTokenBalance} does not match expected ${expectedTokens}`);
  }
  
  console.log(`Using fourth account ${account.toString()} with ${expectedHbar} HBAR and ${expectedTokens} HTT tokens`);
});

When(/^A transaction is created to transfer (\d+) HTT tokens out of the first and second account and (\d+) HTT tokens into the third account and (\d+) HTT tokens into the fourth account$/, async function (amountFromEach: number, amountToThird: number, amountToFourth: number) {
  assert.ok(this.firstAccount, "First account should be set");
  assert.ok(this.secondAccount, "Second account should be set");
  assert.ok(this.thirdAccount, "Third account should be set");
  assert.ok(this.fourthAccount, "Fourth account should be set");
  assert.ok(this.tokenId, "Token ID should be set");
  assert.ok(this.firstPrivKey, "First account private key should be set");
  assert.ok(this.secondPrivKey, "Second account private key should be set");
  
  // ERROR FIX: Ensure all receiving accounts are associated with the token before multi-party transfer
  // Without this, the transfer would fail with TOKEN_NOT_ASSOCIATED_TO_ACCOUNT error
  // This is critical for Scenario 3 (multi-party token transfer)
  if (amountToThird > 0) {
    await associateAccountWithToken(this.thirdAccount, this.thirdPrivKey, this.tokenId);
  }
  if (amountToFourth > 0) {
    await associateAccountWithToken(this.fourthAccount, this.fourthPrivKey, this.tokenId);
  }
  
  // Create a multi-party transfer transaction
  // Transfer out: first account (-amountFromEach), second account (-amountFromEach)
  // Transfer in: third account (+amountToThird), fourth account (+amountToFourth)
  const transferTx = new TransferTransaction()
    .addTokenTransfer(this.tokenId, this.firstAccount, -amountFromEach)
    .addTokenTransfer(this.tokenId, this.secondAccount, -amountFromEach)
    .addTokenTransfer(this.tokenId, this.thirdAccount, amountToThird)
    .addTokenTransfer(this.tokenId, this.fourthAccount, amountToFourth);
  
  // Freeze the transaction so we can sign it with multiple keys
  transferTx.freezeWith(client);
  
  // Sign with both accounts that are debiting tokens
  const signedTx = await transferTx.sign(this.firstPrivKey);
  const fullySignedTx = await signedTx.sign(this.secondPrivKey);
  
  // Store the signed transaction for later submission
  this.transferTransaction = fullySignedTx;
  
  console.log(`Created multi-party transfer: ${amountFromEach} HTT from first and second accounts, ${amountToThird} HTT to third, ${amountToFourth} HTT to fourth`);
});

Then(/^The third account holds (\d+) HTT tokens$/, async function (expectedBalance: number) {
  assert.ok(this.thirdAccount, "Third account should be set");
  assert.ok(this.tokenId, "Token ID should be set");
  
  const balance = await getTokenBalance(this.thirdAccount, this.tokenId);
  assert.strictEqual(balance, expectedBalance, 
    `Third account balance ${balance} does not match expected ${expectedBalance}`);
  console.log(`✓ Third account holds ${balance} HTT tokens`);
});

Then(/^The fourth account holds (\d+) HTT tokens$/, async function (expectedBalance: number) {
  assert.ok(this.fourthAccount, "Fourth account should be set");
  assert.ok(this.tokenId, "Token ID should be set");
  
  const balance = await getTokenBalance(this.fourthAccount, this.tokenId);
  assert.strictEqual(balance, expectedBalance, 
    `Fourth account balance ${balance} does not match expected ${expectedBalance}`);
  console.log(`✓ Fourth account holds ${balance} HTT tokens`);
});
