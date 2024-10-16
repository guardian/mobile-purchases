import { ReadSubscription } from "../../models/subscription";
import type {SQSEvent, SQSRecord} from 'aws-lambda';

export interface FeastSQSRecord extends Omit<SQSRecord, 'body'> {
    body: ReadSubscription;
}

export interface FeastSQSEvent extends Omit<SQSEvent, 'Records'> {
    Records: FeastSQSRecord[];

}