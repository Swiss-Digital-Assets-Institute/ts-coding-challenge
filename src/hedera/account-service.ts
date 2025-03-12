import type { AccountId } from "@hashgraph/sdk";
import { Hbar, AccountBalanceQuery, AccountCreateTransaction, PrivateKey } from "@hashgraph/sdk";
import { HederaClient } from "./hedera-client";
import { Account } from "../types";

export interface IAccountService {
    getHbarBalance(accountId: AccountId): Promise<number>;
    createAccount(initialBalance: number, publicKey: string): Promise<Account>;
}

export class AccountService extends HederaClient implements IAccountService {

    /**
     * Retrieves the HBAR balance for the given account
     */
    async getHbarBalance(accountId: AccountId): Promise<number> {
        const balance = await new AccountBalanceQuery()
            .setAccountId(accountId)
            .execute(this.client);
        return balance.hbars.toBigNumber().toNumber();;  // returns Hbar object (can be converted to number of tinybars if needed)
    }

    /**
     * Creates a new account with the specified initial HBAR balance
     */
    async createAccount(initialBalance: number) {
        const newPrivateKey = PrivateKey.generate()
        const transaction = await new AccountCreateTransaction()
            .setInitialBalance(new Hbar(initialBalance))
            .setKey(newPrivateKey)
            .execute(this.client)
        const receipt = await transaction.getReceipt(this.client)

        if (!receipt.accountId) {
            throw new Error('Account creation failed!')
        }

        return { id: receipt.accountId, privateKey: newPrivateKey }
    }
}
