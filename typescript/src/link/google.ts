import {Platform} from "../models/platform";
import {parseAndStoreLink, UserSubscriptionData} from "./link";
import {HTTPRequest, HTTPResponse} from "../models/apiGatewayHttp";
import {parseAppleLinkPayload} from "./apple";

type GoogleSubscription = {
    purchaseToken: string
    subscriptionId: string
}

type GoogleLinkPayload = {
    platform: Platform.Android,
    subscriptions: [GoogleSubscription]
}

export function parseGoogleLinkPayload(requestBody?: string): UserSubscriptionData[] {
    const payload = JSON.parse(requestBody || "") as GoogleLinkPayload
    return payload.subscriptions.map ( subscription => new UserSubscriptionData(subscription.purchaseToken, subscription.subscriptionId))
}

export async function handler(httpRequest: HTTPRequest): Promise<HTTPResponse>  {
    return parseAndStoreLink(httpRequest, parseGoogleLinkPayload)
}
