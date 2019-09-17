import {hashKey, rangeKey, attribute} from '@aws/dynamodb-data-mapper-annotations';
import {DynamoDbTable} from "@aws/dynamodb-data-mapper";
import {App, Stage} from "../utils/appIdentity";


export class Subscription {

    @hashKey()
    subscriptionId: string;

    @attribute()
    startTimestamp?: string;

    @attribute()
    endTimestamp?: string;

    @attribute()
    cancellationTimestamp?: string;

    @attribute()
    autoRenewing?: boolean;

    @attribute()
    productId?: string;

    @attribute()
    ttl?: number;

    constructor(subscriptionId: string, startTimestamp?: string, endTimestamp?: string, cancellationTimestamp?: string, autoRenewing?: boolean, productId?: string, ttl?: number) {
        this.subscriptionId = subscriptionId;
        this.startTimestamp = startTimestamp;
        this.endTimestamp = endTimestamp;
        this.cancellationTimestamp = cancellationTimestamp;
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

    constructor(subscriptionId: string, startTimestamp: string, endTimestamp: string, cancellationTimestamp: string | undefined, autoRenewing: boolean, productId: string, ttl: number, googlePayload: any) {
        super(subscriptionId, startTimestamp, endTimestamp, cancellationTimestamp, autoRenewing, productId, ttl);
        this.googlePayload = googlePayload;
    }
}

export class AppleSubscription extends Subscription {

    @attribute()
    receipt: string;

    @attribute()
    applePayload?: any;

    constructor(subscriptionId: string, startTimestamp: string, endTimestamp: string, cancellationTimestamp: string | undefined, autoRenewing: boolean, productId: string, ttl: number, reciept: string, applePayload: any) {
        super(subscriptionId, startTimestamp, endTimestamp, cancellationTimestamp, autoRenewing, productId, ttl);
        this.receipt = reciept;
        this.applePayload = applePayload;
    }
}

export class ReadSubscription {
    @hashKey()
    subscriptionId: string;

    @attribute()
    startTimestamp: string;

    @attribute()
    endTimestamp: string;

    @attribute()
    cancellationTimestamp?: string;

    @attribute()
    autoRenewing?: boolean;

    constructor() {
        this.subscriptionId = "";
        this.startTimestamp = "";
        this.endTimestamp = "";
    }

    get [DynamoDbTable]() {
        return `${App}-${Stage}-subscriptions`
    }
}

