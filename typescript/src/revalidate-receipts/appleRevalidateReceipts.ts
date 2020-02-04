import {dynamoMapper} from "../utils/aws";
import {endTimeStampFilterSubscription} from "../models/endTimestampFilter";
import {Option} from "../utils/option";
import {plusDays, plusHours} from "../utils/dates";

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

export function handler(event: ScheduleEvent) {
 console.log(`Filter date will be: ${endTimestampForQuery(event)}`)
}
