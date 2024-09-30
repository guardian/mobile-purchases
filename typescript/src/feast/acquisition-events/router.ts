import type { DynamoDBRecord, DynamoDBStreamEvent } from 'aws-lambda';
import { Platform } from "../../models/platform";
import {ReadSubscription} from "../../models/subscription";
import {dynamoMapper/*, sendToSqs*/} from "../../utils/aws";
import {plusDays} from "../../utils/dates";


export const isActiveSubscription = (currentTime: Date, subscriptionRecord: ReadSubscription): boolean => {
    // Check if the subscription is active
    const end = new Date(Date.parse(subscriptionRecord.endTimestamp));
    const endWithGracePeriod = plusDays(end, 30);
    return (currentTime.getTime() <= endWithGracePeriod.getTime());
}

export const processAcquisition = (subscriptionRecord: ReadSubscription, identityId: string): boolean => {
    const subscriptionId = subscriptionRecord.subscriptionId;
    const now = new Date();

    if (!isActiveSubscription(now, subscriptionRecord)) {
        console.log(`Subscription ${subscriptionRecord.subscriptionId} is not active. Stopping processing.`);
        return true;
    }

    const platform = subscriptionRecord.platform;
    const tokens = subscriptionRecord.applePayload ?? subscriptionRecord.googlePayload;

    //check if iOS or Android
    //Assemble data anything needed for acquisitions records that we can get from the subscription, plus apple/google tokens to use in querying them
    //Send to SQS

    return true;
}

export const handler = async (event: DynamoDBStreamEvent): Promise<String> => {
    const message: String = 'Feast Acquisition Events Router Lambda has been called';
    console.log(message)

    const records = event.Records;

    let processedCount = 0;

    const processRecordPromises = records.map(async (record: DynamoDBRecord) => {
        const eventName = record.eventName;

        const identityId = record?.dynamodb?.NewImage?.userId?.S || "";
        const subscriptionId = record?.dynamodb?.NewImage?.subscriptionId?.S || "";

        if (eventName === "INSERT") {
            processedCount++;

            console.log(`identityId: ${identityId}, subscriptionId: ${subscriptionId}`);
// need to know if productId of the subscription contains "uk.co.guardian.Feast" or even just "Feast"
            let itemToQuery = new ReadSubscription();
            itemToQuery.setSubscriptionId(subscriptionId);

            let subscriptionRecord: ReadSubscription;

            try {
                subscriptionRecord = await dynamoMapper.get(itemToQuery);
            } catch (error) {
                console.log(`Subscription ${subscriptionId} record not found in the subscriptions table. Error: `, error);

            /*
                Need to add config for a router Dead Letter Queue and send to this in case of error.
                try {
                    const timestamp = Date.now();
                    await sendToSqs(dlqUrl, {subscriptionId, identityId, timestamp});
                } catch(e) {
                    console.log(`could not send message to dead letter queue for identityId: ${identityId}, subscriptionId: ${subscriptionId}. Error: `, e)
                }*/

                return false;
            }
            const isFeast = subscriptionRecord.platform === Platform.IosFeast || subscriptionRecord.platform === Platform.AndroidFeast;
            if (isFeast) {
                return processAcquisition(subscriptionRecord, identityId);
            }
            return true;
        }
    });

    await Promise.all(processRecordPromises);

    console.log(`Processed ${processedCount} newly inserted records from the link (mobile-purchases-${Stage}-user-subscriptions) DynamoDB table`);
    //for each record
    //check if eventName == "INSERT"
    //extract 'dynamobb':StreamRecord
    //extract key
    //lookup key in DynamoDB
    //If Subscription type is Feast, determine if Google or apple
    //Extract relevant Fields
    //Send message to queue
    return message;
}