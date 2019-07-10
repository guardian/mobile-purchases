import {Platform} from "../models/platform";
import {UserSubscriptionData} from "./link";
import {HTTPRequest, HTTPResponse, HTTPResponses} from "../models/apiGatewayHttp";
import {parseAndStoreLink} from "./link"
import {parseGoogleLinkPayload} from "./google";

type AppleSubscription = {
    reciept: string
    transactionId: string
}

type AppleLinkPayload = {
    platform: Platform.DailyEdition | Platform.Ios,
    subscriptions: [AppleSubscription]
}

export function parseAppleLinkPayload(requestBody?: string): UserSubscriptionData[] {
    const payload = JSON.parse(requestBody || "") as AppleLinkPayload
    return payload.subscriptions.map ( subscription => new UserSubscriptionData(subscription.reciept, subscription.transactionId) )
}

export async function handler(httpRequest: HTTPRequest)  {
    return parseAndStoreLink(httpRequest, parseAppleLinkPayload)
        .catch( error => {
            console.log(`Error linking sub: ${error}`)
            return HTTPResponses.INTERNAL_ERROR
        })
}




