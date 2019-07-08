import {
    HTTPRequest,
    HttpRequestHeaders,
    HTTPResponse,
    HTTPResponseHeaders,
    HTTPResponses,
    PathParameters

} from '../models/apiGatewayHttp';

import * as restm from "typed-rest-client/RestClient";
import {UserSubscription} from "../models/userSubscription";
import {Subscription} from "../models/subscription";
import {Platform} from "../models/platform";
import {dynamoMapper, sendToSqsImpl} from "../utils/aws";
import {classBody, returnStatement} from "@babel/types";
import {ItemNotFoundException} from "@aws/dynamodb-data-mapper";
import {SqsEvent} from "../models/aws/sqs";



const restClient = new restm.RestClient('guardian-mobile-purchases');

type LinkPayload = AppleLinkPayload | GoogleLinkPayload

type AppleLinkPayload = {
   platform: Platform.DailyEdition | Platform.Ios,
   reciepts: [string]
}

type GoogleLinkPayload = {
    platform: Platform.Android,
    purchaseTokens: [string]
}

interface UserId {
    id: string
}

interface IdentityResponse {
    status: string,
    user: UserId
}

function getPurchaseToken(headers: HttpRequestHeaders): string {
    return headers["Play-Purchase-Token"] || headers["play-purchase-token"]
}

function getIdentityToken(headers: HttpRequestHeaders): string {
    return headers["Gu-Identity-Token"] || headers["gu-identity-token"]
}


function getUserId(headers: HttpRequestHeaders) : Promise<string> {
    const url = "https://id.guardianapis.com/user/me"
    const identityToken = getIdentityToken(headers)
    return restClient.get<IdentityResponse>(url, {additionalHeaders: {Authorization: `Bearer ${identityToken}`}})
        .then( res => {
            if (res.result) {
                console.log(`The user id id ${res.result.user.id}`)
                return res.result.user.id
            }
            else {
                console.log("No user id found in identity")
                throw Error("No user id found")
            }
        })
        .catch( error => {
            console.log("Error trying to retrieve user id from identity api")
            throw error
        })
}

function getPurchaseTokens(requestBody?: string): string[] {
    const payload = JSON.parse(requestBody || "") as LinkPayload
    switch (payload.platform) {
        case Platform.Ios:
        case Platform.DailyEdition:
            console.log(`ios payload: ${payload}`)
            return payload.reciepts
        case Platform.Android:
            console.log(`android payload: ${payload}`)
            return payload.purchaseTokens
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

function getSubscription(purchaseToken: string): Promise<boolean> {
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

    const packageName = "com.guardian"

    return getSubscription(purchaseToken).then( alreadyStored => {
        if(alreadyStored) {
            return purchaseToken
        } else {
           const sqsEvent = makeSqsEvent(packageName, purchaseToken, subscriptionId)
           return sendToSqsImpl(sqsEvent).
               then(queud => purchaseToken)
               .catch(
                   error => {
                       throw error
                   }
               )
        }
    })
    .catch(  error => {
        console.log(`Error retrieving sub details ${error}`)
        throw error
    })
}

function persistUserSubscriptionLinks(userId: string, subscriptionId: string, body?: string): Promise<string[]>  {
    let purchaseTokens = getPurchaseTokens(body);
    const updatedSubLinks = purchaseTokens.map( async (purchaseToken) =>  {
        await putUserSubscription(purchaseToken, userId)
            .then( sub => {
                return enqueueUnstoredPurchaseToken(subscriptionId, purchaseToken)
             })


    })
    return Promise.all(updatedSubLinks)
        .then(value => purchaseTokens)
        .catch(error => {
            console.log(`Unable to store subscription links ${error}`)
            throw error
        })

}


function makeSqsEvent(packageName: string, purchaseToken: string, subscriptionId: string) : SqsEvent  {
    return {
        packageName: packageName,
        purchaseToken: purchaseToken,
        subscriptionId: subscriptionId

    }
}


export async function handler(httpRequest: HTTPRequest): Promise<HTTPResponse> {

    if(httpRequest.pathParameters && httpRequest.headers && getIdentityToken(httpRequest.headers)) {
        const subscriptionId = httpRequest.pathParameters.subscriptionId;
        return getUserId(httpRequest.headers)
            .then( userId => {
                persistUserSubscriptionLinks(userId, subscriptionId, httpRequest.body)
            })
            .then(subscriptionIds =>  {
                return HTTPResponses.OK
            })

            .catch(
                error => {
                    console.log(`Error creating subscription link: ${error}`)
                    return HTTPResponses.NOT_FOUND
                }
            );
    } else {
        return HTTPResponses.INVALID_REQUEST
    }

}
