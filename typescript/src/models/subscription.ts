import {hashKey, attribute} from '@aws/dynamodb-data-mapper-annotations';
import {DynamoDbTable} from "@aws/dynamodb-data-mapper";
import {App, Stage} from "../utils/appIdentity";


export class Subscription {

    @hashKey()
    subscriptionId: string;

    @attribute()
    startTimestamp: string;

    @attribute()
    endTimestamp: string;

    @attribute()
    cancellationTimestamp?: string;

    @attribute()
    autoRenewing: boolean;

    @attribute()
    productId: string;

    @attribute()
    platform?: string;

    @attribute()
    freeTrial?: boolean;

    @attribute()
    billingPeriod?: string;

    @attribute()
    googlePayload?: any;

    @attribute()
    receipt?: string;

    @attribute()
    applePayload?: any;

    @attribute()
    ttl?: number;

    tableName: string

    constructor(
        subscriptionId: string,
        startTimestamp: string,
        endTimestamp: string,
        cancellationTimestamp: string | undefined,
        autoRenewing: boolean,
        productId: string,
        platform: string | undefined,
        freeTrial: boolean | undefined,
        billingPeriod: string | undefined,
        googlePayload?: any,
        receipt?: string,
        applePayload?: any,
        ttl?:number,
        tableName: string = "subscriptions"
    ) {
        this.subscriptionId = subscriptionId;
        this.startTimestamp = startTimestamp;
        this.endTimestamp = endTimestamp;
        this.cancellationTimestamp = cancellationTimestamp;
        this.autoRenewing = autoRenewing;
        this.productId = productId;
        this.platform = platform;
        this.freeTrial = freeTrial;
        this.billingPeriod = billingPeriod;
        this.googlePayload = googlePayload;
        this.receipt = receipt;
        this.applePayload = applePayload;
        this.ttl = ttl;
        this.tableName = tableName;
    }

    get [DynamoDbTable]() {
        return `${App}-${Stage}-subscriptions`
    }
}

export class ReadSubscription extends Subscription {

    constructor() {
        super("", "", "", undefined, false, "", undefined, undefined, undefined)
    }

    setSubscriptionId(subscriptionId: string): ReadSubscription {
        this.subscriptionId = subscriptionId;
        return this;
    }

    get [DynamoDbTable]() {
        return `${App}-${Stage}-${this.tableName}`
    }
}

