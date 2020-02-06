import {plusHours} from "../utils/dates";
import {dynamoMapper} from "../utils/aws";
import {endTimeStampFilterSubscription} from "../models/endTimestampFilter";
import {equals} from '@aws/dynamodb-expressions';
import {ReadUserSubscription} from "../models/userSubscription";
import {TableName} from "aws-sdk/clients/dynamodb";
import {ReadSubscriptionEvent} from "../models/subscriptionEvent";
import {writeSync} from "fs";

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
// console.log("in handler")
//  const queryScan = dynamoMapper.scan({
//   valueConstructor: endTimeStampFilterSubscription,
//   indexName: 'ios-endTimestamp-revalidation-index',
//   filter: {
//    ...equals(true),
//    subject: 'autoRenewing'
//   }
//  });
//
//  for await (const subscription of queryScan) {
//   console.log(`subscription is: ${subscription}`)
//  }
//  console.log(queryScan.count)
//  return queryScan.count

 const iterator = dynamoMapper.query(ReadSubscriptionEvent,{subscriptionId:"100000580817300"}, {indexName: "date-timestamp-index-v2"});

 for await (const subscription of iterator) {
  console.log(`subscription is: ${subscription}`)
 }
}

