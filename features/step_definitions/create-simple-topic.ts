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
import { accounts } from "../../src/config";
import assert from "node:assert";
import ConsensusSubmitMessage = RequestType.ConsensusSubmitMessage;

// Pre-configured client for test network (testnet)
const client = Client.forTestnet()

//Set the operator with the account ID and private key

Given(/^a first account with more than (\d+) hbars$/, async function (expectedBalance: number) {
  const acc = accounts[0]
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

When(
  /^A topic is created with the memo "([^"]*)" with the first account as the submit key$/,
  async function (memo: string) {
    const acc = accounts[0];
    const accPrivateKey = PrivateKey.fromStringED25519(acc.privateKey);
    const txCreateTopic = new TopicCreateTransaction()
      .setAdminKey(client.operatorPublicKey!)
      .setTopicMemo(memo)
      .setSubmitKey(accPrivateKey)
      .freezeWith(client);

    const txCreateTopicResponse = await txCreateTopic.execute(client);
    const receipt = await txCreateTopicResponse.getReceipt(client);
    this.topicId = receipt.topicId!;
    console.log("Created Topic ID:", this.topicId.toString());
  }
);

When(
  /^The message "([^"]*)" is published to the topic$/,
  async function (message: string) {
    const acc = accounts[0];
    const accPrivateKey = PrivateKey.fromStringED25519(acc.privateKey);

    let txTopicMessageSubmit = new TopicMessageSubmitTransaction()
      .setTopicId(this.topicId)
      .setMessage(message)
      .freezeWith(client);

    txTopicMessageSubmit = await txTopicMessageSubmit.sign(accPrivateKey);

    const txTopicMessageSubmitResponse = await txTopicMessageSubmit.execute(client);
    const receipt = await txTopicMessageSubmitResponse.getReceipt(client);
    console.log("Message status:", receipt.status.toString());
  }
);

Then(
  /^The message "([^"]*)" is received by the topic and can be printed to the console$/,
  async function (message: string) {
    new TopicMessageQuery()
      .setTopicId(this.topicId)
      .setStartTime(0)
      .subscribe(client, null, (message) => {
        const decodedMessage = Buffer.from(message.contents).toString();
        console.log("Received message by the topic:", decodedMessage);
        assert.strictEqual(decodedMessage, message);
      });
  }
);

Given(
  /^A second account with more than (\d+) hbars$/,
  async function (expectedBalance: number) {
    const acc2 = accounts[1];
    const account2: AccountId = AccountId.fromString(acc2.id);
    this.account2 = account2;
    const privKey2: PrivateKey = PrivateKey.fromStringED25519(acc2.privateKey);
    this.privKey2 = privKey2;
    client.setOperator(this.account2, privKey2);

    //Create the query request
    const query = new AccountBalanceQuery().setAccountId(account2);
    const balance = await query.execute(client);
    assert.ok(balance.hbars.toBigNumber().toNumber() > expectedBalance);
  }
);

Given(
  /^A (\d+) of (\d+) threshold key with the first and second account$/,
  async function (threshold: number, totalKeys: number) {
    const privKey1 = this.privKey;
    const privKey2 = this.privKey2;
    // Create a KeyList with threshold
    this.thresholdKey = new KeyList(
      [privKey1.publicKey, privKey2.publicKey],
      threshold // The minimum number of signatures required
    );

    console.log(`Created ${threshold}-of-${totalKeys} threshold key`);
  }
);

When(
  /^A topic is created with the memo "([^"]*)" with the threshold key as the submit key$/,
  async function (memo: string) {
    const txCreateTopic = new TopicCreateTransaction()
      .setAdminKey(client.operatorPublicKey!)
      .setSubmitKey(this.thresholdKey)
      .setTopicMemo(memo)
      .freezeWith(client);
    const txCreateTopicResponse = await txCreateTopic.execute(client);
    const receipt = await txCreateTopicResponse.getReceipt(client);
    this.topicId = receipt.topicId!;
    console.log(
      "Topic created with the threshold key as the submit key, ID:",
      this.topicId.toString()
    );
  }
);
