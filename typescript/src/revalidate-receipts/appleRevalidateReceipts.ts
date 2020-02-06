import {plusHours} from "../utils/dates";
import {dynamoMapper} from "../utils/aws";
import {endTimeStampFilterSubscription} from "../models/endTimestampFilter";
import {equals} from '@aws/dynamodb-expressions';
import {ReadUserSubscription} from "../models/userSubscription";
import {TableName} from "aws-sdk/clients/dynamodb";

function endTimestampForQuery(event: ScheduleEvent): Date {
 const defaultDate = plusHours(new Date(), 3);
 if(event.endTimestampFilter) {
  return new Date(Date.parse(event.endTimestampFilter));
 } else {
  return defaultDate;
 }
}

interface ScheduleEvent {
 endTimestampFilter?: string;
}

export async function handler(event: ScheduleEvent) {

 const queryScan = dynamoMapper.scan({
  valueConstructor: endTimeStampFilterSubscription,
  indexName: 'ios-endTimestamp-revalidation-index',
  filter: {
   ...equals('true'),
   subject: 'autoRenewing'
  }
 });

 for await (const subscription of queryScan) {
  console.log(subscription)
 }
}
