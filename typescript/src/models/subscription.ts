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
    googlePayload?: any;

    @attribute()
    receipt?: string;

    @attribute()
    applePayload?: any;

    @attribute()
    ttl?: number;

    constructor(
        subscriptionId: string,
        startTimestamp: string,
        endTimestamp: string,
        cancellationTimestamp: string | undefined,
        autoRenewing: boolean,
        productId: string,
        googlePayload?: any,
        receipt?: string,
        applePayload?: any,
        ttl?:number
    ) {
        this.subscriptionId = subscriptionId;
        this.startTimestamp = startTimestamp;
        this.endTimestamp = endTimestamp;
        this.cancellationTimestamp = cancellationTimestamp;
        this.autoRenewing = autoRenewing;
        this.productId = productId;
        this.googlePayload = googlePayload;
        this.receipt = receipt;
        this.applePayload = applePayload;
        this.ttl = ttl;
    }

    get [DynamoDbTable]() {
        return `${App}-${Stage}-subscriptions`
    }
}

export class ReadSubscription extends Subscription {

    constructor() {
        super("", "", "", undefined, false, "")
    }

    setSubscriptionId(subscriptionId: string): ReadSubscription {
        this.subscriptionId = subscriptionId;
        return this;
    }

    get [DynamoDbTable]() {
        return `${App}-${Stage}-subscriptions`
    }
}

