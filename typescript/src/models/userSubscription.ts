import {hashKey, attribute} from '@aws/dynamodb-data-mapper-annotations';
import {DynamoDbTable} from "@aws/dynamodb-data-mapper";
import {App, Stage} from "../utils/appIdentity";

export class UserSubscription {

    @hashKey()
    userId: string

    @attribute()
    subscriptionId: string

    @attribute()
    creationTimestamp: string

    @attribute()
    ttl: number;

    constructor(userId: string, subscriptionId: string, creationTimestamp: string, ttl: number) {
        this.userId = userId;
        this.subscriptionId = subscriptionId;
        this.creationTimestamp = creationTimestamp;
        this.ttl = ttl;
    }
    

    get[DynamoDbTable]() {
        return `${App}-${Stage}-user-subscriptions`
    }

}

export class ReadUserSubscription extends UserSubscription {

    constructor() {
        super("", "", "", 0);
    }

}

