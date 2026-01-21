import { Given, Then, When } from "@cucumber/cucumber";
import {
  AccountBalanceQuery,
  AccountId,
  Client,
  KeyList,
  PrivateKey,
  RequestType,
  TopicCreateTransaction,
  TopicInfoQuery,
  TopicMessageQuery,
  TopicMessageSubmitTransaction
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

  const query = new AccountBalanceQuery().setAccountId(account);
  const balance = await query.execute(client)
  const hbarBalance = balance.hbars.toBigNumber().toNumber();
  console.log(`Account ${account} has ${hbarBalance} hbars`);
  assert.ok(hbarBalance > expectedBalance, `Expected balance > ${expectedBalance}, but got ${hbarBalance}`);
});

When(/^A topic is created with the memo "([^"]*)" with the first account as the submit key$/, async function (memo: string) {
  const transaction = new TopicCreateTransaction()
    .setTopicMemo(memo)
    .setSubmitKey(this.privKey.publicKey);
  
  const receipt = await (await transaction.execute(client)).getReceipt(client);
  this.topicId = receipt.topicId;
});

When(/^The message "([^"]*)" is published to the topic$/, async function (message: string) {
  this.publishedMessage = message;
  const transaction = new TopicMessageSubmitTransaction()
    .setTopicId(this.topicId)
    .setMessage(message);
  
  await (await transaction.execute(client)).getReceipt(client);
});

Then(/^The message "([^"]*)" is received by the topic and can be printed to the console$/, async function (message: string) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Timeout waiting for message'));
    }, 30000);

    new TopicMessageQuery()
      .setTopicId(this.topicId)
      .setStartTime(0)
      .subscribe(
        client,
        (receivedMessage) => {
          if (receivedMessage) {
            const contents = Buffer.from(receivedMessage.contents).toString();
            console.log(`Received message: ${contents}`);
            
            if (contents === message) {
              clearTimeout(timeout);
              assert.strictEqual(contents, message);
              resolve(undefined);
            }
          }
        },
        (error) => {
          clearTimeout(timeout);
          reject(error);
        }
      );
  });
});

Given(/^A second account with more than (\d+) hbars$/, async function (expectedBalance: number) {
  const acc = accounts[1];
  const account: AccountId = AccountId.fromString(acc.id);
  this.account2 = account;
  const privKey: PrivateKey = PrivateKey.fromStringED25519(acc.privateKey);
  this.privKey2 = privKey;

  const query = new AccountBalanceQuery().setAccountId(account);
  const balance = await query.execute(client);
  const hbarBalance = balance.hbars.toBigNumber().toNumber();
  console.log(`Account ${account} has ${hbarBalance} hbars`);
  assert.ok(hbarBalance > expectedBalance, `Expected balance > ${expectedBalance}, but got ${hbarBalance}`);
});

Given(/^A (\d+) of (\d+) threshold key with the first and second account$/, async function (threshold: number, total: number) {
  this.thresholdKey = new KeyList(
    [this.privKey.publicKey, this.privKey2.publicKey],
    threshold
  );
});

When(/^A topic is created with the memo "([^"]*)" with the threshold key as the submit key$/, async function (memo: string) {
  const transaction = new TopicCreateTransaction()
    .setTopicMemo(memo)
    .setSubmitKey(this.thresholdKey);
  
  const receipt = await (await transaction.execute(client)).getReceipt(client);
  this.topicId = receipt.topicId;
});
