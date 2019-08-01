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

    constructor(userId: string, subscriptionId: string, creationTimestamp: string) {
        this.userId = userId;
        this.subscriptionId = subscriptionId;
        this.creationTimestamp = creationTimestamp;
    }
    

    get[DynamoDbTable]() {
        return `${App}-${Stage}-user-subscriptions`
    }

}

export class ReadUserSubscription {

    @hashKey()
    userId: string

    @attribute()
    subscriptionId: string

    @attribute()
    creationTimestamp: string

    constructor() {
        this.userId = ""
        this.subscriptionId = ""
        this.creationTimestamp = ""
    }
    
    get[DynamoDbTable]() {
        return `${App}-${Stage}-user-subscriptions`
    }

}

