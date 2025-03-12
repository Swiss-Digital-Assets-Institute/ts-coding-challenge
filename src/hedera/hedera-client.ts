import type { Client, Transaction, TransactionReceipt } from "@hashgraph/sdk";
import type { Account } from "../types";

export interface IHederaClient {
    setOperator(operatorAccount: Account): void;
    executeTransaction(transaction: Transaction): Promise<TransactionReceipt>;
}

export abstract class HederaClient implements IHederaClient {
    protected client: Client;

    constructor(client: Client) {
        this.client = client;
    }

    /**
     * Sets the operator for the underlying Hedera client
    */
    setOperator(operatorAccount: Account): void {
        this.client.setOperator(operatorAccount.id, operatorAccount.privateKey);
    }

    /**
     * Executes a transaction
    */
    async executeTransaction(transaction: Transaction) {
        const transactionResponse = await transaction.execute(this.client)
        return transactionResponse.getReceipt(this.client)
    }
}
