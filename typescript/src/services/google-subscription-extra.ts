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

export async function build_extra_string(stage: string): Promise<string> {
    const access_token: AccessToken = await getAccessToken(stage);
    const extra = `(work in progress)`;
    return Promise.resolve(extra);
}
