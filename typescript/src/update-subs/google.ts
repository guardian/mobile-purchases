import 'source-map-support/register'
import {SQSEvent, SQSRecord} from 'aws-lambda';
import * as restm from 'typed-rest-client/RestClient';
import {buildGoogleUrl, getAccessToken, getParams} from "../utils/google-play";

import {parseAndStoreSubscriptionUpdate} from './updatesub';
import {Stage} from "../utils/appIdentity";
import {GoogleSubscription} from "../models/subscription";
import {makeCancellationTime, makeTimeToLive} from "./updatesub";
import {GoogleSubscriptionReference} from "../models/googleSubscriptionReference";

interface GoogleResponseBody {
    startTimeMillis: string,
    expiryTimeMillis: string,
    userCancellationTimeMillis: string,
    autoRenewing: boolean
}

const restClient = new restm.RestClient('guardian-mobile-purchases');

function parseAutoRenewing(autoRenewing: string | undefined) : boolean | undefined {

        if(autoRenewing) {
            try {
                return JSON.parse(autoRenewing)
            } catch (e) {
                console.log(`Error trying to parsse autorenewing boolean`);
                return undefined;
            }
        }
        else  {
            return undefined;
        }

}

export function getGoogleSubResponse(record: SQSRecord): Promise<GoogleSubscription> {

    const sub = JSON.parse(record.body) as GoogleSubscriptionReference;
    const url = buildGoogleUrl(sub.subscriptionId, sub.purchaseToken, sub.packageName);
    return getAccessToken(getParams(Stage))
        .then(accessToken => {
            return restClient.get<GoogleResponseBody>(url, {additionalHeaders: {Authorization: `Bearer ${accessToken.token}`}})
        })
        .then(response => {
            if(response.result) {
                return new GoogleSubscription(
                    sub.purchaseToken,
                    new Date(Number.parseInt(response.result.startTimeMillis)).toISOString(),
                    new Date(Number.parseInt(response.result.expiryTimeMillis)).toISOString(),
                    makeCancellationTime(response.result.userCancellationTimeMillis),
                    response.result.autoRenewing,
                    sub.subscriptionId,
                    makeTimeToLive(new Date(Date.now())),
                    response.result
                );
            } else {
                throw Error("There was no data in google response");
            }
        })
        .catch( error => {
            throw error;
        })

}

export async function handler(event: SQSEvent) {
    const emptyPromises = event.Records.map(async (record) => {
        await parseAndStoreSubscriptionUpdate(record, getGoogleSubResponse)
    });
    
    return Promise.all(emptyPromises)
        .then(value  => {
            console.log(`Processed ${event.Records.length} subscriptions`);
            return "OK";
        })
        .catch(error => {
            console.error("Error processing subsctption update: ", error);
            return "Error";
        })

}