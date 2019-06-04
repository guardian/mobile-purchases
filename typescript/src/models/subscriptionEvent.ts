import {hashKey, rangeKey, attribute} from '@aws/dynamodb-data-mapper-annotations';
import {DynamoDbTable} from "@aws/dynamodb-data-mapper";
import {App, Stage} from "../utils/appIdentity";

export class SubscriptionEvent{
    @hashKey()
    subscriptionId: string;
    @rangeKey()
    timestampAndType: string;
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

    constructor(params: {subscriptionId: string, timestampAndType: string, timestamp: string, eventType: string, platform: string, appId: string, googlePayload: any, applePayload: any, ttl: number}) {
        this.subscriptionId = params.subscriptionId;
        this.timestampAndType = params.timestampAndType;
        this.timestamp = params.timestamp;
        this.eventType = params.eventType;
        this.platform = params.platform;
        this.appId = params.appId;
        this.googlePayload = params.googlePayload;
        this.applePayload = params.applePayload;
        this.ttl = params.ttl;
    }

    get [DynamoDbTable]() {
        return App + "-" + Stage + "-subscription-events";
    }
}