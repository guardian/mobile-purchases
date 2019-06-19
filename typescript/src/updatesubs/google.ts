import {SQSEvent, SQSRecord} from 'aws-lambda'
import * as restm from 'typed-rest-client/RestClient';
import {buildGoogleUrl, getAccessToken, getParams} from "../utils/google-play";
import {SubscriptionUpdate} from "./updatesub";
import {parseAndStoreSubscriptionUpdate} from './updatesub'

interface GoogleSub {
    packageName: string,
    purchaseToken: string,
    subscriptionId: string
}

interface GoogleResponseBody {
    startTimeMillis: string,
    expiryTimeMillis: string,
    userCancellationMillis:string,
    autoRenewing: boolean
}

const restClient = new restm.RestClient('guardian-mobile-purchases');

export function getGoogleSubResponse(record: SQSRecord): Promise<SubscriptionUpdate> {

    const sub = JSON.parse(record.body) as GoogleSub
    const url = buildGoogleUrl(sub.subscriptionId, sub.purchaseToken, sub.packageName)
    return getAccessToken(getParams("CODE"))
        .then(accessToken =>
            restClient.get<GoogleResponseBody>(url, {additionalHeaders: {Authorization: `Bearer ${accessToken.token}`}})
        )
        .then(response => {
            console.log("Got google data");
            if(response.result) {
                return new SubscriptionUpdate(
                    sub.purchaseToken,
                    response.result.startTimeMillis,
                    response.result.expiryTimeMillis,
                    response.result.userCancellationMillis,
                    response.result.autoRenewing,
                    response.result)
            } else {
                throw Error("No data in google response")
            }
        })
        .catch( error => {
            console.log("Got google data");
            throw error
        })
}



export async function handler(event: SQSEvent) {

    event.Records.forEach((record) => {
        parseAndStoreSubscriptionUpdate(record, getGoogleSubResponse)
    })
}