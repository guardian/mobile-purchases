import type { Subscription } from '../models/subscription';
import { SubscriptionEmpty } from '../models/subscription';
import { dynamoMapper, sendToSqs, sqs } from '../utils/aws';
import { processAcquisition } from './processSubscription';

interface MessageBody {
    identityId: string;
    subscriptionId: string;
    timestamp: number;
}

export function messageIsOneDayOld(timestamp: number): boolean {
    const now = Date.now();

    return now - timestamp >= 86400000;
}

async function deleteMessage(dlqUrl: string, receiptHandle: string) {
    return sqs
        .deleteMessage({
            QueueUrl: dlqUrl,
            ReceiptHandle: receiptHandle,
        })
        .promise();
}

export async function handler(event: any): Promise<void> {
    const dlqUrl = process.env.DLQUrl;

    // ----------------------------------------------
    // code group: 1134
    // Date: 18th Feb 2026
    // Author: Pascal
    // Investigating a strange set of alarms which might result in this process timing out during processing
    // (possibly hitting AWS's 15 mins run time)
    // To establish whether that's the case or not, I am going to log the time since starts at each steps of the loop
    // and will review the numbers in the log afterwards
    // ----------------------------------------------

    // ----------------------------------------------
    // code group: 1134
    const t1 = Date.now(); // millisecond since epoch
    console.log(`[12d54c00] starting at t1: ${t1}`);
    // ----------------------------------------------

    if (!dlqUrl) {
        throw new Error('process.env.DLQUrl is undefined');
    }

    while (true) {
        // ----------------------------------------------
        // code group: 1134
        const t2 = Date.now();
        const dt = (t1 - t2) / 1000;
        console.log(`[12d54c00] [5f5c5596] retrieving new messages after ${dt} seconds`);
        // ----------------------------------------------

        // Receive messages from the DLQ
        const data = await sqs
            .receiveMessage({
                QueueUrl: dlqUrl,
                MaxNumberOfMessages: 10, // adjust as needed
            })
            .promise();

        // Check if there are any messages
        if (!data.Messages || data.Messages.length === 0) {
            console.log('No messages to process');
            break;
        }

        // Process each message
        for (const message of data.Messages) {
            // ----------------------------------------------
            // code group: 1134
            const t2 = Date.now();
            const dt = (t1 - t2) / 1000;
            console.log(`[12d54c00] running for ${dt} seconds`);
            // ----------------------------------------------

            if (!message.Body) {
                // Should never happen
                throw new Error(`Message ${message.MessageId} does not have a Body property`);
            }

            if (!message.ReceiptHandle) {
                // Should never happen
                throw new Error(
                    `Message ${message.MessageId} does not have a ReceiptHandle property`,
                );
            }

            let body: MessageBody;

            try {
                body = JSON.parse(message.Body);
            } catch (err) {
                throw new Error(
                    `JSON.parse() failed to parse Body of message ${message.MessageId}: ${err}`,
                );
            }

            const { identityId, subscriptionId, timestamp } = body;

            if (messageIsOneDayOld(timestamp)) {
                console.log(
                    `Message ${message.MessageId} is more than one day old. Deleting message from DLQ`,
                );
                await deleteMessage(dlqUrl, message.ReceiptHandle);
                continue;
            }

            console.log(
                `identityId: ${identityId}, subscriptionId: ${subscriptionId}, timestamp: ${timestamp}`,
            );

            const subEmpty = new SubscriptionEmpty();
            subEmpty.setSubscriptionId(subscriptionId);

            let subscriptionRecord: Subscription;

            try {
                subscriptionRecord = await dynamoMapper.get(subEmpty);
            } catch (error) {
                console.log(
                    `[5410a826] Subscription ${subscriptionId} record not found in the subscriptions table. Error: `,
                    error,
                );
                continue;
            }

            const success = await processAcquisition(subscriptionRecord, identityId);

            if (success) {
                await deleteMessage(dlqUrl, message.ReceiptHandle);
            }
        }
    }

    // ----------------------------------------------
    // code group: 1134
    const t2 = Date.now();
    const dt = (t1 - t2) / 1000;
    console.log(`[12d54c00] [c9a93987] completed after ${dt} seconds`);
    // ----------------------------------------------
}
