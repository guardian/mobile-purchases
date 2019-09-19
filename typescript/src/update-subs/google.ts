import 'source-map-support/register'
import {SQSEvent, SQSRecord} from 'aws-lambda';
import * as restm from 'typed-rest-client/RestClient';
import {buildGoogleUrl, getAccessToken, getParams} from "../utils/google-play";

import {parseAndStoreSubscriptionUpdate} from './updatesub';
import {Stage} from "../utils/appIdentity";
import {Subscription} from "../models/subscription";
import {makeCancellationTime} from "./updatesub";
import {ProcessingError} from "../models/processingError";
import {dateToSecondTimestamp, thirtyMonths} from "../utils/dates";
import {GoogleSubscriptionReference} from "../models/subscriptionReference";

interface GoogleResponseBody {
    startTimeMillis: string,
    expiryTimeMillis: string,
    userCancellationTimeMillis: string,
    autoRenewing: boolean
}

const restClient = new restm.RestClient('guardian-mobile-purchases');

export function getGoogleSubResponse(record: SQSRecord): Promise<Subscription> {

    const sub = JSON.parse(record.body) as GoogleSubscriptionReference;
    const url = buildGoogleUrl(sub.subscriptionId, sub.purchaseToken, sub.packageName);
    return getAccessToken(getParams(Stage))
        .then(accessToken => {
            return restClient.get<GoogleResponseBody>(url, {additionalHeaders: {Authorization: `Bearer ${accessToken.token}`}})
        })
        .then(response => {
            if(response.result) {
                const expiryDate = new Date(Number.parseInt(response.result.expiryTimeMillis));
                return new Subscription(
                    sub.purchaseToken,
                    new Date(Number.parseInt(response.result.startTimeMillis)).toISOString(),
                    expiryDate.toISOString(),
                    makeCancellationTime(response.result.userCancellationTimeMillis),
                    response.result.autoRenewing,
                    sub.subscriptionId,
                    response.result,
                    undefined,
                    null,
                    dateToSecondTimestamp(thirtyMonths(expiryDate)),
                );
            } else {
                throw new ProcessingError("There was no data in google response", true);
            }
        })

}

export async function handler(event: SQSEvent) {
    const promises = event.Records.map(record => parseAndStoreSubscriptionUpdate(record, getGoogleSubResponse));
    
    return Promise.all(promises)
        .then(value  => {
            console.log(`Processed ${event.Records.length} subscriptions`);
            return "OK";
        })

}
