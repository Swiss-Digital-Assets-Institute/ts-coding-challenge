import assert from "node:assert";
import { accounts, Account } from "../../src/config";
import { After, Given, Then, When } from "@cucumber/cucumber";
import {
  Client, AccountId, KeyList, Key, PrivateKey, TopicId,
  AccountBalanceQuery, TopicCreateTransaction,
  TopicMessageQuery, TopicMessageSubmitTransaction,
  AccountCreateTransaction,
  Hbar,
  AccountDeleteTransaction,
  TopicDeleteTransaction,
} from "@hashgraph/sdk";

// Pre-configured client for test network (testnet)
const client = Client.forTestnet();

let topicId: TopicId;
let thresholdKey: Key;
let firstAccount: Account;
let secondAccount: Account;

// pruvate methods
const createAccountWithHBar = async (client: Client, hbarAmount: number): Promise<Account> => {
  const newPrivateKey = PrivateKey.generateED25519();
  const newPublicKey = newPrivateKey.publicKey;

  // Create a new account with 10 HBAR
  const transaction = new AccountCreateTransaction()
    .setKey(newPublicKey)
    .setInitialBalance(new Hbar(hbarAmount));

  // Submit the transaction and get the receipt
  const txResponse = await transaction.execute(client);
  const receipt = await txResponse.getReceipt(client);
  const newAccountId = receipt.accountId;

  return {
    id: newAccountId!.toString(),
    privateKey: newPrivateKey.toString()
  };
}

Given(/^a first account with more than (\d+) hbars$/, async function (expectedBalance: number) {
  for (let i = 0; i < accounts.length; i++) {
    const acc = accounts[i]
    const account: AccountId = AccountId.fromString(acc.id);
    const privKey: PrivateKey = PrivateKey.fromStringED25519(acc.privateKey);
    // Create the query request
    const query = new AccountBalanceQuery().setAccountId(account);
    const balance = await query.execute(client);

    if (balance.hbars.toBigNumber().toNumber() > expectedBalance) {
      client.setOperator(account, privKey);
      firstAccount = acc;
      assert.ok(balance.hbars.toBigNumber().toNumber() > expectedBalance);
      return;
    }
  }
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
  let transaction = new TopicMessageSubmitTransaction()
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
  new TopicMessageQuery()
    .setTopicId(topicId)
    .setStartTime(0)
    .subscribe(client, null, (message) => {
      const receivedMessage = Buffer.from(message.contents).toString();
      console.log("Received message: " + receivedMessage);
      assert.ok(receivedMessage === expectedMessage);
    });
});

Given(/^A second account with more than (\d+) hbars$/, async function (expectedBalance: number) {
  secondAccount = await createAccountWithHBar(client, expectedBalance);
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