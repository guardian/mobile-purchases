import {hashKey, rangeKey, attribute} from '@aws/dynamodb-data-mapper-annotations';
import {DynamoDbTable} from "@aws/dynamodb-data-mapper";
import {App, Stage} from "../utils/appIdentity";


export class Subscription {

    @hashKey()
    subscriptionId: string;

    @attribute()
    startTimeStamp?: string;

    @attribute()
    endTimeStamp?: string;

    @attribute()
    cancellationTimetamp?: string;

    @attribute()
    autoRenewing?: boolean;

    @attribute()
    ttl?: number;

    constructor(subscriptionId: string, startTimeStamp?: string, endTimeStamp?: string, cancellationTimeStamp?: string, autoRenewing?: boolean, ttl?: number) {
        this.subscriptionId = subscriptionId;
        this.startTimeStamp = startTimeStamp
        this.endTimeStamp = endTimeStamp;
        this.cancellationTimetamp = cancellationTimeStamp;
        this.autoRenewing = autoRenewing;
        this.ttl = ttl;
    }

    get [DynamoDbTable]() {
        return `${App}-TEST-subscriptions`
    }
}

export class GoogleSubscription extends Subscription {

    @attribute()
    googlePayload?: any;

    constructor(subscriptionId: string, startTimeStamp?: string, endTimeStamp?: string, cancellationTimeStamp?: string, autoRenewing?: boolean, googlePayload?: any,  ttl?: number) {
        super(subscriptionId, startTimeStamp, endTimeStamp, cancellationTimeStamp, autoRenewing, ttl )
        this.googlePayload = googlePayload;
    }
}

export class AppleSubscription extends Subscription {

    @attribute()
    transactionId: string;

    @attribute()
    applePayload?: any;
    
    constructor(subscriptionId: string, transactionId: string, startTimeStamp?: string, endTimeStamp?: string, cancellationTimeStamp?: string, autoRenewing?: boolean, applePayload?: any,  ttl?: number) {
        super(subscriptionId, startTimeStamp, endTimeStamp, cancellationTimeStamp, autoRenewing, ttl )
        this.transactionId = transactionId;
        this.applePayload = applePayload;

    }
}

export class ReadSubscription {
    @hashKey()
    subscriptionId: string;

    @attribute()
    startTimeStamp: string;

    @attribute()
    endTimeStamp: string;

    @attribute()
    cancellationTimetamp?: string;

    @attribute()
    autoRenewing?: boolean;

    constructor() {
        this.subscriptionId = "";
        this.startTimeStamp = "";
        this.endTimeStamp = "";
        this.cancellationTimetamp = ""
        this.autoRenewing = false;
    }

    get [DynamoDbTable]() {
        return `${App}-${Stage}-subscriptions`
    }
}

