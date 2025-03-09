import { Given, Then, When } from "@cucumber/cucumber";
import { AccountId, Client, KeyList, PrivateKey, TopicCreateTransaction, TopicMessageQuery, TopicMessageSubmitTransaction } from "@hashgraph/sdk";
import { accounts } from "../../src/config";
import assert from "node:assert";

// Pre-configured client for test network (testnet)
const client = Client.forTestnet();

// Set up the first account
Given(/^a first account with more than (\d+) hbars$/, async function (expectedBalance: number) {
  const acc = accounts[0];
  const account: AccountId = AccountId.fromString(acc.id);
  this.account = account;
  const privKey: PrivateKey = PrivateKey.fromStringED25519(acc.privateKey);
  this.privKey = privKey;
  client.setOperator(this.account, privKey);
});

// Create a topic with the first account as the submit key
When(/^A topic is created with the memo "([^"]*)" with the first account as the submit key$/, async function (memo: string) {
  const transaction = new TopicCreateTransaction().setTopicMemo(memo).setSubmitKey(this.privKey);

  const response = await transaction.execute(client);
  const receipt = await response.getReceipt(client);
  this.topicId = receipt.topicId;

  console.log(`Created topic with ID: ${this.topicId}`);
  assert.ok(this.topicId);
});

// Publish a message to the topic
When(/^The message "([^"]*)" is published to the topic$/, async function (message: string) {
  assert.ok(this.topicId, "Topic ID is missing. Ensure the topic is created first.");

  // Create and execute the transaction to submit the message
  const submitTx = new TopicMessageSubmitTransaction()
    .setTopicId(this.topicId)
    .setMessage(message)
    .freezeWith(client)
    .sign(this.privKey);

  const response = await (await submitTx).execute(client);

  const receipt = await response.getReceipt(client);

  console.log(`Message published: "${message}" with status: ${receipt.status}`);

  assert.strictEqual(receipt.status.toString(), "SUCCESS", "Message submission failed");
});

Then(
  /^The message "([^"]*)" is received by the topic and can be printed to the console$/,
  { timeout: 60000 },
  async function (message: string) {
    assert.ok(this.topicId, "Topic ID is missing. Ensure the topic is created first.");
    console.log(`Subscribing to topic ID: ${this.topicId} before sending message`);

    let received = false;

    return new Promise<void>((resolve, reject) => {
      const subscription = new TopicMessageQuery()
        .setTopicId(this.topicId)
        .subscribe(
          client,
          (error) => {
            console.error("Error while receiving message:", error);
            reject(error);
          },
          (receivedMessage) => {
            if (!receivedMessage) {
              reject(new Error("Received null message"));
              return;
            }

            const msg = Buffer.from(receivedMessage.contents).toString();
            console.log(`Received message: "${msg}"`);

            try {
              assert.strictEqual(msg, message, `Expected message "${message}", but received "${msg}"`);
              received = true;
              subscription.unsubscribe();
              resolve();
            } catch (error) {
              reject(error);
            }
          }
        );

      setTimeout(async () => {
        try {
          console.log("Submitting message...");
          const submitTx = new TopicMessageSubmitTransaction()
            .setTopicId(this.topicId)
            .setMessage(message)
            .freezeWith(client)
            .sign(this.privKey);

          const response = await (await submitTx).execute(client);
          const receipt = await response.getReceipt(client);

          console.log(`Message published: "${message}" with status: ${receipt.status}`);

          if (receipt.status.toString() !== "SUCCESS") {
            reject(new Error("Message submission failed"));
          }
        } catch (err) {
          reject(err);
        }
      }, 3000);

      setTimeout(() => {
        if (!received) {
          subscription.unsubscribe();
          reject(new Error("Timed out waiting for message"));
        }
      }, 50000);
    });
  }
);


// Set up the second account
Given(/^A second account with more than (\d+) hbars$/, async function (expectedBalance: number) {
  const acc = accounts[1];
  this.account2 = AccountId.fromString(acc.id);
  this.privKey2 = PrivateKey.fromStringED25519(acc.privateKey);
  client.setOperator(this.account2, this.privKey2);
});

// Create a threshold key
Given(/^A 1 of 2 threshold key with the first and second account$/, function () {
  this.thresholdKey = new KeyList([this.privKey.publicKey, this.privKey2.publicKey], 1);
});

// Create a topic with the threshold key as the submit key
When(/^A topic is created with the memo "([^"]*)" with the threshold key as the submit key$/, async function (memo: string) {
  const transaction = new TopicCreateTransaction()
    .setTopicMemo(memo)
    .setSubmitKey(this.thresholdKey);

  const response = await transaction.execute(client);
  const receipt = await response.getReceipt(client);
  this.topicId = receipt.topicId;

  console.log(`Created topic with ID: ${this.topicId}`);
  assert.ok(this.topicId);
});

// Verify message reception
Then(
  /^The message "([^"]*)" is received by the topic with a threshold key and can be printed to the console$/,
  { timeout: 60000 }, 
  async function (message: string) {
    assert.ok(this.topicId, "Topic ID is missing. Ensure the topic is created first.");
    console.log(`Subscribing to topic ID: ${this.topicId} before sending message`);

    let received = false;

    return new Promise<void>((resolve, reject) => {
      const subscription = new TopicMessageQuery()
        .setTopicId(this.topicId)
        .subscribe(
          client,
          (error) => {
            console.error("Error while receiving message:", error);
            reject(error);
          },
          (receivedMessage) => {
            if (!receivedMessage) {
              reject(new Error("Received null message"));
              return;
            }

            const msg = Buffer.from(receivedMessage.contents).toString();
            console.log(`Received message: "${msg}"`);

            try {
              assert.strictEqual(msg, message, `Expected message "${message}", but received "${msg}"`);
              received = true;
              subscription.unsubscribe();
              resolve();
            } catch (error) {
              reject(error);
            }
          }
        );

      setTimeout(async () => {
        try {
          console.log("Submitting message...");
          const submitTx = new TopicMessageSubmitTransaction()
            .setTopicId(this.topicId)
            .setMessage(message)
            .freezeWith(client)
            .sign(this.privKey);

          const response = await (await submitTx).execute(client);
          const receipt = await response.getReceipt(client);

          console.log(`Message published: "${message}" with status: ${receipt.status}`);

          if (receipt.status.toString() !== "SUCCESS") {
            reject(new Error("Message submission failed"));
          }
        } catch (err) {
          reject(err);
        }
      }, 3000);

      setTimeout(() => {
        if (!received) {
          subscription.unsubscribe();
          reject(new Error("Timed out waiting for message"));
        }
      }, 50000);
    });
  }
);
