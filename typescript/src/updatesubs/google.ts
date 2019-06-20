process.on('uncaughtException', function (err) { console.log(err); })               
import {SQSEvent, SQSRecord} from 'aws-lambda'
import * as restm from 'typed-rest-client/RestClient';
import {buildGoogleUrl, getAccessToken, getParams, AccessToken} from "../utils/google-play";
import {SubscriptionUpdate} from "./updatesub";
import {Stage} from "../utils/appIdentity";


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


export async function getGoogleSubResponse(record: SQSRecord, accessToken: AccessToken): Promise<SubscriptionUpdate> {

    try {
        const sub = JSON.parse(record.body) as GoogleSub
        const url = buildGoogleUrl(sub.subscriptionId, sub.purchaseToken, sub.packageName);
        const restClient = new restm.RestClient('guardian-mobile-purchases');
        console.log("Stage: " + Stage)
        return restClient.get<GoogleResponseBody>(url, {additionalHeaders: {Authorization: `Bearer ${accessToken.token}`}})
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
                    throw Error("No data in google response");
                }
            })
            .catch( error => {
                console.log("Got google data");
                throw error
            })
    } catch (e) {
        console.log(`Error: ${e}`)
        return new Promise<SubscriptionUpdate>((resolve, reject) =>
            resolve(new SubscriptionUpdate("", "","", "", false, "")))
    }

}



export async function handler(event: SQSEvent) {

    const accessToken = getAccessToken(getParams(Stage || ""))
    accessToken.then( at => {
        event.Records.forEach((record) => {
            parseAndStoreSubscriptionUpdate(record, at, getGoogleSubResponse)
        })
    })
        .catch(error => {
            console.log(`Error retrieving access token: ${error}`)
        })
}