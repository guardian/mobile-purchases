import {Platform} from "../models/platform";
import {UserSubscriptionData} from "./link";
import {HTTPRequest, HTTPResponse} from "../models/apiGatewayHttp";
import {parseAndStoreLink} from "./link"

type AppleSubscription = {
    reciept: string
    subscriptionId: string
}

type AppleLinkPayload = {
    platform: Platform.DailyEdition | Platform.Ios,
    subscriptions: [AppleSubscription]
}

export function parseAppleLinkPayload(requestBody?: string): UserSubscriptionData[] {
    const payload = JSON.parse(requestBody || "") as AppleLinkPayload
    return payload.subscriptions.map ( subscription => new UserSubscriptionData(subscription.reciept, subscription.subscriptionId))
}

export async function handler(httpRequest: HTTPRequest): Promise<HTTPResponse>  {
    return parseAndStoreLink(httpRequest, parseAppleLinkPayload)
}




