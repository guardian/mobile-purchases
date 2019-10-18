import {SharedIniFileCredentials, CredentialProviderChain, ECSCredentials, AWSError} from "aws-sdk/lib/core";
import {Region} from "./appIdentity";
import {DataMapper, ItemNotFoundException} from "@aws/dynamodb-data-mapper";
import DynamoDB from 'aws-sdk/clients/dynamodb';
import Sqs from 'aws-sdk/clients/sqs';
import S3 from 'aws-sdk/clients/s3';
import {PromiseResult} from "aws-sdk/lib/request";
import SSM = require("aws-sdk/clients/ssm");


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

export const ssm: SSM  = new SSM({
    region: Region ,
    credentialProvider: credentialProvider
});


export function sendToSqs(queueUrl: string, event: any): Promise<PromiseResult<Sqs.SendMessageResult, AWSError>> {
    return sqs.sendMessage({
        QueueUrl: queueUrl,
        MessageBody: JSON.stringify(event)
    }).promise()
}



