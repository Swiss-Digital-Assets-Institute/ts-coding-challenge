import { Client } from "@hashgraph/sdk";
import { accounts } from "./config";
import { AccountService } from "./hedera/account-service";

// Pre-configured client for test network (testnet)
const client = Client.forTestnet()
const accountService = new AccountService(client)

// Set the operator for the client using the first account
const operatorAccount = accounts[0]
accountService.setOperator(operatorAccount)

/**
 * Creates multiple new accounts and logs their credentials.
 */
async function main() {
  for (let i = 0; i < 5; i++) {
    const newAccount = await accountService.createAccount(0)
    console.log(`{id: "${newAccount.id}", privateKey: "${newAccount.privateKey}"},`)
  }
}

main().then(console.log).catch(console.error)
