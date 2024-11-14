import type { SQSEvent, SQSRecord } from 'aws-lambda';

export interface FeastSQSRecord extends Omit<SQSRecord, 'body'> {
    body: string;
}

export interface FeastSQSEvent extends Omit<SQSEvent, 'Records'> {
    Records: FeastSQSRecord[];
}
