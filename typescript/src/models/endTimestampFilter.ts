import {hashKey, attribute, rangeKey} from '@aws/dynamodb-data-mapper-annotations';
import {DynamoDbTable} from "@aws/dynamodb-data-mapper";
import {App, Stage} from "../utils/appIdentity";
import {AppleSubscriptionReference} from "./subscriptionReference";

export class Subscription {

    @hashKey()
    subscriptionId: string;

    @rangeKey()
    endTimestamp: string;

    @attribute()
    receipt?: AppleSubscriptionReference;

    @attribute()
    autoRenewing: Boolean;

    constructor(subscriptionId: string, endTimestamp: string, autoRenewStatus: Boolean, receipt?: AppleSubscriptionReference) {
        this.subscriptionId = subscriptionId;
        this.endTimestamp = endTimestamp;
        this.receipt = receipt;
        this.autoRenewing = autoRenewStatus

    }

    get[DynamoDbTable]() {
        return `${App}-${Stage}-subscriptions`
    }

}

export class endTimeStampFilterSubscription extends Subscription {

    constructor() {
        super("", "" , false);
    }

}

