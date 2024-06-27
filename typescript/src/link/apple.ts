import 'source-map-support/register'

import {parseAndStoreLink, SubscriptionCheckData} from "./link";
import {UserSubscription} from "../models/userSubscription";
import {APIGatewayProxyEvent, APIGatewayProxyResult} from "aws-lambda";
import {parseAppleLinkPayload} from "./apple-utils"
import {AppleLinkPayload} from "./apple-utils"
import { Platform } from '../models/platform';

function toUserSubscription(userId: string, payload: AppleLinkPayload): UserSubscription[] {
    const now = new Date().toISOString()
    return payload.subscriptions.map(sub => new UserSubscription(
        userId,
        sub.originalTransactionId,
        now
    ));
}

function toSqsPayload(payload: AppleLinkPayload): SubscriptionCheckData[] {
    // The link endpoint is used for iOS Feast in a specific scenario - where
    // the user takes out an IAP with a promo code. In this case we've found
    // that the appAccountToken, which we usually use for Feast to link users
    // with IAPs, isn't set. So instead in this specific scenario the Feast app
    // uses the link endpoint. The link endpoint does two things - it creates
    // the user subscription record, and also possibly queues the subscription
    // lookup (pushes onto the SQS queue for the update subs lambda). I don't
    // think this needs to happen for Feast. Furthermore, it's hard to support
    // because the credentials used for lookup in the non-Feast case are
    // different than other apps and in the update subs lambda we don't
    // currently know which app the subscription is for (hence having separate
    // lambdas for Feast and everything else). We _could_ push onto the Feast
    // update subs queue but we know that's going to fail in the user lookup
    // part, due to the aforementioned lack of appAccountToken. So I think the
    // easiest solution for now is just not to enqueue Feast subs for lookup.
    if (payload.platform === Platform.IosFeast) {
        console.log("Not enqueuing Feast subs for lookup");
        return [];
    }

    return payload.subscriptions.map(sub => ({
        subscriptionId: sub.originalTransactionId,
        subscriptionReference: {
            receipt: sub.receipt
        }
    }))
}

export async function handler(httpRequest: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    return parseAndStoreLink(
        httpRequest,
        parseAppleLinkPayload,
        toUserSubscription,
        toSqsPayload
    )
}
