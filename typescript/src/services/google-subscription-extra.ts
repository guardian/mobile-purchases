import type S3 from 'aws-sdk/clients/s3';
import aws = require('../utils/aws');

// Author: Pascal
// This file was introduced in July 2025 to implement the service that queries the Google API
// to retrieve subscription and subscription product metadata in order to populate
// the `extra` field for android records.

// -----------------------------------------------

export interface AccessToken {
    token: string;
    date: Date;
}

export function getParams(stage: string): S3.Types.GetObjectRequest {
    return {
        Bucket: 'gu-mobile-access-tokens',
        Key: `${stage}/google-play-developer-api/access_token.json`,
    };
}

export function getAccessToken(stage: string): Promise<AccessToken> {
    const params: S3.Types.GetObjectRequest = getParams(stage);
    return aws.s3
        .getObject(params)
        .promise()
        .then((s3OutPut) => {
            if (s3OutPut.Body) {
                return JSON.parse(s3OutPut.Body.toString());
            } else {
                throw Error('S3 output body was not defined');
            }
        })
        .catch((error) => {
            console.log(`Failed to get access token from S3 due to: ${error}`);
            throw error;
        });
}

interface GoogleSubscription {
    kind: string;
    startTime: string;
    regionCode: string;
    subscriptionState: string;
    latestOrderId: string;
    acknowledgementState: string;
}

const extractGoogleSubscription = async (
    accessToken: AccessToken,
): Promise<GoogleSubscription | undefined> => {
    console.log(`[e0b04200] query google api for subscription`);

    // Sample data for the moment
    const packageName = 'com.guardian';
    const purchaseToken =
        'kadmieppmanincgeejahkkbp.AO-J1OywsudKktRZAd2tqgY9rTw-FXFujNuNHTokG7bia7jqZEox_xAj7Jb0Y8b3uSoW2ewDhT6FMla_ExAtQObAmHo53tmIjw';

    const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${packageName}/purchases/subscriptionsv2/tokens/${purchaseToken}`;
    console.log(`[26b172df] url: ${url}`);

    const params = {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken.token}`,
        },
    };

    let subscription;

    try {
        const response = await fetch(url, params);
        if (response.ok) {
            subscription = (await response.json()) as GoogleSubscription;
        } else {
            console.error(`[19e802a9] error: fetch failed: ${response.status}`);
        }
    } catch (error) {
        if (error instanceof Error) {
            console.error(`[24c359f8] error: fetch failed: ${error.message}`);
        } else {
            console.error(`[34bff1ac] error: fetch failed: ${JSON.stringify(error)}`);
        }
    }

    return Promise.resolve(subscription);
};

export async function build_extra_string(stage: string): Promise<string> {
    const accessToken: AccessToken = await getAccessToken(stage);
    const subscription = await extractGoogleSubscription(accessToken);
    console.log(`[26b172df] subscription: ${JSON.stringify(subscription)}`);
    const extra = `(work in progress)`;
    return Promise.resolve(extra);
}
