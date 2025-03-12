import type {
    AccountId,
    TokenId,
    TransactionId,
    TransactionReceipt,
} from "@hashgraph/sdk";
import {
    TokenAssociateTransaction, TokenCreateTransaction, TokenInfoQuery,
    TokenMintTransaction, TransferTransaction, AccountBalanceQuery,
    TokenType,
    TokenSupplyType
} from "@hashgraph/sdk";
import { HederaClient } from "./hedera-client";
import { Account } from "../types";

export interface ITokenService {
    createToken(name: string, symbol: string, decimals: number, initialSupply: number, treasuryAccount: Account): Promise<TransactionReceipt>;
    getTokenInfo(tokenId: TokenId): Promise<any>;
    mintToken(tokenId: TokenId, amount: number, treasuryAccount: Account): Promise<TransactionReceipt>;
    getTokenBalance(accountId: AccountId, tokenId: TokenId): Promise<number>;
    associateToken(account: Account, tokenId: TokenId): Promise<TransactionReceipt>;
    createTokenTransferTransaction(transfers: { account: Account; amount: number }[], tokenId: TokenId, payerTransactionId?: TransactionId): Promise<TransferTransaction>;
    transferToken(senderAccount: Account, receiverAccount: Account, tokenId: TokenId, amount: number): Promise<TransactionReceipt>;
}

export class TokenService extends HederaClient implements ITokenService {

    /**
     * Creates a new token with the specified parameters
     */
    async createToken(name: string, symbol: string, decimals: number, initialSupply: number, treasuryAccount: Account, fixedSupply: boolean = false): Promise<TransactionReceipt> {
        let transaction = new TokenCreateTransaction()
            .setTokenName(name)
            .setTokenSymbol(symbol)
            .setDecimals(decimals)
            .setInitialSupply(initialSupply)
            .setTreasuryAccountId(treasuryAccount.id)
            .setSupplyKey(treasuryAccount.privateKey.publicKey)
            .setAdminKey(treasuryAccount.privateKey.publicKey)
            .setFreezeKey(treasuryAccount.privateKey.publicKey)
            .setTokenType(TokenType.FungibleCommon)

        if (fixedSupply) {
            // For fixed supply tokens, use Finite supply type and set max supply equal to initialSupply.
            transaction = transaction.setSupplyType(TokenSupplyType.Finite).setMaxSupply(initialSupply);
        } else {
            transaction = transaction.setSupplyType(TokenSupplyType.Infinite);
        }

        transaction = transaction.freezeWith(this.client)

        return this.executeTransaction(transaction);
    }

    /**
     * Retrieves token information for the given token ID
     */
    async getTokenInfo(tokenId: TokenId) {
        const tokenInfo = await new TokenInfoQuery()
            .setTokenId(tokenId)
            .execute(this.client);
        return tokenInfo
    }

    /**
     * Mints additional tokens for the specified token
     */
    async mintToken(tokenId: TokenId, amount: number, treasuryAccount: Account) {
        const transaction = new TokenMintTransaction()
            .setTokenId(tokenId)
            .setAmount(amount)
            .freezeWith(this.client);

        const signedTransaction = await transaction.sign(treasuryAccount.privateKey);

        return this.executeTransaction(signedTransaction)
    }

    /**
     * Retrieves the token balance for a given account and token
     */
    async getTokenBalance(accountId: AccountId, tokenId: TokenId): Promise<number> {
        const balance = await new AccountBalanceQuery()
            .setAccountId(accountId)
            .execute(this.client);

        const tokenBalance = balance.tokens ? balance.tokens.get(tokenId) : 0;
        return tokenBalance ? tokenBalance.toNumber() : 0;
    }

    /**
     * Associates a token with the specified account
     */
    async associateToken(account: Account, tokenId: TokenId) {
        const transaction = new TokenAssociateTransaction()
            .setAccountId(account.id)
            .setTokenIds([tokenId])
            .freezeWith(this.client);

        const signTransaction = await transaction.sign(account.privateKey);

        return this.executeTransaction(signTransaction)
    }

    /**
     * Creates a token transfer transaction with the specified transfers
     */
    async createTokenTransferTransaction(transfers: { account: Account; amount: number }[], tokenId: TokenId, payerTransactionId?: TransactionId) {
        let transaction = new TransferTransaction()

        // Loop over each transfer and add both the debit and credit sides.
        for (const transfer of transfers) {
            transaction
                .addTokenTransfer(tokenId, transfer.account.id, transfer.amount)
        }

        if (payerTransactionId != null) {
            transaction.setTransactionId(payerTransactionId)
        }

        return transaction.freezeWith(this.client);
    }

    /**
     * Transfers tokens from the sender account to the receiver account
     */
    async transferToken(senderAccount: Account, receiverAccount: Account, tokenId: TokenId, amount: number) {
        const transaction = await this.createTokenTransferTransaction([{ account: senderAccount, amount: -amount }, { account: receiverAccount, amount }], tokenId)
        const signTransaction = await transaction.sign(senderAccount.privateKey);
        return this.executeTransaction(signTransaction)
    }


}