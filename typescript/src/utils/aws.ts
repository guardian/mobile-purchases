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
import {getMembershipAccountId} from "./guIdentityApi";

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

let SOISqsClient: Sqs | undefined;
let commsSqsClient: Sqs | undefined;

let lastAssumedSOI: Date | undefined;
let lastAssumedComms: Date | undefined;

async function getSqsClientForSoftOptIns(): Promise<Sqs> {
    const now = new Date();
    if (!SOISqsClient || !lastAssumedSOI || now.getTime() - lastAssumedSOI.getTime() >= 1800000) {  // refresh every 30 minutes
        const membershipAccountId = await getMembershipAccountId();
        const sts = new STS();

        const softOptInConsentSetterStage = Stage === "PROD" ? "PROD" : "DEV";

        const assumeRoleResult = await sts.assumeRole({
            RoleArn: `arn:aws:iam::${membershipAccountId}:role/membership-${softOptInConsentSetterStage}-soft-opt-in-consent-setter-QueueCrossAccountRole`,
            RoleSessionName: 'CrossAccountSession',
        }).promise();

        const credentials = assumeRoleResult.Credentials;

        if (!credentials) {
            throw Error("credentials undefined in getSqsClientForSoftOptIns");
        }

        SOISqsClient = new Sqs({
            accessKeyId: credentials.AccessKeyId,
            secretAccessKey: credentials.SecretAccessKey,
            sessionToken: credentials.SessionToken,
            region: Region,
        });

        lastAssumedSOI = now;
    }

    return SOISqsClient;
}

async function getSqsClientForComms(): Promise<Sqs> {
    const now = new Date();
    if (!commsSqsClient || !lastAssumedComms || now.getTime() - lastAssumedComms.getTime() >= 1800000) {  // refresh every 30 minutes
        const membershipAccountId = await getMembershipAccountId();
        const sts = new STS();

        const assumeRoleResult = await sts.assumeRole({
            RoleArn: `arn:aws:iam::${membershipAccountId}:role/comms-${Stage}-EmailQueueCrossAccountRole`,
            RoleSessionName: 'CrossAccountSession',
        }).promise();

        const credentials = assumeRoleResult.Credentials;

        if (!credentials) {
            throw Error("credentials undefined in getSqsClientForComms");
        }

        commsSqsClient = new Sqs({
            accessKeyId: credentials.AccessKeyId,
            secretAccessKey: credentials.SecretAccessKey,
            sessionToken: credentials.SessionToken,
            region: Region,
        });

        lastAssumedComms = now;
    }

    return commsSqsClient;
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
    console.log(`[fddc199d(1)] sendToSqs ${JSON.stringify(event, (k, v) => v === undefined ? "was undefined" : v)}`);
    const messageBody = JSON.stringify(event, (k, v) => v === undefined ? null : v);
    console.log(`[fddc199d(2)] sendToSqs ${messageBody}`);
    return sqs.sendMessage({
        QueueUrl: queueUrl,
        MessageBody: JSON.stringify(event),
        DelaySeconds: delaySeconds
    }).promise()
}

export interface SoftOptInEvent {
    identityId: string;
    eventType: "Acquisition" | "Cancellation" | "Switch";
    productName: "InAppPurchase";
    subscriptionId: string;
}

export async function sendToSqsSoftOptIns(queueUrl: string, event: SoftOptInEvent, delaySeconds?: number): Promise<PromiseResult<Sqs.SendMessageResult, AWSError>> {
    const membershipSqs = await getSqsClientForSoftOptIns();
    return membershipSqs.sendMessage({
        QueueUrl: queueUrl,
        MessageBody: JSON.stringify(event),
        DelaySeconds: delaySeconds
    }).promise();
}
export async function sendToSqsComms(queueUrl: string, event: any, delaySeconds?: number): Promise<PromiseResult<Sqs.SendMessageResult, AWSError>> {
    const membershipSqs = await getSqsClientForComms();
    return membershipSqs.sendMessage({
        QueueUrl: queueUrl,
        MessageBody: JSON.stringify(event),
        DelaySeconds: delaySeconds
    }).promise();
}