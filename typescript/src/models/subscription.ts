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
    productId?: string;

    @attribute()
    ttl?: number;

    constructor(subscriptionId: string, startTimeStamp?: string, endTimeStamp?: string, cancellationTimetamp?: string, autoRenewing?: boolean, productId?: string, ttl?: number) {
        this.subscriptionId = subscriptionId;
        this.startTimeStamp = startTimeStamp;
        this.endTimeStamp = endTimeStamp;
        this.cancellationTimetamp = cancellationTimetamp;
        this.autoRenewing = autoRenewing;
        this.productId = productId;
        this.ttl = ttl;
    }

    get [DynamoDbTable]() {
        return `${App}-${Stage}-subscriptions`
    }
}

export class GoogleSubscription extends Subscription {

    @attribute()
    googlePayload?: any;

    constructor(subscriptionId: string, startTimeStamp: string, endTimeStamp: string, cancellationTimetamp: string | undefined, autoRenewing: boolean, productId: string, ttl: number, googlePayload: any) {
        super(subscriptionId, startTimeStamp, endTimeStamp, cancellationTimetamp, autoRenewing, productId, ttl);
        this.googlePayload = googlePayload;
    }
}

export class AppleSubscription extends Subscription {

    @attribute()
    receipt: string;

    @attribute()
    applePayload?: any;

    constructor(subscriptionId: string, startTimeStamp: string, endTimeStamp: string, cancellationTimetamp: string | undefined, autoRenewing: boolean, productId: string, ttl: number, reciept: string, applePayload: any) {
        super(subscriptionId, startTimeStamp, endTimeStamp, cancellationTimetamp, autoRenewing, productId, ttl);
        this.receipt = reciept;
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
    }

    get [DynamoDbTable]() {
        return `${App}-${Stage}-subscriptions`
    }
}

