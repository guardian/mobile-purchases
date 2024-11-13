import 'source-map-support/register'
import {
    HTTPResponses,
    HttpRequestHeaders,
    PathParameters
} from '../models/apiGatewayHttp';
import {APIGatewayProxyEvent, APIGatewayProxyResult} from "aws-lambda";
import {fetchGoogleSubscription} from "../services/google-play";
import {fetchGoogleSubscriptionV2} from "../services/google-play-v2";
import {Subscription} from '../models/subscription';
import {fromGooglePackageName} from "../services/appToPlatform";
import {dateToSecondTimestamp, optionalMsToDate, thirtyMonths} from "../utils/dates";
import {SubscriptionEmpty} from "../models/subscription";
import {dynamoMapper} from "../utils/aws";
import {createHash} from 'crypto'

type SubscriptionStatus = {
    "subscriptionHasLapsed": boolean
    "subscriptionExpiryDate": Date
}

function getPurchaseToken(headers: HttpRequestHeaders): string | undefined {
    return headers["Play-Purchase-Token"] ?? headers["play-purchase-token"];
}

function getSubscriptionId(parameters: PathParameters | null): string | undefined {
    return parameters?.subscriptionId;
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
    const subscriptionId = getSubscriptionId(request.pathParameters);
    const packageName = googlePackageName(request.headers);

    if (purchaseToken && subscriptionId) {

        // We're testing the new implementation in production, but want to limit traffic through this codepath
        // This was turned off 2024-11-06 in an attempt to reduce our API quota usage
        // const roll = Math.floor(Math.random() * 100 + 1)
        // if (roll <= 0) {
        //     await updateParallelTestTable(purchaseToken, packageName)
        // }

        const purchaseTokenHash = createHash('sha256').update(purchaseToken).digest('hex')
        console.log(`Searching for valid ${subscriptionId} subscription for Android app with package name: ${packageName}, for purchaseToken hash: ${purchaseTokenHash}`)
        try {
            const subscriptionStatus = 
                await getSubscriptionStatusFromDynamo(purchaseToken, purchaseTokenHash) ?? 
                await getSubscriptionStatusFromGoogle(subscriptionId, purchaseToken, packageName, purchaseTokenHash)
            
            if (subscriptionStatus !== null) {
                return { statusCode: 200, body: JSON.stringify(subscriptionStatus) }
            } else {
                console.log(`No subscription found for purchaseToken hash: ${purchaseTokenHash}`)
                return HTTPResponses.NOT_FOUND;
            }
        } catch (error: any) {
            if (error.statusCode == 410) {
                console.log(`No subscription found for purchaseToken hash: ${purchaseTokenHash} (410-Gone from upstream API)`)
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


async function getSubscriptionStatusFromGoogle(subscriptionId: string, purchaseToken: string, packageName: string, purchaseTokenHash: string): Promise<SubscriptionStatus | null> {
    console.log(`Fetching subscription from Google for purchaseToken hash: ${purchaseTokenHash}`)
    const subscription = await fetchGoogleSubscription(subscriptionId, purchaseToken, packageName)
    const subscriptionExpiryDate = optionalMsToDate(subscription?.expiryTimeMillis)
    const googleSubscriptionStatus = subscriptionExpiryDate ? subscriptionStatus(subscriptionExpiryDate) : null
    console.log(`Google SubscriptionStatus for purchaseToken hash: ${purchaseTokenHash}: ${JSON.stringify(googleSubscriptionStatus)}`)
    return googleSubscriptionStatus
}

async function getSubscriptionStatusFromDynamo(purchaseToken: string, purchaseTokenHash: string): Promise<SubscriptionStatus | null> {
    try {
        console.log(`Fetching subscription from Dynamo for purchaseToken hash: ${purchaseTokenHash}`)
        let itemToQuery = new SubscriptionEmpty()
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

async function updateParallelTestTable(purchaseToken: string, packageName: string) {
    try {
        const googleSubscription =
            await fetchGoogleSubscriptionV2(purchaseToken, packageName)

        const subscription =
            new Subscription(
                purchaseToken,
                googleSubscription.startTime?.toISOString() ?? "",
                googleSubscription.expiryTime.toISOString(),
                googleSubscription.userCancellationTime?.toISOString(),
                googleSubscription.autoRenewing,
                googleSubscription.productId,
                fromGooglePackageName(packageName),
                googleSubscription.freeTrial,
                googleSubscription.billingPeriodDuration,
                googleSubscription,
                undefined,
                null,
                dateToSecondTimestamp(thirtyMonths(googleSubscription.expiryTime)),
                "subscriptions-parallel-test"
            )

        await dynamoMapper.put({item: subscription})
    } catch (err) {
        console.log(`ANDROID-PARALLEL-TEST: Error: ${JSON.stringify(err)}`)
    }
}

function subscriptionStatus(expiryDate: Date): SubscriptionStatus {
    const now = new Date(Date.now())
    return {
        "subscriptionHasLapsed": now > expiryDate,
        "subscriptionExpiryDate": expiryDate
    }
}
