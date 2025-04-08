import {
  AccountId,
  Client,
  Hbar,
  PrivateKey,
  TokenId,
  TokenSupplyType,
  TransactionRecord,
  TokenInfoQuery,
  TokenMintTransaction,
  TokenCreateTransaction,
  AccountBalanceQuery,
  ReceiptStatusError,
  TransferTransaction,
  TokenAssociateTransaction,
  AccountCreateTransaction,
} from "@hashgraph/sdk";
import assert from "node:assert";
import { accounts, Account } from "../../src/config";
import { Before, Given, Then, When } from "@cucumber/cucumber";

let scenarioName: string;
let firstAccount: Account;
let secondAccount: Account;
let thirdAccount: Account;
let forthAccount: Account;
let tokenId: TokenId;
let tokenName: string;
let tokenSymbol: string;
let tokenDecimals: number;
let tokenSupply: number; 
let treasuryAccountId: AccountId;
let transactionRecord: TransactionRecord;
let transferTransaction: TransferTransaction;

interface Balance {
  hbar: number;
  tokens: number;
}

const client = Client.forTestnet();


const getAccountBalance = async (
  account: Account,
  token?: TokenId
): Promise<Balance> => {
  const balanceQuery = new AccountBalanceQuery().setAccountId(account.id);
  const result = await balanceQuery.execute(client);

  return {
    tokens:
      token && result.tokens
        ? Number(result.tokens.get(token.toString()) ?? 0)
        : 0,
    hbar: result.hbars.toBigNumber().toNumber(),
  };
};

const accountWithHBar = async (
  client: Client,
  hbarAmount: number
): Promise<Account> => {
  const freshlyGeneratedKey = PrivateKey.generateED25519();
  const freshPublicKey = freshlyGeneratedKey.publicKey;

  const createTx = new AccountCreateTransaction()
    .setKey(freshPublicKey)
    .setInitialBalance(new Hbar(hbarAmount));

  const txResponse = await createTx.execute(client);
  const receipt = await txResponse.getReceipt(client);
  const newId = receipt.accountId;

  return {
    id: newId!.toString(),
    privateKey: freshlyGeneratedKey.toString(),
  };
};


const createHTTToken = async (params: {
  operatorAccount: Account;
  initialSupply?: number;            // default = 0
  maxSupply?: number;               // optional
  supplyType?: TokenSupplyType;     // optional (Finite/Infinite)
  decimals?: number;                // default = 2
}): Promise<{
  tokenId: TokenId;
  name: string;
  symbol: string;
  decimals: number;
  maxSupply: number;
  treasuryId: AccountId;
}> => {
  const {
    operatorAccount,
    initialSupply = 0,
    maxSupply,
    supplyType,
    decimals = 2,
  } = params;

  const operatorId = AccountId.fromString(operatorAccount.id);
  const operatorKey = PrivateKey.fromStringED25519(operatorAccount.privateKey);

  let createTokenTx = new TokenCreateTransaction()
    .setTokenName("Test Token")
    .setTokenSymbol("HTT")
    .setTreasuryAccountId(operatorId)
    .setSupplyKey(operatorKey)
    .setInitialSupply(initialSupply)
    .setDecimals(decimals);

  if (maxSupply !== undefined) {
    createTokenTx = createTokenTx.setMaxSupply(maxSupply);
  }
  if (supplyType !== undefined) {
    createTokenTx = createTokenTx.setSupplyType(supplyType);
  }

  const frozenTx = await createTokenTx.freezeWith(client).sign(operatorKey);
  const resp = await frozenTx.execute(client);
  const receipt = await resp.getReceipt(client);
  const newTokenId = receipt.tokenId!;

  const info = await new TokenInfoQuery().setTokenId(newTokenId).execute(client);

  return {
    tokenId: newTokenId,
    name: info.name,
    symbol: info.symbol,
    decimals: info.decimals,
    maxSupply: Number(info.maxSupply),
    treasuryId: info.treasuryAccountId!,
  };
};


const mintTokens = async (tokenAmount: number): Promise<string> => {
  const mintTx = new TokenMintTransaction()
    .setTokenId(tokenId)
    .setAmount(tokenAmount)
    .freezeWith(client);

  const signedTx = await mintTx.sign(
    PrivateKey.fromStringED25519(firstAccount.privateKey)
  );
  const submitResp = await signedTx.execute(client);
  const finalReceipt = await submitResp.getReceipt(client);

  return finalReceipt.status.toString();
};


const transferTokens = async (
  fromAccount: Account,
  toAccount: Account,
  token: TokenId,
  amount: number
) => {
  const recipientId = AccountId.fromString(toAccount.id);
  const recipientKey = PrivateKey.fromStringED25519(toAccount.privateKey);

  const associateTx = new TokenAssociateTransaction()
    .setAccountId(recipientId)
    .setTokenIds([token])
    .freezeWith(client);

  const signedAssociate = await associateTx.sign(recipientKey);
  await signedAssociate.execute(client);

  const tokenTx = new TransferTransaction()
    .addTokenTransfer(token, fromAccount.id, -amount)
    .addTokenTransfer(token, recipientId, amount)
    .freezeWith(client);

  const fromKey = PrivateKey.fromStringED25519(fromAccount.privateKey);
  const signedTokenTx = await tokenTx.sign(fromKey);

  const tokenResp = await signedTokenTx.execute(client);
  const tokenReceipt = await tokenResp.getReceipt(client);
  return tokenReceipt.status.toString();
};


Before((scenario) => {
  scenarioName = scenario.pickle.name;
});


Given(/^A Hedera account with more than (\d+) hbar$/, async function (expectedBalance: number) {
  for (const acc of accounts) {
    const accId = AccountId.fromString(acc.id);
    const accPrivateKey = PrivateKey.fromStringED25519(acc.privateKey);
    const { hbar } = await getAccountBalance(acc);

    if (hbar > expectedBalance) {
      client.setOperator(accId, accPrivateKey);
      firstAccount = acc;
      assert.ok(true);
      return;
    }
  }
  assert.fail(
    `No account in "accounts" config had more than ${expectedBalance} HBAR`
  );
});

When(/^I create a token named Test Token \(HTT\)$/, async function () {
  const info = await createHTTToken({
    operatorAccount: firstAccount,
    decimals: 2,
  });

  tokenId = info.tokenId;
  tokenName = info.name;
  tokenSymbol = info.symbol;
  tokenDecimals = info.decimals;
  treasuryAccountId = info.treasuryId;

  assert.ok(tokenId.toString() !== undefined);
});

Then(/^The token has the name "([^"]*)"$/, async function (expectedTokenName: string) {
  assert.strictEqual(tokenName, expectedTokenName);
});

Then(/^The token has the symbol "([^"]*)"$/, async function (expectedSymbol: string) {
  assert.strictEqual(tokenSymbol, expectedSymbol);
});

Then(/^The token has (\d+) decimals$/, async function (expectedDecimals: number) {
  assert.strictEqual(tokenDecimals, expectedDecimals);
});

Then(/^The token is owned by the account$/, async function () {
  assert.strictEqual(treasuryAccountId.toString(), firstAccount.id);
});

Then(/^An attempt to mint (\d+) additional tokens succeeds$/, async function (tokenAmount: number) {
  const adjusted = tokenAmount * 10 ** tokenDecimals;
  const status = await mintTokens(adjusted);
  console.log("Mint transaction status:", status);

  const { tokens: balanceAfterMint } = await getAccountBalance(firstAccount, tokenId);
  assert.strictEqual(balanceAfterMint, adjusted);
});


When(
  /^I create a fixed supply token named Test Token \(HTT\) with (\d+) tokens$/,
  async function (maxSupply: number) {
    const info = await createHTTToken({
      operatorAccount: firstAccount,
      decimals: 2,
      maxSupply,
      supplyType: TokenSupplyType.Finite,
    });

    tokenId = info.tokenId;
    tokenName = info.name;
    tokenSymbol = info.symbol;
    tokenDecimals = info.decimals;
    tokenSupply = info.maxSupply;
    treasuryAccountId = info.treasuryId;

    assert.strictEqual(tokenSupply, maxSupply);
  }
);

Then(/^The total supply of the token is (\d+)$/, async function (expectedSupply: number) {
  assert.strictEqual(tokenSupply, expectedSupply);
});

Then(/^An attempt to mint tokens fails$/, async function () {
  let errorStatusCode: number | undefined;
  try {
    await mintTokens(tokenSupply + 100);
  } catch (error) {
    if (error instanceof ReceiptStatusError) {
      errorStatusCode = error.status._code;
    } else {
      console.error("Unexpected error encountered:", error);
      throw error;
    }
  }
  assert.strictEqual(errorStatusCode, 236);
});


Given(
  /^A first hedera account with more than (\d+) hbar$/,
  async function (expectedBalance: number) {
    const { hbar } = await getAccountBalance(firstAccount);
    assert.ok(hbar > expectedBalance);
  }
);

Given(/^A second Hedera account$/, async function () {
  secondAccount = await accountWithHBar(client, 0);
});


Given(
  /^A token named Test Token \(HTT\) with (\d+) tokens$/,
  { timeout: 10_000 }, 
  async function (tokenCount: number) {
    const info = await createHTTToken({
      operatorAccount: firstAccount,
      initialSupply: 100, 
      maxSupply: tokenCount,
      supplyType: TokenSupplyType.Finite,
    });

    tokenId = info.tokenId;
    tokenName = info.name;
    tokenSymbol = info.symbol;
    tokenDecimals = info.decimals;
    tokenSupply = info.maxSupply;
    treasuryAccountId = info.treasuryId;

    if (scenarioName === "Create a token transfer transaction paid for by the recipient") {
      await transferTokens(firstAccount, secondAccount, tokenId, 100);
    }
    assert.strictEqual(tokenSupply, tokenCount);
  }
);

Given(/^The first account holds (\d+) HTT tokens$/, async function (tokenAmount: number) {
  const { tokens } = await getAccountBalance(firstAccount, tokenId);
  assert.strictEqual(tokens, tokenAmount);
});

Given(/^The second account holds (\d+) HTT tokens$/, async function (tokenAmount: number) {
  const { tokens } = await getAccountBalance(secondAccount, tokenId);
  assert.strictEqual(tokens, tokenAmount);
});


When(
  /^The first account creates a transaction to transfer (\d+) HTT tokens to the second account$/,
  async function (tokenAmount: number) {
    const secondAccId = AccountId.fromString(secondAccount.id);
    const secondAccKey = PrivateKey.fromStringED25519(secondAccount.privateKey);

    const associateTx = new TokenAssociateTransaction()
      .setAccountId(secondAccId)
      .setTokenIds([tokenId])
      .freezeWith(client);

    const signedAssoc = await associateTx.sign(secondAccKey);
    const assocResp = await signedAssoc.execute(client);
    const assocReceipt = await assocResp.getReceipt(client);
    console.log("Token associate status:", assocReceipt.status.toString());

    const firstAccKey = PrivateKey.fromStringED25519(firstAccount.privateKey);
    transferTransaction = new TransferTransaction()
      .addTokenTransfer(tokenId, firstAccount.id, -tokenAmount)
      .addTokenTransfer(tokenId, secondAccount.id, tokenAmount)
      .freezeWith(client);

    transferTransaction = await transferTransaction.sign(firstAccKey);
  }
);

When(/^The first account submits the transaction$/, async function () {
  const txResp = await transferTransaction.execute(client);
  const receipt = await txResp.getReceipt(client);
  console.log("Transfer transaction status:", receipt.status.toString());

  transactionRecord = await txResp.getRecord(client);
});

When(
  /^The second account creates a transaction to transfer (\d+) HTT tokens to the first account$/,
  async function (tokenAmount: number) {
    const secondAccKey = PrivateKey.fromStringED25519(secondAccount.privateKey);

    const transTx = new TransferTransaction()
      .addTokenTransfer(tokenId, secondAccount.id, -tokenAmount)
      .addTokenTransfer(tokenId, firstAccount.id, tokenAmount)
      .freezeWith(client);

    transferTransaction = await transTx.sign(secondAccKey);
  }
);

Then(/^The first account has paid for the transaction fee$/, async function () {
  const payerId = transactionRecord.transactionId.accountId?.toString();
  assert.strictEqual(payerId, firstAccount.id);
});



Given(
  /^A first hedera account with more than (\d+) hbar and (\d+) HTT tokens$/,
  async function (expectedHbar: number, expectedTokens: number) {
    const { tokens, hbar } = await getAccountBalance(firstAccount, tokenId);
    assert.ok(hbar > expectedHbar, "Not enough HBAR in first account");
    assert.strictEqual(tokens, expectedTokens, "Incorrect HTT tokens in first account");
  }
);

Given(
  /^A second Hedera account with (\d+) hbar and (\d+) HTT tokens$/,
  { timeout: 10_000 },
  async function (expectedHbar: number, expectedTokens: number) {
    secondAccount = await accountWithHBar(client, expectedHbar);

    await mintTokens(expectedTokens);
    await transferTokens(firstAccount, secondAccount, tokenId, expectedTokens);

    const { tokens, hbar } = await getAccountBalance(secondAccount, tokenId);
    assert.strictEqual(tokens, expectedTokens);
    assert.strictEqual(hbar, expectedHbar);
    assert.notStrictEqual(secondAccount.id, firstAccount.id);
  }
);

Given(
  /^A third Hedera account with (\d+) hbar and (\d+) HTT tokens$/,
  { timeout: 10_000 },
  async function (expectedHbar: number, expectedTokens: number) {
    thirdAccount = await accountWithHBar(client, expectedHbar);

    await mintTokens(expectedTokens);
    await transferTokens(firstAccount, thirdAccount, tokenId, expectedTokens);

    const { tokens, hbar } = await getAccountBalance(thirdAccount, tokenId);
    assert.strictEqual(tokens, expectedTokens);
    assert.strictEqual(hbar, expectedHbar);
    assert.notStrictEqual(thirdAccount.id, firstAccount.id);
    assert.notStrictEqual(thirdAccount.id, secondAccount.id);
  }
);

Given(
  /^A fourth Hedera account with (\d+) hbar and (\d+) HTT tokens$/,
  { timeout: 10_000 },
  async function (expectedHbar: number, expectedTokens: number) {
    forthAccount = await accountWithHBar(client, expectedHbar);

    await mintTokens(expectedTokens);
    await transferTokens(firstAccount, forthAccount, tokenId, expectedTokens);

    const { tokens, hbar } = await getAccountBalance(forthAccount, tokenId);
    assert.strictEqual(tokens, expectedTokens);
    assert.strictEqual(hbar, expectedHbar);
    assert.notStrictEqual(forthAccount.id, firstAccount.id);
    assert.notStrictEqual(forthAccount.id, secondAccount.id);
    assert.notStrictEqual(forthAccount.id, thirdAccount.id);
  }
);


When(
  /^A transaction is created to transfer (\d+) HTT tokens out of the first and second account and (\d+) HTT tokens into the third account and (\d+) HTT tokens into the fourth account$/,
  async function (deductTokens: number, addToThird: number, addToForth: number) {
    const firstKey = PrivateKey.fromStringED25519(firstAccount.privateKey);
    const secondKey = PrivateKey.fromStringED25519(secondAccount.privateKey);

    transferTransaction = new TransferTransaction()
      .addTokenTransfer(tokenId, firstAccount.id, -deductTokens)
      .addTokenTransfer(tokenId, secondAccount.id, -deductTokens)
      .addTokenTransfer(tokenId, thirdAccount.id, addToThird)
      .addTokenTransfer(tokenId, forthAccount.id, addToForth)
      .freezeWith(client);

    transferTransaction = await transferTransaction.sign(firstKey);
    transferTransaction = await transferTransaction.sign(secondKey);
  }
);

Then(/^The third account holds (\d+) HTT tokens$/, async function (tokenAmount: number) {
  const { tokens } = await getAccountBalance(thirdAccount, tokenId);
  assert.strictEqual(tokens, tokenAmount);
});

Then(/^The fourth account holds (\d+) HTT tokens$/, async function (tokenAmount: number) {
  const { tokens } = await getAccountBalance(forthAccount, tokenId);
  assert.strictEqual(tokens, tokenAmount);
});
