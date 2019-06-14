import Sqs from 'aws-sdk/clients/sqs';
import {SQSEvent, SQSRecord} from 'aws-lambda'
import * as restm from 'typed-rest-client/RestClient';
import {buildGoogleUrl, getAccessToken, getParams} from "../utils/google-play";


interface GoogleSub {
    packageName: string,
    purchaseToken: string,
    subscriptionId: string
}

interface GoogleResponseBody {
    expiryTimeMillis: string
}


const restClient = new restm.RestClient('guardian-mobile-purchases');

export async function handler(event: SQSEvent) {

    event.Records.forEach( (rec) => {
        console.log("Body: " + rec.body)
        const sub = JSON.parse(rec.body) as GoogleSub
        console.log(`package: ${sub.packageName} purchaseToken ${sub.purchaseToken} sub: ${sub.subscriptionId}`)
        const url = buildGoogleUrl(sub.subscriptionId, sub.purchaseToken, sub.packageName)
        getAccessToken(getParams("CODE"))
            .then(accessToken =>
                restClient.get<GoogleResponseBody>(url, {additionalHeaders: {Authorization: `Bearer ${accessToken.token}`}})
            )
            .then(response => {
                if(response.result) {
                    console.log(`Got result from google: ${response.result}`)
                }
                else {
                    console.log("Could not get sub from goodle")
                }
            })
    })
}