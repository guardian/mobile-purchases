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
    googlePayload?: any;

    @attribute()
    ttl?: number;

    constructor(subscriptionId: string, startTimeStamp?: string, endTimeStamp?: string, cancellationTimeStamp?: string, autoRenewing?: boolean, googlePayload?: any,  ttl?: number) {
        this.subscriptionId = subscriptionId;
        this.startTimeStamp = startTimeStamp;
        this.endTimeStamp = endTimeStamp;
        this.cancellationTimetamp = cancellationTimeStamp;
        this.autoRenewing = autoRenewing;
        this.googlePayload = googlePayload;
        this.ttl = ttl;
    }

    get [DynamoDbTable]() {
        return App + "-" + Stage + "-subscriptions"
    }
}