import {SharedIniFileCredentials, CredentialProviderChain, ECSCredentials, AWSError} from "aws-sdk/lib/core";
import {Region, Stage} from "./appIdentity";
import {DataMapper, ItemNotFoundException} from "@aws/dynamodb-data-mapper";
import DynamoDB from 'aws-sdk/clients/dynamodb';
import Sqs from 'aws-sdk/clients/sqs';
import S3 from 'aws-sdk/clients/s3';
import CloudWatch from 'aws-sdk/clients/cloudwatch';
import {PromiseResult} from "aws-sdk/lib/request";
import SSM = require("aws-sdk/clients/ssm");
import STS from "aws-sdk/clients/sts";

const credentialProvider = new CredentialProviderChain([
    function () { return new ECSCredentials(); },
    function () { return new SharedIniFileCredentials({ profile: "mobile" }); },
]);

export const aws = new DynamoDB({
    region: Region,
    credentialProvider: credentialProvider
});

export const dynamoMapper = new DataMapper({ client: aws });

export const sqs = new Sqs({
    region: Region,
    credentialProvider: credentialProvider
});

let membershipSqsClient: Sqs | undefined;

async function getSqsClientForMembershipAccount(): Promise<Sqs> {
    if (!membershipSqsClient) {
        const sts = new STS();
        const assumeRoleResult = await sts.assumeRole({
            RoleArn: ``,
            RoleSessionName: 'CrossAccountSession',
        }).promise();

        const credentials = assumeRoleResult.Credentials;

        if (!credentials) {
            throw Error("credentials undefined in getSqsClientForMembershipAccount");
        }

        membershipSqsClient = new Sqs({
            accessKeyId: credentials.AccessKeyId,
            secretAccessKey: credentials.SecretAccessKey,
            sessionToken: credentials.SessionToken,
            region: Region,
        });
    }

    return membershipSqsClient;
}

export const s3: S3  = new S3({
    region: Region ,
    credentialProvider: credentialProvider
});

export const ssm: SSM  = new SSM({
    region: Region ,
    credentialProvider: credentialProvider
});

const cloudWatchClient = new CloudWatch({ region: Region });

export async function putMetric(metricName: string, value: number = 1.0): Promise<void> {
    const metricDatum: AWS.CloudWatch.MetricDatum = {
        MetricName: metricName,
        Unit: "Count",
        Value: value,
        Dimensions: [
            {
                Name: "Stage",
                Value: Stage,
            },
        ],
    };

    const params: AWS.CloudWatch.PutMetricDataInput = {
        Namespace: "soft-opt-ins",
        MetricData: [metricDatum],
    };

    await cloudWatchClient.putMetricData(params).promise();
}

export function sendToSqs(queueUrl: string, event: any, delaySeconds?: number): Promise<PromiseResult<Sqs.SendMessageResult, AWSError>> {
    return sqs.sendMessage({
        QueueUrl: queueUrl,
        MessageBody: JSON.stringify(event),
        DelaySeconds: delaySeconds
    }).promise()
}
export async function sendToSqsMembership(queueUrl: string, event: any, delaySeconds?: number): Promise<PromiseResult<Sqs.SendMessageResult, AWSError>> {
    const membershipSqs = await getSqsClientForMembershipAccount();
    return membershipSqs.sendMessage({
        QueueUrl: queueUrl,
        MessageBody: JSON.stringify(event),
        DelaySeconds: delaySeconds
    }).promise();
}