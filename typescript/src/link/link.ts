import {HTTPRequest, HTTPResponse, HTTPResponses} from '../models/apiGatewayHttp';

import {UserSubscription} from "../models/userSubscription";
import {Subscription} from "../models/subscription";
import {dynamoMapper, sendToSqsImpl} from "../utils/aws";
import {ItemNotFoundException} from "@aws/dynamodb-data-mapper";
import {getUserId, getIdentityToken} from "../utils/guIdentityApi";
import {dateToSecondTimestamp, thirtyMonths} from "../utils/dates";

export class UserSubscriptionData {
    transactionToken: string;
    subscriptionId: string;

    constructor(transactionToken: string, subscriptionId: string) {
        this.transactionToken = transactionToken;
        this.subscriptionId = subscriptionId;
    }
}

function putUserSubscription(subscriptionId: string, userId: string): Promise<UserSubscription> {
    const userSubscription = new UserSubscription(
        userId,
        subscriptionId,
        new Date(Date.now()).toISOString(),
        dateToSecondTimestamp(thirtyMonths())
    );
    return dynamoMapper.put({item: userSubscription}).then(result => result.item)
}

function subscriptionExists(purchaseToken: string): Promise<boolean> {
    return dynamoMapper.get({item: new Subscription(purchaseToken)} ).then ( result => true )
        .catch( error => {
            if ( error.name === "ItemNotFoundException" ) {
                return false
            } else {
                throw error
            }
        })
}

function enqueueUnstoredPurchaseToken(subscriptionId: string, purchaseToken: string): Promise<void> {

    const queueUrl = process.env.QueueUrl;
    if (queueUrl === undefined) throw new Error("No QueueUrl env parameter provided");
    const packageName = "com.guardian";

    return subscriptionExists(purchaseToken).then(alreadyStored => {
        if(!alreadyStored) {
            const sqsEvent = {
                packageName: packageName,
                purchaseToken: purchaseToken,
                subscriptionId: subscriptionId
            };
            return sendToSqsImpl(queueUrl, sqsEvent).then(() => undefined)
        } else return Promise.resolve();
    }).catch(error => {
        console.log(`Error retrieving sub details ${error}`);
        throw error
    })
}

function persistUserSubscriptionLinks(userId: string, userSubscriptions: UserSubscriptionData[]): Promise<void>  {

    const updatedSubLinks = userSubscriptions.map( subscription =>
        putUserSubscription(subscription.transactionToken, userId)
            .then( sub => enqueueUnstoredPurchaseToken(subscription.subscriptionId, subscription.transactionToken))
            .catch( error => {
                console.log(`Error persisting subscription links. ${error}`);
                throw error
            })
    );

    return Promise.all(updatedSubLinks)
        .then(result => console.log(`Successfully stored a user subscription`))
        .catch(error => {
            console.log(`Unable to store subscription links: ${error}`);
            throw error
        });
}

export async function parseAndStoreLink (
    httpRequest: HTTPRequest,
    parsePayload: (requestBody?: string) => UserSubscriptionData[]
): Promise<HTTPResponse> {

    if(httpRequest.headers && getIdentityToken(httpRequest.headers)) {
        return getUserId(httpRequest.headers)
            .then( userId => {
                const subscriptions = parsePayload(httpRequest.body);
                return persistUserSubscriptionLinks(userId, subscriptions)
            })
            .then(result => HTTPResponses.OK)
            .catch(error => {
                console.log(`Error creating subscription link: ${error}`);
                return HTTPResponses.INTERNAL_ERROR
            });
    } else {
        return HTTPResponses.INVALID_REQUEST
    }
}
