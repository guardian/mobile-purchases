import {hashKey, attribute, rangeKey} from '@aws/dynamodb-data-mapper-annotations';
import {DynamoDbTable} from "@aws/dynamodb-data-mapper";
import {App, Stage} from "../utils/appIdentity";

export class Subscription {

    @hashKey()
    subscriptionId: string;

    @rangeKey()
    endTimestamp: string;

    @attribute()
    receipt?: string;

    @attribute()
    autoRenewing: Boolean;

    @attribute()
    productId: string;

    constructor(
        subscriptionId: string,
        endTimestamp: string,
        autoRenewStatus: Boolean,
        productId: string,
        receipt?: string,
    ) {
        this.subscriptionId = subscriptionId;
        this.endTimestamp = endTimestamp;
        this.receipt = receipt;
        this.autoRenewing = autoRenewStatus;
        this.productId = productId;

    }

    get[DynamoDbTable]() {
        return `${App}-${Stage}-subscriptions`
    }

}

export class EndTimeStampFilterSubscription extends Subscription {

    constructor() {
        super("", "" , false, "");
    }

}
