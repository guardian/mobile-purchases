import {SQSEvent, SQSRecord} from 'aws-lambda'
import * as restm from 'typed-rest-client/RestClient';
import {buildGoogleUrl, getAccessToken, getParams, AccessToken} from "../utils/google-play";
import {SubscriptionUpdate} from "./updatesub";

import {parseAndStoreSubscriptionUpdate} from './updatesub'
import {Stage} from "../utils/appIdentity";
import {Subscription} from "aws-sdk/clients/inspector";
import {GoogleSubscription} from "../models/subscription";
import {makeCancellationTime, makeTimeToLive} from "./updatesub";
import {isUndefined} from "util";


interface GoogleSub {
    packageName: string,
    purchaseToken: string,
    subscriptionId: string
}

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
                console.log(`Error trying to parsse autorenewing boolean`)
                return undefined;
            }
        }
        else  {
            return undefined;
        }

}

export function getGoogleSubResponse(record: SQSRecord): Promise<GoogleSubscription> {

    const sub = JSON.parse(record.body) as GoogleSub
    const url = buildGoogleUrl(sub.subscriptionId, sub.purchaseToken, sub.packageName)
    return getAccessToken(getParams(Stage))
        .then(accessToken => {
            return restClient.get<GoogleResponseBody>(url, {additionalHeaders: {Authorization: `Bearer ${accessToken.token}`}})
        })
        .then(response => {
            if(response.result) {
                return new GoogleSubscription(
                    sub.purchaseToken,
                    response.result.startTimeMillis,
                    response.result.expiryTimeMillis,
                    response.result.userCancellationTimeMillis,
                    response.result.autoRenewing,
                    response.result)
            } else {
                throw Error("There was no data in google response")
            }
        })
        .catch( error => {
            throw error
        })

}

export async function handler(event: SQSEvent) {
    const emptyPromises = event.Records.map(async (record) => {
        await parseAndStoreSubscriptionUpdate(record, getGoogleSubResponse)
    });
    
    return Promise.all(emptyPromises)
        .then(value  => {
            console.log(`Processed ${event.Records.length} subscriptions`)
            "OK"
        })
        .catch(error => {
            console.error("Error processing subsctption update: ", error)
            return "Error"
        })

}