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
  // const query = dynamoMapper.query({valueConstructor: endTimeStampFilterSubscription, indexName: 'ios-endTimestamp-revalidation-index', keyCondition: {}  })
 // const query = dynamoMapper.query({
 //  valueConstructor: endTimeStampFilterSubscription,
 //  indexName: 'ios-endTimestamp-revalidation-index',
 //  keyCondition: {subject:'subscriptionId'},
 //  filter: {
 //   ...equals('2019-10-24T11:38:01.000Z'),
 //   subject: 'endTimestamp'
 //  }
 // });

 // {
 //  "TableName": "GameScores",
 //     "IndexName": "GameTitleIndex",
 //     "KeyConditionExpression": "GameTitle = :v_title",
 //     "ExpressionAttributeValues": {
 //  ":v_title": {"S": "Meteor Blasters"}
 // },
 //  "ProjectionExpression": "UserId, TopScore",
 //     "ScanIndexForward": false
 // }

 const queryScan = dynamoMapper.scan(
     endTimeStampFilterSubscription,
     {
      startKey: ["subscriptionId"],
      filter:{
      ...equals('true'),
       subject: "autoRenewing"
      }
     })

 for await (const subscription of queryScan) {
  console.log(subscription)
 }
}
