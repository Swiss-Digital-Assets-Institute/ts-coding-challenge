import { Given, Then, When } from "@cucumber/cucumber";
import { accounts } from "../../src/config";
import {
  AccountBalanceQuery,
  AccountId,
  Client,
  PrivateKey,
  TokenAssociateTransaction,
  TokenCreateTransaction,
  TokenId,
  TokenInfoQuery,
  TokenMintTransaction,
  TokenSupplyType,
  TokenType,
  TransferTransaction,
} from "@hashgraph/sdk";
import assert from "node:assert";

const client = Client.forTestnet();

function getAccount(index: number) {
  const account = accounts[index];
  const accountId = AccountId.fromString(account.id);
  const privateKey = PrivateKey.fromStringED25519(account.privateKey);
  return { accountId, privateKey };
}
async function associateToken(
  accountId: AccountId,
  tokenId: TokenId,
  privateKey: PrivateKey
) {
  const tx = new TokenAssociateTransaction()
    .setAccountId(accountId)
    .setTokenIds([tokenId])
    .freezeWith(client);
  const signedTx = await tx.sign(privateKey);
  await signedTx.execute(client);
}
async function getTokenDetails(tokenId: string) {
  const query = new TokenInfoQuery().setTokenId(tokenId);
  const tokenInfo = await query.execute(client);
  return tokenInfo;
}
async function getHbarBalance(accountId: AccountId) {
  const query = new AccountBalanceQuery().setAccountId(accountId);
  const balance = await query.execute(client);
  return balance.hbars.toBigNumber().toNumber();
}
async function getTokenBalance(accountId: AccountId, tokenId: string) {
  const query = new AccountBalanceQuery().setAccountId(accountId);
  const balance = await query.execute(client);
  return balance.tokens ? Number(balance.tokens.get(tokenId.toString())) : 0;
}

Given(
  /^A Hedera account with more than (\d+) hbar$/,
  async function (expectedBalance: number) {
    const account = accounts[0];
    const MY_ACCOUNT_ID = AccountId.fromString(account.id);
    const MY_PRIVATE_KEY = PrivateKey.fromStringED25519(account.privateKey);
    client.setOperator(MY_ACCOUNT_ID, MY_PRIVATE_KEY);

    //Create the query request
    const query = new AccountBalanceQuery().setAccountId(MY_ACCOUNT_ID);
    const balance = await query.execute(client);
    assert.ok(balance.hbars.toBigNumber().toNumber() > expectedBalance);
  }
);

When(
  /^I create a token named Test Token \(HTT\)$/,
  { timeout: 10000 },
  async function () {
    const { accountId, privateKey } = getAccount(0);
    const transaction = await new TokenCreateTransaction()
      .setTokenName("Test Token")
      .setTokenSymbol("HTT")
      .setTreasuryAccountId(accountId)
      .setInitialSupply(1000)
      .setDecimals(2)
      .setSupplyType(TokenSupplyType.Infinite)
      .setSupplyKey(privateKey)
      .freezeWith(client)
      .sign(privateKey);

    const response = await transaction.execute(client);
    const receipt = await response.getReceipt(client);
    const tokenId = receipt.tokenId;
    this.tokenId = tokenId;
    console.log(`Token created with ID: ${tokenId}`);
  }
);

Then(/^The token has the name "([^"]*)"$/, async function (name: string) {
  const tokenInfo = await getTokenDetails(this.tokenId);
  assert.strictEqual(tokenInfo.name, name);
});

Then(/^The token has the symbol "([^"]*)"$/, async function (symbol: string) {
  const tokenInfo = await getTokenDetails(this.tokenId);
  assert.strictEqual(tokenInfo.symbol, symbol);
});

Then(/^The token has (\d+) decimals$/, async function (decimals: number) {
  const tokenInfo = await getTokenDetails(this.tokenId);
  assert.strictEqual(tokenInfo.decimals, decimals);
});

Then(/^The token is owned by the account$/, async function () {
  const { accountId } = getAccount(0);
  const tokenInfo = await getTokenDetails(this.tokenId);
  assert.strictEqual(
    tokenInfo.treasuryAccountId!.toString(),
    accountId.toString()
  );
});

Then(
  /^An attempt to mint (\d+) additional tokens succeeds$/,
  async function (supply: number) {
    const { accountId, privateKey } = getAccount(0);
    const mintTx = await new TokenMintTransaction()
      .setTokenId(this.tokenId!)
      .setAmount(Number(supply))
      .freezeWith(client)
      .sign(privateKey);

    const submit = await mintTx.execute(client);
    const receipt = await submit.getReceipt(client);
    assert.strictEqual(receipt.status.toString(), "SUCCESS");
  }
);
When(
  /^I create a fixed supply token named Test Token \(HTT\) with (\d+) tokens$/,
  { timeout: 10000 },
  async function (supply: number) {
    const { accountId, privateKey } = getAccount(0);

    const tokenCreateTx = await new TokenCreateTransaction()
      .setTokenName("Test Token")
      .setTokenSymbol("HTT")
      .setDecimals(2)
      .setInitialSupply(Number(500))
      .setTreasuryAccountId(accountId)
      .setSupplyType(TokenSupplyType.Finite)
      .setMaxSupply(Number(supply))
      .setAdminKey(privateKey)
      .setSupplyKey(privateKey)
      .freezeWith(client)
      .sign(privateKey);

    const submitTx = await tokenCreateTx.execute(client);
    const receipt = await submitTx.getReceipt(client);
    this.tokenId = receipt.tokenId;
    const tokenInfo = await getTokenDetails(this.tokenId);
    assert.strictEqual(Number(tokenInfo.maxSupply), Number(supply));
  }
);
Then(
  /^The total supply of the token is (\d+)$/,
  async function (supply: number) {
    const tokenInfo = await getTokenDetails(this.tokenId);
    assert.strictEqual(Number(tokenInfo.maxSupply), Number(supply));
  }
);
Then(/^An attempt to mint tokens fails$/, async function () {
  try {
    const { privateKey } = getAccount(0);
    const tokenInfo = await getTokenDetails(this.tokenId);
    const mintTx = await new TokenMintTransaction()
      .setTokenId(this.tokenId!)
      .setAmount(Number(tokenInfo.maxSupply) + 1)
      .freezeWith(client)
      .sign(privateKey);

    const submit = await mintTx.execute(client);
    const receipt = await submit.getReceipt(client);
    assert.strictEqual(receipt.status.toString(), "SUCCESS");
  } catch (error) {
    if (error instanceof Error) {
      assert.ok(
        error.message.includes("TOKEN_MAX_SUPPLY_REACHED"),
        `Unexpected error message: ${error.message}`
      );
    } else {
      assert.fail("Expected an error to be thrown");
    }
  }
});
Given(
  /^A first hedera account with more than (\d+) hbar$/,
  async function (expectedBalance: number) {
    const { accountId, privateKey } = getAccount(0);
    const balance = await getHbarBalance(accountId);
    assert.ok(balance > expectedBalance);
  }
);
Given(/^A second Hedera account$/, async function () {
  const { accountId, privateKey } = getAccount(1);
});
Given(
  /^A token named Test Token \(HTT\) with (\d+) tokens$/,
  async function (tokenCount: number) {
    const { accountId, privateKey } = getAccount(0);
    const tokenCreateTx = await new TokenCreateTransaction()
      .setTokenName("Test Token")
      .setTokenSymbol("HTT")
      .setDecimals(2)
      .setInitialSupply(Number(500))
      .setTreasuryAccountId(accountId)
      .setSupplyType(TokenSupplyType.Finite)
      .setMaxSupply(Number(tokenCount))
      .setAdminKey(privateKey)
      .setSupplyKey(privateKey)
      .freezeWith(client)
      .sign(privateKey);

    const submitTx = await tokenCreateTx.execute(client);
    const receipt = await submitTx.getReceipt(client);
    this.tokenId = receipt.tokenId;
    const tokenInfo = await getTokenDetails(this.tokenId);
    assert.strictEqual(Number(tokenInfo.maxSupply), Number(tokenCount));
  }
);
Given(
  /^The first account holds (\d+) HTT tokens$/,
  async function (tokenCount: number) {
    const { accountId } = getAccount(0);
    const tokenBalance = await getTokenBalance(accountId, this.tokenId!);
    assert.ok(tokenBalance >= tokenCount);
  }
);
Given(
  /^The second account holds (\d+) HTT tokens$/,
  async function (tokenCount: number) {
    const { accountId, privateKey } = getAccount(0);
    const { accountId: accountId2, privateKey: privateKey2 } = getAccount(1);

    await associateToken(accountId, this.tokenId!, privateKey);
    const transferTx = await new TransferTransaction()
      .addTokenTransfer(this.tokenId!, accountId, -tokenCount)
      .addTokenTransfer(this.tokenId!, accountId2, tokenCount)
      .freezeWith(client)
      .sign(privateKey);
    await transferTx.execute(client);
    const tokenBalance = await getTokenBalance(accountId, this.tokenId!);
    assert.ok(tokenBalance >= tokenCount);
  }
);
When(
  /^The first account creates a transaction to transfer (\d+) HTT tokens to the second account$/,
  async function (tokenCount: number) {
    const { accountId, privateKey } = getAccount(0);
    const { accountId: accountId2, privateKey: privateKey2 } = getAccount(1);
    const transferTx = await new TransferTransaction()
      .addTokenTransfer(this.tokenId!, accountId, -tokenCount)
      .addTokenTransfer(this.tokenId!, accountId2, tokenCount)
      .freezeWith(client)
      .sign(privateKey);
    this.transferTx = transferTx;
  }
);
When(/^The first account submits the transaction$/, async function () {
  const response = await this.transferTx.execute(client);
  const transferResponse = await response.getReceipt(client);
  this.transferReceipt = await response.getRecord(client);
  assert.strictEqual(transferResponse.status.toString(), "SUCCESS");
});
When(
  /^The second account creates a transaction to transfer (\d+) HTT tokens to the first account$/,
  async function (tokenCount: number) {
    const { accountId, privateKey } = getAccount(0);
    const { accountId: accountId2, privateKey: privateKey2 } = getAccount(1);
    this.transferTx = await new TransferTransaction()
      .addTokenTransfer(this.tokenId!, accountId2, -tokenCount)
      .addTokenTransfer(this.tokenId!, accountId, tokenCount)
      .freezeWith(client)
      .sign(privateKey2);
  }
);
Then(/^The first account has paid for the transaction fee$/, async function () {
  const { accountId } = getAccount(0);
  const paidBy = this.transferReceipt.transactionId.accountId?.toString();
  assert.strictEqual(paidBy, accountId.toString());
});
Given(
  /^A first hedera account with more than (\d+) hbar and (\d+) HTT tokens$/,
  async function (expectedHbarBalance: number, expectedTokenBalance: number) {
    const { accountId, privateKey } = getAccount(0);
    const balance = await getHbarBalance(accountId);
    assert.ok(balance > expectedHbarBalance);
    const tokenBalance = await getTokenBalance(accountId, this.tokenId!);
    assert.ok(tokenBalance >= expectedTokenBalance);
  }
);
Given(
  /^A second Hedera account with (\d+) hbar and (\d+) HTT tokens$/,
  { timeout: 10000 },
  async function (expectedHbarBalance: number, expectedTokenBalance: number) {
    const { accountId, privateKey } = getAccount(0);
    const { accountId: accountId1, privateKey: privateKey1 } = getAccount(1);
    const balance = await getHbarBalance(accountId1);
    assert.ok(
      balance > expectedHbarBalance,
      `Expected balance to be greater than ${expectedHbarBalance}, but got ${balance}`
    );

    const mintTx = await new TokenMintTransaction()
      .setTokenId(this.tokenId!)
      .setAmount(expectedTokenBalance)
      .freezeWith(client)
      .sign(privateKey);
    await mintTx.execute(client);

    const transferTx = await new TransferTransaction()
      .addTokenTransfer(this.tokenId!, accountId, -expectedTokenBalance)
      .addTokenTransfer(this.tokenId!, accountId1, expectedTokenBalance)
      .freezeWith(client)
      .sign(privateKey);
    await transferTx.execute(client);

    const tokenBalance = await getTokenBalance(accountId, this.tokenId!);
    assert.ok(
      tokenBalance >= expectedTokenBalance,
      `Expected token balance to be greater than ${expectedTokenBalance}, but got ${tokenBalance}`
    );
  }
);
Given(
  /^A third Hedera account with (\d+) hbar and (\d+) HTT tokens$/,
  { timeout: 10000 },
  async function (expectedHbarBalance: number, expectedTokenBalance: number) {
    const { accountId, privateKey } = getAccount(0);
    const { accountId: accountId2 } = getAccount(2);
    const balance = await getHbarBalance(accountId2);
    assert.ok(
      balance >= expectedHbarBalance,
      "Expected balance to be greater than ${expectedHbarBalance}, but got ${balance}"
    );

    const mintTx = await new TokenMintTransaction()
      .setTokenId(this.tokenId!)
      .setAmount(expectedTokenBalance)
      .freezeWith(client)
      .sign(privateKey);
    const response = await mintTx.execute(client);
    await response.getReceipt(client);
    const transferTx = await new TransferTransaction()
      .addTokenTransfer(this.tokenId!, accountId, -expectedTokenBalance)
      .addTokenTransfer(this.tokenId!, accountId2, expectedTokenBalance)
      .freezeWith(client)
      .sign(privateKey);

    const txTransferResponse = await transferTx.execute(client);
    await txTransferResponse.getReceipt(client);
    const tokenBalance = await getTokenBalance(accountId2, this.tokenId!);
    assert.ok(
      tokenBalance >= expectedTokenBalance,
      `Expected token balance to be greater than ${expectedTokenBalance}, but got ${tokenBalance}`
    );
  }
);
Given(
  /^A fourth Hedera account with (\d+) hbar and (\d+) HTT tokens$/,
  { timeout: 10000 },

  async function (expectedHbarBalance: number, expectedTokenBalance: number) {
    const { accountId, privateKey } = getAccount(0);
    const { accountId: accountId3 } = getAccount(3);
    const balance = await getHbarBalance(accountId3);
    assert.ok(
      balance >= expectedHbarBalance,
      `Expected balance to be greater than ${expectedHbarBalance}, but got ${balance}`
    );

    const mintTx = await new TokenMintTransaction()
      .setTokenId(this.tokenId!)
      .setAmount(expectedTokenBalance)
      .freezeWith(client)
      .sign(privateKey);
    const response = await mintTx.execute(client);
    await response.getReceipt(client);
    const transferTx = await new TransferTransaction()
      .addTokenTransfer(this.tokenId!, accountId, -expectedTokenBalance)
      .addTokenTransfer(this.tokenId!, accountId3, expectedTokenBalance)
      .freezeWith(client)
      .sign(privateKey);
    const txTransferResponse = await transferTx.execute(client);
    await txTransferResponse.getReceipt(client);
    const tokenBalance = await getTokenBalance(accountId3, this.tokenId!);
    assert.ok(
      tokenBalance >= expectedTokenBalance,
      `Expected token balance to be greater than ${expectedTokenBalance}, but got ${tokenBalance}`
    );
  }
);
When(
  /^A transaction is created to transfer (\d+) HTT tokens out of the first and second account and (\d+) HTT tokens into the third account and (\d+) HTT tokens into the fourth account$/,
  { timeout: 10000 },

  async function (
    transferAmount: number,
    transferToAc2: number,
    transferToAc3: number
  ) {
    const { accountId, privateKey } = getAccount(0);
    const { accountId: accountId2, privateKey: privateKey2 } = getAccount(1);
    const { accountId: accountId3 } = getAccount(2);
    const { accountId: accountId4 } = getAccount(3);
    let transferTx = new TransferTransaction()
      .addTokenTransfer(this.tokenId!, accountId, -transferAmount)
      .addTokenTransfer(this.tokenId!, accountId2, -transferAmount)
      .addTokenTransfer(this.tokenId!, accountId3, transferToAc2)
      .addTokenTransfer(this.tokenId!, accountId4, transferToAc3)
      .freezeWith(client);
    await transferTx.sign(privateKey);
    await transferTx.sign(privateKey2);

    this.transferTx = transferTx;
  }
);
Then(
  /^The third account holds (\d+) HTT tokens$/,
  async function (expectedTokenBalance: number) {
    const { accountId } = getAccount(2);
    const tokenBalance = await getTokenBalance(accountId, this.tokenId!);
    assert.ok(tokenBalance >= expectedTokenBalance);
  }
);
Then(
  /^The fourth account holds (\d+) HTT tokens$/,
  async function (expectedTokenBalance: number) {
    const { accountId } = getAccount(3);
    const tokenBalance = await getTokenBalance(accountId, this.tokenId!);
    assert.ok(tokenBalance >= expectedTokenBalance);
  }
);
