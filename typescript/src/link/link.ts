import {HTTPRequest, HTTPResponse, HTTPResponses} from '../models/apiGatewayHttp';

import {UserSubscription} from "../models/userSubscription";
import {Subscription} from "../models/subscription";
import {dynamoMapper, sendToSqsImpl} from "../utils/aws";
import {ItemNotFoundException} from "@aws/dynamodb-data-mapper";
import {catchClause} from "@babel/types";
import {getUserId, getIdentityToken} from "../utils/guIdentityApi";

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
        new Date(Date.now()).toISOString()
    )
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

function enqueueUnstoredPurchaseToken(subscriptionId: string, purchaseToken: string): Promise<string> {

    const queueUrl = process.env.QueueUrl;
    if (queueUrl === undefined) throw new Error("No QueueUrl env parameter provided");
    const packageName = "com.guardian"

    return subscriptionExists(purchaseToken).then(alreadyStored => {
        if(alreadyStored) {
            return purchaseToken
        } else {
            const sqsEvent = {
                packageName: packageName,
                purchaseToken: purchaseToken,
                subscriptionId: subscriptionId
            }
            return sendToSqsImpl(queueUrl, sqsEvent)
                .then(queud => purchaseToken)
        }
    })
        .catch(error => {
            console.log(`Error retrieving sub details ${error}`)
            throw error
        })
}

function persistUserSubscriptionLinks(userId: string, userSubscriptions: UserSubscriptionData[]): Promise<string[]>  {

    const updatedSubLinks = userSubscriptions.map( async (subscription) =>  {
        return await putUserSubscription(subscription.transactionToken, userId)
            .then( sub => {
                return enqueueUnstoredPurchaseToken(subscription.subscriptionId, subscription.transactionToken)
            })
            .catch( error => {
                console.log(`Error persisting subscription links. ${error}`)
                throw error
            })
    })

    return Promise.all(updatedSubLinks)
        .then(transactionTokens => transactionTokens)
        .catch(error => {
            console.log(`Unable to store subscription links: ${error}`)
            throw error
        })
}

export async function parseAndStoreLink (
    httpRequest: HTTPRequest,
    parsePayload: (requestBody?: string) => UserSubscriptionData[]
): Promise<HTTPResponse> {

    if(httpRequest.headers && getIdentityToken(httpRequest.headers)) {
        return getUserId(httpRequest.headers)
            .then( userId => {
                const subscriptions = parsePayload(httpRequest.body)
                return persistUserSubscriptionLinks(userId, subscriptions)
            })
            .then(subscriptionIds =>  {
                return HTTPResponses.OK
            })

            .catch(
                error => {
                    console.log(`Error creating subscription link: ${error}`)
                    return HTTPResponses.INTERNAL_ERROR
                }
            );
    } else {
        return HTTPResponses.INVALID_REQUEST
    }
}
