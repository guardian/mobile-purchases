import {HTTPResponses} from '../models/apiGatewayHttp';
import {UserSubscription} from "../models/userSubscription";
import {ReadSubscription} from "../models/subscription";
import {dynamoMapper, putMetric, sqs} from "../utils/aws";
import {getUserId, getAuthToken, getIdentityApiKey} from "../utils/guIdentityApi";
import {SubscriptionReference} from "../models/subscriptionReference";
import {SendMessageBatchRequestEntry} from "aws-sdk/clients/sqs";
import {ProcessingError} from "../models/processingError";
import {APIGatewayProxyEvent, APIGatewayProxyResult} from "aws-lambda";
import {UserIdResolution} from "../utils/guIdentityApi";
import {SoftOptInLog} from "../models/softOptInLogging";
import fetch from 'node-fetch';
import {Response} from 'node-fetch';
import {getConfigValue} from "../utils/ssmConfig";

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

async function postSoftOptInConsentToIdentityAPI(identityId: string, identityApiKey: string): Promise<boolean> {
    const domain = await getConfigValue<string>("mp-soft-opt-in-identity-user-consent-domain-url");
    const url = `${domain}/users/${identityId}/consents`;

    const params = {
        method: 'PATCH',
        body: JSON.stringify(consentPayload()),
        headers: {
            Authorization: `Bearer ${identityApiKey}`,
            'Content-type': 'application/json',
        }
    }
    try {
        console.log(`url ${url}`);

        return fetch(url, params)
            .then((response: Response) => {
                if (response.ok) {
                    return true;
                } else {
                    console.warn(`warning, status: ${response.status}, while posting consent data for user ${identityId}`);
                    return false
                }
            })
    } catch (error) {
        console.warn(`error while posting consent data for user ${identityId}`);
        console.warn(error);
        await putMetric("failed_consents_updates", 1)
        return Promise.resolve(false);
    }
}

function softOptInQueryParameterIsPresent(httpRequest: APIGatewayProxyEvent): boolean {
    // soft-opt-in-notification-shown=true
    // https://aws.amazon.com/premiumsupport/knowledge-center/pass-api-gateway-rest-api-parameters/
    // https://docs.aws.amazon.com/apigateway/latest/developerguide/integrating-api-with-aws-services-lambda.html
    // https://github.com/DefinitelyTyped/DefinitelyTyped/issues/46689
    // console.log(`httpRequest.multiValueQueryStringParameters: ${JSON.stringify(httpRequest.multiValueQueryStringParameters)}`);
    // we get it as: {"soft-opt-in-notification-shown":["true"]}
    if (httpRequest.multiValueQueryStringParameters === null) {
        return false;
    }
    if (typeof httpRequest.multiValueQueryStringParameters["soft-opt-in-notification-shown"] === "undefined") {
        return false;
    }
    if (httpRequest.multiValueQueryStringParameters["soft-opt-in-notification-shown"].length == 0) {
        return false
    }
    return httpRequest.multiValueQueryStringParameters["soft-opt-in-notification-shown"][0] === "true"
}

async function updateDynamoLoggingTable(identityId: string) {
    const timestamp = new Date().getTime();
    const record = new SoftOptInLog(identityId, "v1 - no subscription id", timestamp, "soft opt-ins processed for acquisition");

    try {
        await dynamoMapper.put({item: record});
        console.log(`logged soft opt-in setting to Dynamo`);
    } catch (error) {
        console.warn(error);
        console.warn(`dynamo write failed for record: ${record}`);
        await putMetric("failed_consents_updates", 1)
    }
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
                    console.log(`put ${insertCount} links in the DB, and sent ${sqsCount} subscription refs to SQS`);

                    if (soft_opt_in_v1_active) {
                        console.log(`entering soft opt in version 1`);

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
                                /apple/linkToSubscriptions
                                /google/linkToSubscriptions

                            This change is... temporary and a stepping stone to what is going to be version 1.5
                            and then later on version 2.

                            ### Specifications

                            The trigger for the soft opt in will be the following query parameter:
                            ```
                            soft-opt-in-notification-shown=true
                            ```

                            In this current HTTP request we have a contextual user (corresponding to the userId
                            which was extracted during authentication) as well as an array of subscriptions
                            from the request payload. We want to update the dynamo table with soft opt in
                            information for the subscriptions that have not yet been soft opted in, and we
                            also post a consent object to the Identity API (once) if at least one of those
                            subscriptions needed to be soft opted in.

                            ### Implementation details.

                            The type of the payload depends on the platform. It's AppleLinkPayload for iOS
                            and GoogleLinkPayload for android. Working from the payload here would not be
                            practical, but since we are only after the subscriptionId, we can read it in both cases
                            from a UserSubscription.

                            Note that toUserSubscription(userId, payload) return an array of such subscriptions

                            ### Why using a metric driven alerting instead of erroring ?

                            These end points have a very strict contract with the mobile apps about which HTTP
                            error codes to return in which situation, therefore there should not really be any uncaught
                            error that filter up to the clients.

                            ### Identity API

                            We are using and have created mp-soft-opt-in-identity-api-key just for this.
                            We could not use the userAuthenticationToken to post the consent object to Identity
                            because it doesn't carry the right scopes.

                        */

                        if (softOptInQueryParameterIsPresent(httpRequest)) {
                            console.log(`softOptInQueryParameterIsPresent`);
                            // const userAuthenticationToken = getAuthToken(httpRequest.headers) as string;
                            const subscriptionsFromHttpPayload = toUserSubscription(userId, payload);

                            const identityApiKey = await getIdentityApiKey();

                            if (subscriptionsFromHttpPayload.length > 0) {
                                console.log(`posting consent data for user ${userId}`);
                                await postSoftOptInConsentToIdentityAPI(userId, identityApiKey);
                                console.log(`posted consent data for user ${userId}`);

                                await updateDynamoLoggingTable(userId);
                            } else {
                                console.warn(`soft opt-ins v1 - no subscriptions found in the HTTP payload`);
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
