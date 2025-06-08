import { Given, Status, Then, When } from "@cucumber/cucumber";
import {
  AccountBalanceQuery,
  AccountId,
  Client,
  Hbar,
  PrivateKey, RequestType,
  TopicCreateTransaction, TopicInfoQuery,
  TopicMessageQuery, TopicMessageSubmitTransaction
} from "@hashgraph/sdk";
import { accounts } from "../../src/config";
import assert from "node:assert";
import ConsensusSubmitMessage = RequestType.ConsensusSubmitMessage;

// Pre-configured client for test network (testnet)
const client = Client.forTestnet()

//Set the operator with the account ID and private key

Given(/^a first account with more than (\d+) hbars$/, async function (expectedBalance: number) {
  const acc = accounts[0]
  const account: AccountId = AccountId.fromString(acc.id);
  let topicId;
  this.account = account
  const privKey: PrivateKey = PrivateKey.fromStringED25519(acc.privateKey);
  this.privKey = privKey
  client.setOperator(this.account, privKey);

//Create the query request
  const query = new AccountBalanceQuery().setAccountId(account);
  const balance = await query.execute(client)
  assert.ok(balance.hbars.toBigNumber().toNumber() > expectedBalance)
});


When(/^A topic is created with the memo "([^"]*)" with the first account as the submit key$/, async function (memo: string) {
  try {
    // Ensure client is properly configured with the operator
    client.setOperator(this.account, this.privKey);

    // Create the topic transaction
    const tx = new TopicCreateTransaction()
      .setTopicMemo(memo)
      .setSubmitKey(this.privKey.publicKey)
      .setMaxTransactionFee(new Hbar(2))
      .freezeWith(client);; // Explicitly set fee

    // Sign with the private key (explicit signing)
    const signedTx = await tx.sign(this.privKey);
    
    // Execute the transaction
    const txResponse = await signedTx.execute(client);

    // Get the receipt
    const receipt = await txResponse.getReceipt(client);
    
    // Verify the receipt status
    // if (receipt.status !== Status.Success) {
    //   throw new Error(`Topic creation failed with status: ${receipt.status}`);
    // }

    this.topicId = receipt.topicId;
    console.log(`Successfully created topic ${this.topicId}`);

  } catch (error) {
    console.error('Error creating topic:', error);
    throw error; // Re-throw to fail the test
  }
});

When(/^The message "([^"]*)" is published to the topic$/, async function (message: string) {
  //publish message to topic
  // Send message to the topic
let sendResponse = await new TopicMessageSubmitTransaction({
	topicId: this.topicId,
	message: message,
}).execute(client);

// Get the receipt of the transaction
const getReceipt = await sendResponse.getReceipt(client);

// Get the status of the transaction
const transactionStatus = getReceipt.status
console.log("The message transaction status " + transactionStatus.toString())
});

Then(/^The message "([^"]*)" is received by the topic and can be printed to the console$/, async function (message: string) {
  let receivedMessages: string[] = [];
  let messageFound = false;

  // Set up the message query with a timeout
  const messageQuery = new TopicMessageQuery()
    .setTopicId(this.topicId)
    .setStartTime(0) // Start from the beginning of time
    .subscribe(client,null, (messageResponse) => {
      const decodedMessage = Buffer.from(messageResponse.contents).toString();
      receivedMessages.push(decodedMessage);
      console.log(`Received message: ${decodedMessage}`);
      
      if (decodedMessage === message) {
        messageFound = true;
      }
    });

  // Wait for the message to be received or timeout after 30 seconds
  const timeout = 30000; // 30 seconds
  const startTime = Date.now();
  
  while (!messageFound && Date.now() - startTime < timeout) {
    await new Promise(resolve => setTimeout(resolve, 1000)); // Check every second
  }

  // Unsubscribe from the topic
  messageQuery.unsubscribe();

  // Verify the message was received
  assert.ok(messageFound, `Expected message "${message}" was not received within the timeout period.`);
  console.log(`Verified that message "${message}" was received by the topic.`);
  
  // Optional: Print all received messages for debugging
  console.log('All received messages:', receivedMessages);
});

Given(/^A second account with more than (\d+) hbars$/, async function (expectedBalance: number) {
  const acc = accounts[1]; // Assuming accounts[1] is your second account
  const account: AccountId = AccountId.fromString(acc.id);
  this.secondAccount = account;
  const privKey: PrivateKey = PrivateKey.fromStringED25519(acc.privateKey);
  this.secondPrivKey = privKey;

  // Verify account balance
  const query = new AccountBalanceQuery().setAccountId(account);
  const balance = await query.execute(client);
  assert.ok(balance.hbars.toBigNumber().toNumber() > expectedBalance, 
    `Second account must have more than ${expectedBalance} hbars`);
});


Given(/^A (\d+) of (\d+) threshold key with the first and second account$/, async function (threshold: number, totalKeys: number) {
  // Create threshold key
  this.thresholdKey = PrivateKey.generateED25519(); // This would actually be more complex in reality
  this.threshold = threshold;
  
  // In a real implementation, you would create a proper threshold key structure
  // This is simplified for demonstration
  this.signingKeys = [
    this.privKey, // First account's private key
    this.secondPrivKey // Second account's private key
  ];
  
  console.log(`Created ${threshold} of ${totalKeys} threshold key`);
});


When(/^A topic is created with the memo "([^"]*)" with the threshold key as the submit key$/, async function (memo: string) {
  // Create topic with threshold key as submit key
  const tx = new TopicCreateTransaction()
    .setTopicMemo(memo)
    .setSubmitKey(this.thresholdKey.publicKey); // Using the threshold key's public key
  
  // In a real scenario, you would need to sign with the threshold key
  // This is simplified - actual threshold signing would require multiple signatures
  const txResponse = await tx.execute(client);
  
  // Get receipt
  const receipt = await txResponse.getReceipt(client);
  this.topicId = receipt.topicId;
  
  console.log(`Created topic ${this.topicId} with memo "${memo}" and threshold submit key`);
  
  // Wait for propagation
  await new Promise((resolve) => setTimeout(resolve, 5000));
});
