import { Given, Then, When } from "@cucumber/cucumber";
import { Client, KeyList, TopicId } from "@hashgraph/sdk";
import assert from "node:assert";
import { accounts } from "../../src/config";
import { AccountService } from "../../src/hedera/account-service";
import { MessageService } from "../../src/hedera/message-service";

// Setup test client and services
const client = Client.forTestnet()
const accountService = new AccountService(client)
const messageService = new MessageService(client)

// Import test accounts
const operatorAccount = accounts[0]
const accountOne = accounts[1]
const accountTwo = accounts[2]

// Set the operator for the client
accountService.setOperator(operatorAccount)

// Variables used across steps
let topicId: TopicId
let thresholdKey: KeyList

Given(/^a first account with more than (\d+) hbars$/, async function (expectedBalance: number) {
  const hbarBalance = await accountService.getHbarBalance(accountOne.id)
  assert.ok(hbarBalance > expectedBalance)
});

When(/^A topic is created with the memo "([^"]*)" with the first account as the submit key$/, async function (memo: string) {
  const receipt = await messageService.createTopic(memo, accountOne.privateKey)
  assert.ok(receipt.topicId != null)
  topicId = receipt.topicId
});

When(/^The message "([^"]*)" is published to the topic$/, async function (message: string) {
  const receipt = await messageService.publishMessage(topicId, message, accountOne.privateKey)
  assert.ok(receipt.status.toString() === 'SUCCESS')
});

Then(/^The message "([^"]*)" is received by the topic and can be printed to the console$/, async function (expectedMessage: string) {
  await new Promise<void>(function (resolve) {
    messageService.subscribeToTopic(topicId, 0, function (message) {
      assert.ok(expectedMessage === message)
      resolve()
    })
  })
});

Given(/^A second account with more than (\d+) hbars$/, async function (expectedBalance: number) {
  const hbarBalance = await accountService.getHbarBalance(accountTwo.id)
  assert.ok(hbarBalance > expectedBalance)
});

/**
 * Creates a threshold key using the first and second account public keys.
 */
Given(/^A (\d+) of (\d+) threshold key with the first and second account$/, async function (threshold: number, _) {
  thresholdKey = new KeyList([
    accountOne.privateKey.publicKey,
    accountTwo.privateKey.publicKey
  ], threshold);
});

When(/^A topic is created with the memo "([^"]*)" with the threshold key as the submit key$/, async function (memo: string) {
  const receipt = await messageService.createTopic(memo, thresholdKey)
  assert.ok(receipt.topicId !== null)
});
