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
import { KeyList } from "@hashgraph/sdk";

// Pre-configured client for test network (testnet)
const client = Client.forTestnet()

//Set the operator with the account ID and private key

Given(/^a first account with more than (\d+) hbars$/, async function (expectedBalance: number) {
  const acc = accounts[0]
  const account: AccountId = AccountId.fromString(acc.id);
  this.account = account
  const privKey: PrivateKey = PrivateKey.fromStringED25519(acc.privateKey);
  this.privKey = privKey
  const operatorKey = PrivateKey.fromStringECDSA(acc.privateKey)
  this.operatorKey = operatorKey;
  client.setOperator(this.account, privKey);

//Create the query request
  const query = new AccountBalanceQuery().setAccountId(account);
  const balance = await query.execute(client)
  assert.ok(balance.hbars.toBigNumber().toNumber() > expectedBalance)
});

When(/^A topic is created with the memo "([^"]*)" with the first account as the submit key$/, async function (memo: string) {
  // Create a new topic with the specified memo and submit key
  const transaction = new TopicCreateTransaction()
  .setTopicMemo(memo)
  .setSubmitKey(this.privKey.publicKey);

  // Submit the transaction and get the receipt
  const txResponse = await transaction.execute(client);
  const receipt = await txResponse.getReceipt(client);
  
  // Store the topic ID for later use
  this.topicId = receipt.topicId;
});

When(/^The message "([^"]*)" is published to the topic$/, async function (message: string) {
  // Create a new message submit transaction
  const transaction = new TopicMessageSubmitTransaction()
  .setTopicId(this.topicId)
  .setMessage(message)
  .freezeWith(client);

  // Sign with the submit key and execute
  const topicMsgSubmitTxSigned = (await transaction.sign(this.operatorKey));
  const topicMsgSubmitTxSubmitted = await topicMsgSubmitTxSigned.execute(client);
  await topicMsgSubmitTxSubmitted.getReceipt(client);
  
  // Store the message for verification
  this.sentMessage = message;
});

Then(/^The message "([^"]*)" is received by the topic and can be printed to the console$/,
  {timeout: 20000},
  async function (expectedMessage: string) {
    await new Promise<void>((resolve, reject) => {
      new TopicMessageQuery()
        .setTopicId(this.topicId)
        .setStartTime(0)
        .subscribe(
          client,
          (error) => {
            console.error("Error receiving message:", error);
            reject(error);
          },
          (message) => {
            const msgString = Buffer.from(message.contents).toString("utf8");

            if (msgString === expectedMessage) {
              resolve();
            }
          }
        );
    });
});

Given(/^A second account with more than (\d+) hbars$/, async function (expectedBalance: number) {
  const acc1 = accounts[1]
  const account1: AccountId = AccountId.fromString(acc1.id);
  this.account1 = account1
  const privKey1: PrivateKey = PrivateKey.fromStringED25519(acc1.privateKey);
  this.privKey1 = privKey1
  const operatorKey1 = PrivateKey.fromStringECDSA(acc1.privateKey)
  this.operatorKey1 = operatorKey1;
  client.setOperator(this.account1, privKey1);

//Create the query request
  const query = new AccountBalanceQuery().setAccountId(account1);
  const balance = await query.execute(client)
  assert.ok(balance.hbars.toBigNumber().toNumber() > expectedBalance)
});

Given(/^A (\d+) of (\d+) threshold key with the first and second account$/, async function (threshold: number, total: number) {
  const publicKeyList = [
    this.privKey.publicKey,
    this.privKey1.publicKey
  ];
  
  const thresholdKey = new KeyList(publicKeyList, threshold);
  this.thresholdKey = thresholdKey;
  assert.strictEqual(thresholdKey._threshold, threshold);
});

When(/^A topic is created with the memo "([^"]*)" with the threshold key as the submit key$/, async function (memo: string) {
  // Create a new topic with the specified memo and submit key
  const transaction = new TopicCreateTransaction()
  .setTopicMemo(memo)
  .setSubmitKey(this.thresholdKey);

  // Submit the transaction and get the receipt
  const txResponse1 = await transaction.execute(client);
  const receipt = await txResponse1.getReceipt(client);
  
  // Store the topic ID for later use
  this.topicId = receipt.topicId;
});
