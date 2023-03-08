import {HTTPResponses} from '../models/apiGatewayHttp';
import {UserSubscription} from "../models/userSubscription";
import {ReadSubscription} from "../models/subscription";
import {dynamoMapper, sqs} from "../utils/aws";
import {getUserId, getAuthToken} from "../utils/guIdentityApi";
import {SubscriptionReference} from "../models/subscriptionReference";
import {SendMessageBatchRequestEntry} from "aws-sdk/clients/sqs";
import {ProcessingError} from "../models/processingError";
import {APIGatewayProxyEvent, APIGatewayProxyResult} from "aws-lambda";
import {UserIdResolution} from "../utils/guIdentityApi"
import {Stage} from "../utils/appIdentity";
import fetch from 'node-fetch';

export interface SubscriptionCheckData {
    subscriptionId: string
    subscriptionReference: SubscriptionReference
}

async function enqueueUnstoredPurchaseToken(subChecks: SubscriptionCheckData[]): Promise<number> {

    const dynamoResult = dynamoMapper.batchGet(subChecks.map(sub => new ReadSubscription().setSubscriptionId(sub.subscriptionId)));

    type IndexedSubscriptionCheckData = {[id: string]: SubscriptionCheckData};
    const indexedReferences: IndexedSubscriptionCheckData = subChecks.reduce((agg, value) => {
        agg[value.subscriptionId] = value;
        return agg
    }, {} as IndexedSubscriptionCheckData);

    // eliminate all known subscriptions
    for await (const result of dynamoResult) {
        delete indexedReferences[result.subscriptionId];
    }

    const refsToSend = Object.values(indexedReferences).map((value) => value.subscriptionReference);

    if (refsToSend.length > 0) {
        const queueUrl = process.env.QueueUrl;
        if (queueUrl === undefined) throw new Error("No QueueUrl env parameter provided");

        const sqsMessages: SendMessageBatchRequestEntry[] = refsToSend.map((subRef, index) => ({
            Id: index.toString(),
            MessageBody: JSON.stringify(subRef)
        }));

        const result = await sqs.sendMessageBatch({QueueUrl: queueUrl, Entries: sqsMessages}).promise();
        if (result.Failed && result.Failed.length > 0) {
            throw new ProcessingError("Unable to send all the subscription reference to SQS, will retry", true);
        }
        return result.Successful.length;
    } else {
        return 0;
    }

}

async function persistUserSubscriptionLinks(userSubscriptions: UserSubscription[]): Promise<number>  {
    let count = 0;
    for await (const r of dynamoMapper.batchPut(userSubscriptions)) {
        count++;
    }
    return count;
}

interface UserId {
    id: string
}

interface IdentityResponse {
    status: string,
    user: UserId
}

function consentPayload(): any {
   [
    {
       "id" : "your_support_onboarding",
       "consented" : true
     },
     {
       "id" : "similar_guardian_products",
       "consented" : true
     },
     {
       "id" : "supporter_newsletter",
       "consented" : true
     }
   ]
}

async function postSoftOptInConsent(identityId: string, identityToken: string): Promise<boolean> {
    var url = `http://idapi.code.dev-theguardian.com/${identityId}/consents`
    if (Stage === "PROD") {
        url = `https://idapi.theguardian.com/user/${identityId}/consents`
    }
    const params = {
        method: 'PATCH',
        body: JSON.stringify(consentPayload()),
        headers: {
            Authorization: `Bearer ${identityToken}`,
            'Content-type': 'application/json',
        }
    }
    try {
        return fetch(url, params)
            .then((response) => {
                if (response.status == 200) {
                    return true;
                } else {
                    console.warn(`Warning, status: ${response.status}, while posting consent data for user ${identityId}`);
                    return false
                }
            })
    } catch (error) {
        console.warn(`Error while posting consent data for user ${identityId}`);
        console.warn(error);
        return Promise.resolve(false);
    }
}

async function shouldPostSoftOptInConsent(subscriptionId: string): Promise<boolean> {
    // Write code....
    return Promise.resolve(false);
}

async function updateDynamoTable(subcriptionId: string): Promise<null> {
    // Write code....
    return Promise.resolve(null);
}

const soft_opt_in_v1_active: boolean = false;

/*
    Date: March 2023, 6th
    Author: Pascal

    Introduced the `soft_opt_in_v1_active` variable above to guard against
    the effect of the Soft Opt In patch code until it's time to go live.
*/

export async function parseAndStoreLink<A, B>(
    httpRequest: APIGatewayProxyEvent,
    parsePayload: (request: APIGatewayProxyEvent) => A,
    toUserSubscription: (userId: string, payload: A) => UserSubscription[],
    toSqsPayload: (payload: A) => SubscriptionCheckData[]
): Promise<APIGatewayProxyResult> {
    try {
        if (httpRequest.headers && getAuthToken(httpRequest.headers)) {
            const payload: A = parsePayload(httpRequest);
            const resolution: UserIdResolution = await getUserId(httpRequest.headers);
            switch(resolution.status) {
                case "incorrect-token": {
                    return HTTPResponses.UNAUTHORISED;
                }
                case "incorrect-scope": {
                    return HTTPResponses.FORBIDDEN;
                }
                case "missing-identity-id": {
                    return HTTPResponses.INVALID_REQUEST;
                }
                case "success": {
                    const userId = resolution.userId as string;

                    const insertCount = await persistUserSubscriptionLinks(toUserSubscription(userId, payload));
                    const sqsCount = await enqueueUnstoredPurchaseToken(toSqsPayload(payload));
                    console.log(`Put ${insertCount} links in the DB, and sent ${sqsCount} subscription refs to SQS`);

                    if (soft_opt_in_v1_active) {

                        /*

                            Soft Opt-In project (version 1)

                            Date: March 2023, 1st
                            Author: Pascal

                            ### Context

                            At the time these lines are written the Engine team and friends from Retention are
                            working on the Soft Opt-In project, and more exactly what is known as "version/stage 1"
                            of that project.

                            The effect for mobile-purchases, is that we are asked to send a payload to the identity API
                            for each acquisition notification from the users mobile apps hitting the endpoints
                                /google/linkToSubscriptions
                                /google/linkToSubscriptions

                            This change is... temporary and a stepping stone to what is going to be version 1.5
                            and then later on version 2.

                            ### Specifications

                            In this current HTTP request we have a contextual user (corresponding to the userId
                            which was extracted during authentication) as well as an array of subscriptions from the
                            request payload. We have the requirement to

                            """
                            look up soft opt in consent status for each
                            subscription and only post consent data against the user if for one of those subscriptions
                            that look up return the right value.
                            """

                            The type of the payload depends on the platform. It's AppleLinkPayload for iOS
                            and GoogleLinkPayload for android. Working from the payload here would not be
                            practical, but since we are only after the subscriptionId, we can read it in both cases
                            from a UserSubscription.

                            Note that toUserSubscription(userId, payload) return an array of such subscriptions
                        */

                        // We want reading in sequence from here:
                        // https://stackoverflow.com/questions/37576685/using-async-await-with-a-foreach-loop

                        var consent_data_has_been_posted = false;

                        for (const subscription of toUserSubscription(userId, payload)){
                            if (!consent_data_has_been_posted) {
                                if (await shouldPostSoftOptInConsent(subscription.subscriptionId)) {
                                    const userAuthenticationToken = getAuthToken(httpRequest.headers) as string;
                                    await postSoftOptInConsent(userId, userAuthenticationToken)
                                    console.log(`Posted consent data for user ${userId}`);
                                    await updateDynamoTable(subscription.subscriptionId)
                                    consent_data_has_been_posted = true
                                }
                            }
                        }
                    }

                    return HTTPResponses.OK;
                }
            }
        } else {
            return HTTPResponses.INVALID_REQUEST
        }
    } catch (error) {
        console.error("Internal Server Error", error);
        const message = (error as Error).message
        if (typeof message === "string" && message.includes("Provided list of item keys contains duplicates")) {
            console.error("Request body: " + (httpRequest.body ?? ""))
        }
        return HTTPResponses.INTERNAL_ERROR
    }
}
