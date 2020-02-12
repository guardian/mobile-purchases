import {hashKey, attribute, rangeKey} from '@aws/dynamodb-data-mapper-annotations';
import {DynamoDbTable} from "@aws/dynamodb-data-mapper";
import {App, Stage} from "../utils/appIdentity";
import {AppleValidatedReceiptServerInfo} from "../services/appleValidateReceipts";

export class Subscription {

    @hashKey()
    subscriptionId: string;

    @rangeKey()
    endTimestamp: string;

    @attribute()
    receipt?: AppleValidatedReceiptServerInfo | AppleValidatedReceiptServerInfo[];

    @attribute()
    autoRenewing: Boolean;

    constructor(subscriptionId: string, endTimestamp: string, autoRenewStatus: Boolean, latestReceiptInfo?: AppleValidatedReceiptServerInfo | AppleValidatedReceiptServerInfo[]) {
        this.subscriptionId = subscriptionId;
        this.endTimestamp = endTimestamp;
        this.receipt = latestReceiptInfo;
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
