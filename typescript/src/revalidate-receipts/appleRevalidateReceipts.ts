import {plusHours} from "../utils/dates";
import {dynamoMapper} from "../utils/aws";
import {endTimeStampFilterSubscription} from "../models/endTimestampFilter";
import {
 AndExpression,
 attributeExists,
 equals, lessThan,
} from '@aws/dynamodb-expressions';

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
 const time = endTimestampForQuery(event).toISOString();
 console.log(`Filter date will be: ${endTimestampForQuery(event)}`);

 const filter: AndExpression = {
  type: 'And',
  conditions: [
   {
    ...equals(true),
    subject: 'autoRenewing'
   },
   {
    ...attributeExists(),
    subject: 'receipt'
   },
   {
    ...lessThan(time),
    subject: 'endTimestamp'
   }
  ]
 };

 const queryScan = dynamoMapper.scan(
  endTimeStampFilterSubscription,
  {
   indexName: 'ios-endTimestamp-revalidation-index',
   filter: filter
 });

 for await (const subscription of queryScan) {
  console.log(`Found subscription with id: ${subscription.subscriptionId} and expiry timestamp: ${subscription.endTimestamp}`)
 }
}

