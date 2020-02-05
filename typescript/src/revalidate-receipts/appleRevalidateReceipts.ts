import {plusHours} from "../utils/dates";
import {dynamoMapper} from "../utils/aws";
import {endTimeStampFilterSubscription} from "../models/endTimestampFilter";
import {equals} from '@aws/dynamodb-expressions';
import {ReadUserSubscription} from "../models/userSubscription";

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
 const query = dynamoMapper.query({
  valueConstructor: endTimeStampFilterSubscription,
  indexName: 'ios-endTimestamp-revalidation-index',
  keyCondition: {subject:'subscriptionId'},
  filter: {
   ...equals('2019-10-24T11:38:01.000Z'),
   subject: 'endTimestamp'
  }
 });

 for await (const subscription of query) {
  console.log(subscription)
 }
}
