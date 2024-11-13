import type { SQSEvent, SQSRecord } from 'aws-lambda';
import { Subscription } from "../../models/subscription";

export interface FeastSQSRecord extends Omit<SQSRecord, 'body'> {
    body: Subscription;
}

export interface FeastSQSEvent extends Omit<SQSEvent, 'Records'> {
    Records: FeastSQSRecord[];
}

