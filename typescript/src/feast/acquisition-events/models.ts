import { Subscription } from "../../models/subscription";
import type {SQSEvent, SQSRecord} from 'aws-lambda';

export interface FeastSQSRecord extends Omit<SQSRecord, 'body'> {
    body: Subscription;
}

export interface FeastSQSEvent extends Omit<SQSEvent, 'Records'> {
    Records: FeastSQSRecord[];

}