import { After, Given, Then, When } from "@cucumber/cucumber";
import {
  Client,
  AccountId,
  KeyList,
  Key,
  PrivateKey,
  TopicId,
  AccountBalanceQuery,
  TopicCreateTransaction,
  TopicMessageQuery,
  TopicMessageSubmitTransaction,
  AccountCreateTransaction,
  Hbar,
  AccountDeleteTransaction,
  TopicDeleteTransaction,
} from "@hashgraph/sdk";
import assert from "node:assert";
import { accounts, Account } from "../../src/config";

const client = Client.forTestnet();

let topicId: TopicId;
let thresholdKey: Key;
let firstAccount: Account;
let secondAccount: Account;

const accountWithHBar = async (client: Client, hbarAmount: number): Promise<Account> => {
  const freshPrivateKey = PrivateKey.generateED25519();
  const freshPublicKey = freshPrivateKey.publicKey;

  const createTx = new AccountCreateTransaction()
    .setKey(freshPublicKey)
    .setInitialBalance(new Hbar(hbarAmount));

  const txResponse = await createTx.execute(client);
  const receipt = await txResponse.getReceipt(client);
  const newAccountId = receipt.accountId;

  return {
    id: newAccountId!.toString(),
    privateKey: freshPrivateKey.toString(),
  };
};


const getHbarBalance = async (account: Account): Promise<number> => {
  const accountId = AccountId.fromString(account.id);
  const balanceQuery = new AccountBalanceQuery().setAccountId(accountId);
  const balanceResult = await balanceQuery.execute(client);
  return balanceResult.hbars.toBigNumber().toNumber();
};


const createTopic = async (memo: string, submitKey?: Key): Promise<TopicId> => {
  const topicTx = new TopicCreateTransaction()
    .setAdminKey(client.operatorPublicKey!) // operatorPublicKey set in "Given a first account..."
    .setTopicMemo(memo);

  if (submitKey) {
    topicTx.setSubmitKey(submitKey);
  }

  let frozenTx = await topicTx.freezeWith(client);

  if (submitKey instanceof PrivateKey) {
    frozenTx = await frozenTx.sign(submitKey);
  }

  const response = await frozenTx.execute(client);
  const receipt = await response.getReceipt(client);

  return receipt.topicId!;
};


const publishMessage = async (message: string, topicId: TopicId, submitKey?: PrivateKey) => {
  let submitTx = new TopicMessageSubmitTransaction()
    .setTopicId(topicId)
    .setMessage(message)
    .freezeWith(client);

  if (submitKey) {
    submitTx = await submitTx.sign(submitKey);
  }

  const response = await submitTx.execute(client);
  const receipt = await response.getReceipt(client);
  console.log("Message submit status:", receipt.status.toString());
};


const subscribeToTopic = (topicId: TopicId, expectedMessage: string) => {
  new TopicMessageQuery()
    .setTopicId(topicId)
    .setStartTime(0)
    .subscribe(client, null, (message) => {
      const decodedContent = Buffer.from(message.contents).toString();
      console.log("Received message:", decodedContent);
      assert.strictEqual(decodedContent, expectedMessage);
    });
};


Given(/^a first account with more than (\d+) hbars$/, async function (minimumBalance: number) {
  for (const configAccount of accounts) {
    const accountId = AccountId.fromString(configAccount.id);
    const privateKey = PrivateKey.fromStringED25519(configAccount.privateKey);

    const balance = await getHbarBalance(configAccount);
    if (balance > minimumBalance) {
      client.setOperator(accountId, privateKey);
      firstAccount = configAccount;
      assert.ok(balance > minimumBalance);
      return;
    }
  }
  assert.fail(`No configured account had more than ${minimumBalance} HBAR.`);
});

When(/^A topic is created with the memo "([^"]*)" with the first account as the submit key$/, async function (memo: string) {
  const firstPrivateKey = PrivateKey.fromStringED25519(firstAccount.privateKey);
  topicId = await createTopic(memo, firstPrivateKey);
  console.log("Topic created with ID:", topicId.toString());
});

When(/^The message "([^"]*)" is published to the topic$/, async function (message: string) {
  const firstPrivateKey = PrivateKey.fromStringED25519(firstAccount.privateKey);
  await publishMessage(message, topicId, firstPrivateKey);
});

Then(/^The message "([^"]*)" is received by the topic and can be printed to the console$/, function (expectedMessage: string) {
  subscribeToTopic(topicId, expectedMessage);
});

Given(/^A second account with more than (\d+) hbars$/, async function (hbarThreshold: number) {
  secondAccount = await accountWithHBar(client, hbarThreshold);
});

Given(/^A (\d+) of (\d+) threshold key with the first and second account$/, async function (requiredSigns: number, totalKeys: number) {
  const accountsInvolved = [firstAccount, secondAccount];
  const publicKeys = accountsInvolved.slice(0, totalKeys).map((acc) => {
    const privKey = PrivateKey.fromStringED25519(acc.privateKey);
    return privKey.publicKey;
  });

  thresholdKey = new KeyList(publicKeys, requiredSigns);
});

When(/^A topic is created with the memo "([^"]*)" with the threshold key as the submit key$/, async function (memo: string) {
  const secondPrivKey = PrivateKey.fromStringED25519(secondAccount.privateKey);
  const topicTx = new TopicCreateTransaction()
    .setAdminKey(client.operatorPublicKey!)
    .setSubmitKey(thresholdKey)
    .setTopicMemo(memo)
    .freezeWith(client);

  const signedTx = await topicTx.sign(secondPrivKey);
  const response = await signedTx.execute(client);
  const receipt = await response.getReceipt(client);

  topicId = receipt.topicId!;
  console.log("Topic created with threshold key, ID:", topicId.toString());
});
