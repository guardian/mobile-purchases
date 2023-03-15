import {hashKey, attribute, rangeKey} from '@aws/dynamodb-data-mapper-annotations';
import {DynamoDbTable} from "@aws/dynamodb-data-mapper";
import {App, Stage} from "../utils/appIdentity";

export class SoftOptInLog {

    @hashKey()
    userId: string;

    @rangeKey()
    timestamp: number;

    @attribute()
    subscriptionId: string;

    @attribute()
    logMessage: string;

    constructor(userId: string, subscriptionId: string, timestamp: number, logMessage: string) {
        this.userId = userId;
        this.subscriptionId = subscriptionId;
        this.timestamp = timestamp;
        this.logMessage = logMessage;
    }

    get[DynamoDbTable]() {
        return `${App}-${Stage}-soft-opt-ins-logs`
    }

}
