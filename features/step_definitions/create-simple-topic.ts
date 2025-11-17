import { Given, Then, When } from "@cucumber/cucumber";
import {
  AccountBalanceQuery,
  AccountId,
  Client,
  KeyList,
  PrivateKey, RequestType,
  TopicCreateTransaction, TopicInfoQuery,
  TopicMessageQuery, TopicMessageSubmitTransaction
} from "@hashgraph/sdk";
import { accounts, Account } from "../../src/config";
import assert from "node:assert";
import ConsensusSubmitMessage = RequestType.ConsensusSubmitMessage;

// Pre-configured client for test network (testnet)
const client = Client.forTestnet()

// ERROR FIX: This file had merge conflict markers (<<<<<<<, =======, >>>>>>>) that caused linter errors
// The conflicts were between "Updated upstream" and "Stashed changes" versions
// Fixed by: Removing conflict markers and keeping the correct version with helper function
// Also added missing Account type import from config

// Helper function to find an account with sufficient balance
// ERROR FIX: This function was missing in one version, causing "Cannot find name 'findAccountWithBalance'" error
// Added timeout wrapper (10 seconds) to prevent indefinite hangs on slow network queries
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

//Set the operator with the account ID and private key

Given(/^a first account with more than (\d+) hbars$/, { timeout: 30000 }, async function (expectedBalance: number) {
  // Try to find an account with sufficient balance
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
  const account: AccountId = AccountId.fromString(acc.id);
  this.account = account
  const privKey: PrivateKey = PrivateKey.fromStringED25519(acc.privateKey);
  this.privKey = privKey
  client.setOperator(this.account, privKey);

//Create the query request
  const query = new AccountBalanceQuery().setAccountId(account);
  const balance = await query.execute(client)
  assert.ok(balance.hbars.toBigNumber().toNumber() > expectedBalance)
});

When(/^A topic is created with the memo "([^"]*)" with the first account as the submit key$/, { timeout: 30000 }, async function (memo: string) {
  assert.ok(this.account, "First account should be set");
  assert.ok(this.privKey, "First account private key should be set");
  
  client.setOperator(this.account, this.privKey);
  
  // Create a topic with the first account's public key as submit key
  const topicCreateTx = new TopicCreateTransaction()
    .setTopicMemo(memo)
    .setSubmitKey(this.privKey.publicKey);
  
  const response = await topicCreateTx.execute(client);
  const receipt = await response.getReceipt(client);
  
  assert.ok(receipt.status.toString() === "SUCCESS", 
    `Topic creation failed with status: ${receipt.status}`);
  assert.ok(receipt.topicId !== null, "Topic ID should not be null");
  
  this.topicId = receipt.topicId;
  console.log(`Topic created with ID: ${this.topicId.toString()}`);
});

When(/^The message "([^"]*)" is published to the topic$/, { timeout: 30000 }, async function (message: string) {
  assert.ok(this.topicId, "Topic ID should be set");
  
  // ERROR FIX: Wait for topic to be available before subscribing
  // Topics can take a moment to propagate after creation
  let topicAvailable = false;
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      await new TopicInfoQuery()
        .setTopicId(this.topicId)
        .execute(client);
      topicAvailable = true;
      break;
    } catch (error) {
      if (attempt < 9) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
  }
  
  if (!topicAvailable) {
    throw new Error(`Topic ${this.topicId.toString()} is not available after waiting`);
  }
  
  // ERROR FIX: Start subscription BEFORE publishing message to ensure we don't miss it
  // Store the subscription promise so the Then step can wait for it
  this.messageSubscriptionPromise = new Promise<string>((resolve, reject) => {
    const subscriptionTimeout = setTimeout(() => {
      reject(new Error("Message subscription timeout"));
    }, 30000); // 30 second timeout
    
    // Small delay to ensure subscription is ready
    setTimeout(() => {
      new TopicMessageQuery()
        .setTopicId(this.topicId)
        .subscribe(client, (error: any) => {
          clearTimeout(subscriptionTimeout);
          reject(error);
        }, (msg) => {
          clearTimeout(subscriptionTimeout);
          const receivedMsg = Buffer.from(msg.contents).toString();
          console.log(`Received message: ${receivedMsg}`);
          resolve(receivedMsg);
        });
    }, 100);
  });
  
  // Check if we're using threshold key (requires multiple signatures)
  if (this.thresholdKeyList && this.thresholdKeys) {
    // ERROR FIX: When using threshold key, we need to sign with the required number of keys
    // For 1 of 2 threshold, we need at least 1 signature
    const account = this.account || this.secondAccount;
    const privKey = this.privKey || this.secondPrivKey;
    
    client.setOperator(account, privKey);
    
    // Create and freeze the transaction
    const messageTx = new TopicMessageSubmitTransaction()
      .setTopicId(this.topicId)
      .setMessage(message);
    
    messageTx.freezeWith(client);
    
    // Sign with the required number of keys (at least threshold number)
    // ERROR FIX: KeyList doesn't have a threshold property directly accessible
    // Use the stored threshold value to determine how many signatures are needed
    let signedTx = messageTx;
    const requiredSignatures = this.threshold || 1; // Default to 1 if threshold not set
    // Sign with the required number of keys
    for (let i = 0; i < Math.min(requiredSignatures, this.thresholdKeys.length); i++) {
      signedTx = await signedTx.sign(this.thresholdKeys[i]);
    }
    
    const response = await signedTx.execute(client);
    const receipt = await response.getReceipt(client);
    
    assert.ok(receipt.status.toString() === "SUCCESS", 
      `Message publish failed with status: ${receipt.status}`);
    
    console.log(`Message published to topic ${this.topicId.toString()} using threshold key`);
  } else {
    // Regular single-key submission
    const account = this.account || this.firstAccount;
    const privKey = this.privKey || this.firstPrivKey;
    
    assert.ok(account, "Account should be set");
    assert.ok(privKey, "Private key should be set");
    
    client.setOperator(account, privKey);
    
    // Publish message to the topic
    const messageTx = new TopicMessageSubmitTransaction()
      .setTopicId(this.topicId)
      .setMessage(message);
    
    const response = await messageTx.execute(client);
    const receipt = await response.getReceipt(client);
    
    assert.ok(receipt.status.toString() === "SUCCESS", 
      `Message publish failed with status: ${receipt.status}`);
    
    console.log(`Message published to topic ${this.topicId.toString()}`);
  }
});

Then(/^The message "([^"]*)" is received by the topic and can be printed to the console$/, { timeout: 60000 }, async function (expectedMessage: string) {
  assert.ok(this.topicId, "Topic ID should be set");
  
  // ERROR FIX: Message subscription was timing out because we were subscribing AFTER the message was published
  // Solution: Start subscription in the "publish message" step BEFORE publishing, then wait for it here
  // The subscription promise is stored in this.messageSubscriptionPromise
  
  if (this.messageSubscriptionPromise) {
    // Wait for the message from the subscription that was started before publishing
    const receivedMessage = await this.messageSubscriptionPromise;
    assert.strictEqual(receivedMessage, expectedMessage, 
      `Received message "${receivedMessage}" does not match expected "${expectedMessage}"`);
  } else {
    // Fallback: If subscription wasn't started, try subscribing now (might miss the message)
    let messageReceived = false;
    let receivedMessage = "";
    
    try {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error("Message subscription timeout - subscription should have been started before message was published"));
        }, 10000);
        
        new TopicMessageQuery()
          .setTopicId(this.topicId)
          .subscribe(client, (error: any) => {
            clearTimeout(timeout);
            reject(error);
          }, (message) => {
            clearTimeout(timeout);
            receivedMessage = Buffer.from(message.contents).toString();
            messageReceived = true;
            console.log(`Received message: ${receivedMessage}`);
            resolve();
          });
      });
    } catch (error) {
      throw new Error(`Failed to receive message: ${error instanceof Error ? error.message : String(error)}. Make sure subscription starts before message is published.`);
    }
    
    assert.ok(messageReceived, "Message should be received from topic");
    assert.strictEqual(receivedMessage, expectedMessage, 
      `Received message "${receivedMessage}" does not match expected "${expectedMessage}"`);
  }
});

Given(/^A second account with more than (\d+) hbars$/, { timeout: 30000 }, async function (expectedBalance: number) {
  // Try to find a different account with sufficient balance (exclude the first account)
  const firstAccountIndex = accounts.findIndex(acc => acc.id === this.account?.toString());
  const excludeIndices = firstAccountIndex >= 0 ? [firstAccountIndex] : [];
  
  const accountInfo = await findAccountWithBalance(expectedBalance, excludeIndices);
  
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
      `No second account found with more than ${expectedBalance} HBAR. ` +
      `Available account balances:\n${balances.join('\n')}\n\n` +
      `Please fund your testnet accounts using the Hedera Portal: https://portal.hedera.com`
    );
  }
  
  const acc = accountInfo.account;
  const account: AccountId = AccountId.fromString(acc.id);
  this.secondAccount = account;
  const privKey: PrivateKey = PrivateKey.fromStringED25519(acc.privateKey);
  this.secondPrivKey = privKey;

});

Given(/^A (\d+) of (\d+) threshold key with the first and second account$/, { timeout: 30000 }, async function (threshold: number, totalKeys: number) {
  assert.ok(this.account, "First account should be set");
  assert.ok(this.privKey, "First account private key should be set");
  assert.ok(this.secondAccount, "Second account should be set");
  assert.ok(this.secondPrivKey, "Second account private key should be set");
  
  // ERROR FIX: This step definition was empty, causing "function has 0 arguments, should have 2" error
  // The regex captures threshold and totalKeys, so the function must accept these parameters
  // Create a KeyList with threshold requirement
  // A threshold key requires a minimum number of signatures from the key list
  // KeyList constructor takes an array of keys and threshold
  const keyList = new KeyList([this.privKey.publicKey, this.secondPrivKey.publicKey], threshold);
  
  // Store the key list, private keys, and threshold for later use
  this.thresholdKeyList = keyList;
  this.thresholdKeys = [this.privKey, this.secondPrivKey];
  this.threshold = threshold; // Store threshold value for use in message publishing
  
  console.log(`Created ${threshold} of ${totalKeys} threshold key with first and second account`);
});

When(/^A topic is created with the memo "([^"]*)" with the threshold key as the submit key$/, { timeout: 30000 }, async function (memo: string) {
  assert.ok(this.thresholdKeyList, "Threshold key list should be set");
  assert.ok(this.account, "First account should be set");
  assert.ok(this.privKey, "First account private key should be set");
  
  // ERROR FIX: This step definition was empty, causing "function has 0 arguments, should have 1" error
  // The regex captures memo, so the function must accept this parameter
  client.setOperator(this.account, this.privKey);
  
  // Create a topic with the threshold key as submit key
  const topicCreateTx = new TopicCreateTransaction()
    .setTopicMemo(memo)
    .setSubmitKey(this.thresholdKeyList);
  
  const response = await topicCreateTx.execute(client);
  const receipt = await response.getReceipt(client);
  
  assert.ok(receipt.status.toString() === "SUCCESS", 
    `Topic creation failed with status: ${receipt.status}`);
  assert.ok(receipt.topicId !== null, "Topic ID should not be null");
  
  this.topicId = receipt.topicId;
  console.log(`Topic created with ID: ${this.topicId.toString()} using threshold key`);
});
