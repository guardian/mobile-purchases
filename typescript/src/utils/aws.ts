import {CredentialProviderChain, ECSCredentials, SharedIniFileCredentials, AWSError} from "aws-sdk";
import {Region} from "./appIdentity";
import {DataMapper, ItemNotFoundException} from "@aws/dynamodb-data-mapper";
import DynamoDB from 'aws-sdk/clients/dynamodb';
import Sqs from 'aws-sdk/clients/sqs';
import S3 from 'aws-sdk/clients/s3';
import {PromiseResult} from "aws-sdk/lib/request";


const credentialProvider = new CredentialProviderChain([
    function () { return new ECSCredentials(); },
    function () { return new SharedIniFileCredentials({
        profile: "mobile"
    }); }                                                                            
]);

const aws = new DynamoDB({
    region: Region,
    credentialProvider: credentialProvider
});

export const dynamoMapper = new DataMapper({ client: aws });

export const sqs = new Sqs({
    region: Region,
    credentialProvider: credentialProvider
});

export const s3: S3  = new S3({
    region: Region ,
    credentialProvider: credentialProvider
});


export function sendToSqsImpl(event: any): Promise<PromiseResult<Sqs.SendMessageResult, AWSError>> {
    //const queueUrl = process.env.QueueUrl;
    const queueUrl = "https://sqs.eu-west-1.amazonaws.com/201359054765/NathanielUpdateGoogleSubscriptionTst";
    if (queueUrl === undefined) throw new Error("No QueueUrl env parameter provided");
    return sqs.sendMessage({
        QueueUrl: queueUrl,
        MessageBody: JSON.stringify(event)
    }).promise()
}



