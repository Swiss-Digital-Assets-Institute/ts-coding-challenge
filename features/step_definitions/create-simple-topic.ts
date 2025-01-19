import { Given, Then, When } from "@cucumber/cucumber";
import {
  AccountBalanceQuery,
  AccountId,
  Client,
  PrivateKey, RequestType, 
  TopicCreateTransaction, TopicInfoQuery,
  TopicMessageQuery, TopicMessageSubmitTransaction
} from "@hashgraph/sdk";
import { accounts } from "../../src/config";
import assert from "node:assert";
import ConsensusSubmitMessage = RequestType.ConsensusSubmitMessage;

const { KeyList } = require("@hashgraph/sdk");

// Pre-configured client for test network (testnet)
const client = Client.forTestnet()
const secondclient = Client.forTestnet()


//Set the operator with the account ID and private key

Given(/^a first account with more than (\d+) hbars$/, async function (expectedBalance: number) {
  const acc = accounts[0]
  const account: AccountId = AccountId.fromString(acc.id);
  this.account = account
  const privKey: PrivateKey = PrivateKey.fromStringED25519(acc.privateKey);
  this.privKey = privKey
  client.setOperator(this.account, privKey);
  const query = new AccountBalanceQuery().setAccountId(account);
  const balance = await query.execute(client)
  assert.ok(balance.hbars.toBigNumber().toNumber() > expectedBalance)
});

When(/^A topic is created with the memo "([^"]*)" with the first account as the submit key$/, async function (memo: string) {
  const transaction_create_topic = new TopicCreateTransaction().setTopicMemo(memo).setSubmitKey(this.privKey);
  const response_transaction = await transaction_create_topic.execute(client);
  const receipt = await response_transaction.getReceipt(client);
  this.topicId = receipt.topicId; 
  const tr_status = receipt.status;
  console.log("The transaction consensus with the ID ( " + this.topicId + " ) status is " + tr_status );
  if (tr_status.toString() !== "SUCCESS") {
    throw new Error(`Failed to ctreate the Topic -_-`);
  }
});

When(/^The message "([^"]*)" is published to the topic$/, async function (message: string) {
  if (!this.topicId) {
    console.log("Topic doesn't exist -_- teh previous steps are not done correctly. Try Again !!!!")
    throw new Error("Topic ID not found");
  }
  const transaction_submit_message = new TopicMessageSubmitTransaction().setTopicId(this.topicId).setMessage(message);
  const response_transaction = await transaction_submit_message.execute(client);
  const receipt = await response_transaction.getReceipt(client);
  const tr_status = receipt.status;
  console.log("The transaction of publishing a message in the topic (" + this.topicId + ") status is " + tr_status);
  if (tr_status.toString() !== "SUCCESS") {
    throw new Error(`Failed to publish teh message -_-`);
  }
});

Then(/^The message "([^"]*)" is received by the topic and can be printed to the console$/, function (expectedMessage: string, done) {
  if (!this.topicId) {
    throw new Error("Topic ID not found. Previous steps may not have completed correctly.");
  }
  console.log(`Subscribing to messages on topic: ${this.topicId}`);
  const subscription = new TopicMessageQuery()
    .setTopicId(this.topicId)
    .subscribe(client, null, (message) => {
      const messageAsString = Buffer.from(message.contents).toString("utf8");
      if (messageAsString === expectedMessage) {
        console.log("Message received matches the expected message!");
        subscription.unsubscribe();
        done();
      }
    });
});

Given(/^A second account with more than (\d+) hbars$/, async function (expectedBalance: number) {
  const acc = accounts[1];
  const account: AccountId = AccountId.fromString(acc.id);
  this.secondAccount = account;
  const privKey: PrivateKey = PrivateKey.fromStringED25519(acc.privateKey);
  this.secondPrivKey = privKey;
  secondclient.setOperator(this.secondAccount, this.secondPrivKey);


  const query = new AccountBalanceQuery().setAccountId(account);
  const balance = await query.execute(secondclient);
  assert.ok(balance.hbars.toBigNumber().toNumber() > expectedBalance);
});

Given(/^A (\d+) of (\d+) threshold key with the first and second account$/, async function (threshold: number, totalKeys: number) {
  if (!this.privKey || !this.secondPrivKey) {
    throw new Error("Accounts or private keys not set up properly.");
  }
  const keys = [this.privKey.publicKey, this.secondPrivKey.publicKey];
  this.thresholdKey = new KeyList(keys, threshold);
});

When(/^A topic is created with the memo "([^"]*)" with the threshold key as the submit key$/, async function (memo) {
  if (!this.thresholdKey) {
    throw new Error("Threshold key not set up properly.");
  }
  const transaction_create_topic = new TopicCreateTransaction().setTopicMemo(memo).setSubmitKey(this.thresholdKey);
  const response_transaction = await transaction_create_topic.execute(secondclient);
  const receipt = await response_transaction.getReceipt(secondclient);
  this.topicId = receipt.topicId; 
  const tr_status = receipt.status;
  console.log("The transaction consensus with the ID ( " + this.topicId + " ) status is " + tr_status );
  if (tr_status.toString() !== "SUCCESS") {
    throw new Error(`Failed to ctreate the Topic -_-`);
  }
});
