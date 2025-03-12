import type {
    KeyList,
    PrivateKey,
    TopicId,
    TransactionReceipt
} from "@hashgraph/sdk";
import {
    TopicCreateTransaction,
    TopicMessageQuery,
    TopicMessageSubmitTransaction
} from "@hashgraph/sdk";
import { HederaClient } from "../hedera/hedera-client";

export interface IMessageService {
    createTopic(memo: string, submitKey: PrivateKey): Promise<TransactionReceipt>
    publishMessage(topicId: TopicId, message: string, signingKey?: PrivateKey): Promise<TransactionReceipt>
    subscribeToTopic(topicId: TopicId, startTime: number, handleMessage: (message: string) => void): void;
}

export class MessageService extends HederaClient implements IMessageService {

    /**
     * Creates a topic with the specified memo and submit key.
     */
    async createTopic(memo: string, submitKey: PrivateKey | KeyList) {
        const transaction = new TopicCreateTransaction()
            .setTopicMemo(memo)
            .setSubmitKey(submitKey)
            .freezeWith(this.client)

        return this.executeTransaction(transaction)!
    }

    /**
     * Publishes a message to the specified topic.
     */
    async publishMessage(topicId: TopicId, message: string, signingKey?: PrivateKey) {
        let transaction = new TopicMessageSubmitTransaction()
            .setTopicId(topicId)
            .setMessage(message)
            .freezeWith(this.client);

        if (signingKey) {
            transaction = await transaction.sign(signingKey);
        }

        return this.executeTransaction(transaction)
    }

    /**
     * Subscribes to a topic and calls the provided callback for each new message.
     */
    subscribeToTopic(topicId: TopicId, startTime: number, handleMessage: (message: string) => void) {
        new TopicMessageQuery()
            .setTopicId(topicId)
            .setStartTime(startTime)
            .subscribe(this.client, null, (message) => {
                const messageContents = Buffer.from(message.contents).toString();
                handleMessage(messageContents);
            });
    }
}