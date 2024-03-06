import 'source-map-support/register'
import {
    HTTPResponses,
    HttpRequestHeaders
} from '../models/apiGatewayHttp';
import {APIGatewayProxyEvent, APIGatewayProxyResult} from "aws-lambda";
import {fetchGoogleSubscription} from "../services/google-play";
import {ReadSubscription} from "../models/subscription";
import {dynamoMapper} from "../utils/aws";
import {createHash} from 'crypto'

type SubscriptionStatus = {
    "subscriptionHasLapsed": boolean
    "subscriptionExpiryDate": Date
}

function getPurchaseToken(headers: HttpRequestHeaders): string | undefined {
    return headers["Play-Purchase-Token"] ?? headers["play-purchase-token"];
}

function googlePackageName(headers: HttpRequestHeaders): string {
    const packageNameFromHeaders = headers["Package-Name"] ?? headers["package-name"];
    if (packageNameFromHeaders) {
        return packageNameFromHeaders;
    } else {
        return "com.guardian";
    }
}

export async function handler(request: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {

    const purchaseToken = getPurchaseToken(request.headers);
    const packageName = googlePackageName(request.headers);

    if (purchaseToken) {
        const purchaseTokenHash = createHash('sha256').update(purchaseToken).digest('hex')
        console.log(`Searching for valid subscription for Android app with package name: ${packageName}, for purchaseToken hash: ${purchaseTokenHash}`)
        try {
            const subscriptionStatus = 
                await getSubscriptionStatusFromDynamo(purchaseToken, purchaseTokenHash) ?? 
                await getSubscriptionStatusFromGoogle(purchaseToken, packageName, purchaseTokenHash)
            
            if (subscriptionStatus !== null) {
                return { statusCode: 200, body: JSON.stringify(subscriptionStatus) }
            } else {
                console.log(`No subscription found for purchaseToken hash: ${purchaseTokenHash}`)
                return HTTPResponses.NOT_FOUND;
            }
        } catch (error: any) {
            if (error.status == 404 || error.status == 410) {
                console.log(`No subscription found for purchaseToken hash: ${purchaseTokenHash} (${error.status} from upstream API)`)
                return HTTPResponses.NOT_FOUND
            } else {
                console.log(`Serving an Internal Server Error due to: ${error.toString().split('/tokens/')[0]}`)
                return HTTPResponses.INTERNAL_ERROR
            }
        }
    } else {
        return HTTPResponses.INVALID_REQUEST
    }
}

async function getSubscriptionStatusFromGoogle(purchaseToken: string, packageName: string, purchaseTokenHash: string): Promise<SubscriptionStatus> {
    console.log(`Fetching subscription from Google for purchaseToken hash: ${purchaseTokenHash}`)
    const subscription = await fetchGoogleSubscription(purchaseToken, packageName)
    const googleSubscriptionStatus = subscriptionStatus(subscription.expiryTime)
    console.log(`Google SubscriptionStatus for purchaseToken hash: ${purchaseTokenHash}: ${JSON.stringify(googleSubscriptionStatus)}`)
    return googleSubscriptionStatus
}

async function getSubscriptionStatusFromDynamo(purchaseToken: string, purchaseTokenHash: string): Promise<SubscriptionStatus | null> {
    try {
        console.log(`Fetching subscription from Dynamo for purchaseToken hash: ${purchaseTokenHash}`)
        let itemToQuery = new ReadSubscription()
        itemToQuery.setSubscriptionId(purchaseToken)
        const subscription = await dynamoMapper.get(itemToQuery)
        const subscriptionExpiryDate = new Date(subscription.endTimestamp)
        const dynamoSubscriptionStatus = subscriptionStatus(subscriptionExpiryDate)
        console.log(`Dynamo SubscriptionStatus for purchaseToken hash: ${purchaseTokenHash}: ${JSON.stringify(dynamoSubscriptionStatus)}`)
        return dynamoSubscriptionStatus
    } catch (error: any) {
        if (error.name === 'ItemNotFoundException') {
            console.log(`No subscription found in Dynamo with purchaseToken hash: ${purchaseTokenHash}`)
        } else {
            console.log(`The following Dynamo error occurred when attempting to retrieve a subscription with purchaseToken hash: ${purchaseTokenHash}: ${error}`)
        }
        // All exceptions are swallowed here as we fall-back on the Google API for all failure modes (including cache misses)
        return null
    }
}

function subscriptionStatus(expiryDate: Date): SubscriptionStatus {
    const now = new Date(Date.now())
    return {
        "subscriptionHasLapsed": now > expiryDate,
        "subscriptionExpiryDate": expiryDate
    }
}
