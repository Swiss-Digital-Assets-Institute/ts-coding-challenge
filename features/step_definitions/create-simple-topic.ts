import { Given, Then, When } from "@cucumber/cucumber";
import {
  Client, AccountId, KeyList, Key,
  PrivateKey, RequestType, TopicId,
  AccountBalanceQuery, TopicCreateTransaction,
  TopicMessageQuery, TopicMessageSubmitTransaction,
} from "@hashgraph/sdk";
import { accounts, Account } from "../../src/config";
import assert from "node:assert";
import ConsensusSubmitMessage = RequestType.ConsensusSubmitMessage;

// Pre-configured client for test network (testnet)
const client = Client.forTestnet();

let topicId: TopicId;
let thresholdKey: Key;
let firstAccount: Account;
let secondAccount: Account;

Given(/^a first account with more than (\d+) hbars$/, async function (expectedBalance: number) {
  const acc = accounts[1]
  const account: AccountId = AccountId.fromString(acc.id);
  const privKey: PrivateKey = PrivateKey.fromStringED25519(acc.privateKey);
  client.setOperator(account, privKey);
  firstAccount = acc;

  // Create the query request
  const query = new AccountBalanceQuery().setAccountId(account);
  const balance = await query.execute(client);
  assert.ok(balance.hbars.toBigNumber().toNumber() > expectedBalance);
});

When(/^A topic is created with the memo "([^"]*)" with the first account as the submit key$/, async function (memo: string) {
  const privateKey = PrivateKey.fromStringED25519(firstAccount.privateKey);
  const transaction = new TopicCreateTransaction().setAdminKey(client.operatorPublicKey!).setSubmitKey(privateKey).setTopicMemo(memo);

  const txResponse = await transaction.execute(client);
  const receipt = await txResponse.getReceipt(client);
  topicId = receipt.topicId!;

  console.log("The topic ID is " + topicId);
});

When(/^The message "([^"]*)" is published to the topic$/, async function (message: string) {
  let transaction = await new TopicMessageSubmitTransaction()
    .setTopicId(topicId)
    .setMessage(message)
    .freezeWith(client);

  const privateKey = PrivateKey.fromStringED25519(firstAccount.privateKey);
  transaction = await transaction.sign(privateKey);

  const txResponse = await transaction.execute(client);
  const receipt = await txResponse.getReceipt(client);
  console.log("Transaction Status:", receipt.status);

});

Then(/^The message "([^"]*)" is received by the topic and can be printed to the console$/, async function (expectedMessage: string) {
  await new TopicMessageQuery()
    .setTopicId(topicId)
    .setStartTime(0)
    .subscribe(client, null, (message) => {
      const receivedMessage = Buffer.from(message.contents).toString();
      console.log("Received message: " + receivedMessage);
      assert.ok(receivedMessage === expectedMessage);
    });
});

Given(/^A second account with more than (\d+) hbars$/, async function (expectedBalance: number) {
  const acc = accounts[4]
  const account: AccountId = AccountId.fromString(acc.id);
  const privKey: PrivateKey = PrivateKey.fromStringED25519(acc.privateKey);
  client.setOperator(account, privKey);
  secondAccount = acc;

  // Create the query request
  const query = new AccountBalanceQuery().setAccountId(account);
  const balance = await query.execute(client);
  assert.ok(balance.hbars.toBigNumber().toNumber() > expectedBalance);

});

Given(/^A (\d+) of (\d+) threshold key with the first and second account$/, async function (requiredSigns: number, totalSigns: number) {
  const publicKeyList = [];
  const selectedAccounts = [firstAccount, secondAccount];
  for (let i = 0; i < totalSigns; i += 1) {
    const privateKey = PrivateKey.fromStringED25519(selectedAccounts[i].privateKey);
    const publicKey = privateKey.publicKey;
    publicKeyList.push(publicKey);
  }

  thresholdKey = new KeyList(publicKeyList, requiredSigns);
});

When(/^A topic is created with the memo "([^"]*)" with the threshold key as the submit key$/, async function (memo: string) {
  let transaction = new TopicCreateTransaction()
    .setAdminKey(client.operatorPublicKey!)
    .setSubmitKey(thresholdKey)
    .setTopicMemo(memo)
    .freezeWith(client);

  const privateKey = PrivateKey.fromStringED25519(secondAccount.privateKey);
  transaction = await transaction.sign(privateKey);

  const txResponse = await transaction.execute(client);
  const receipt = await txResponse.getReceipt(client);
  topicId = receipt.topicId!;

  console.log("The topic ID is " + topicId);
});
