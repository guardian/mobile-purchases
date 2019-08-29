import {hashKey, rangeKey, attribute} from '@aws/dynamodb-data-mapper-annotations';
import {DynamoDbTable} from "@aws/dynamodb-data-mapper";
import {App, Stage} from "../utils/appIdentity";

export class SubscriptionEvent {
    @hashKey()
    subscriptionId: string;
    @rangeKey()
    timestampAndType: string;
    @attribute()
    date: string;
    @attribute()
    timestamp: string;
    @attribute()
    eventType: string;
    @attribute()
    platform: string;
    @attribute()
    appId: string;
    @attribute()
    googlePayload?: any;
    @attribute()
    applePayload?: any;
    @attribute()
    ttl: number;

    constructor(subscriptionId: string, timestampAndType: string, date: string, timestamp: string, eventType: string, platform: string, appId: string, googlePayload: any, applePayload: any, ttl: number) {
        this.subscriptionId = subscriptionId;
        this.timestampAndType = timestampAndType;
        this.date = date;
        this.timestamp = timestamp;
        this.eventType = eventType;
        this.platform = platform;
        this.appId = appId;
        this.googlePayload = googlePayload;
        this.applePayload = applePayload;
        this.ttl = ttl;
    }

    get [DynamoDbTable]() {
        return App + "-" + Stage + "-subscription-events-v2";
    }
}