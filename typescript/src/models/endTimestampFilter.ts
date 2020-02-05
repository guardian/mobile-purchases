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
    latest_receipt_info?: AppleValidatedReceiptServerInfo | AppleValidatedReceiptServerInfo[];

    @attribute()
    auto_renew_status: Boolean;

    constructor(subscriptionId: string, endTimestamp: string, autoRenewStatus: Boolean, latestReceiptInfo?: AppleValidatedReceiptServerInfo | AppleValidatedReceiptServerInfo[]) {
        this.subscriptionId = subscriptionId;
        this.endTimestamp = endTimestamp;
        this.latest_receipt_info = latestReceiptInfo;
        this.auto_renew_status = autoRenewStatus

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
