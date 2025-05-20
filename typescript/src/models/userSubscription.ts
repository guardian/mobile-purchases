import { DynamoDbTable } from '@aws/dynamodb-data-mapper';
import { attribute, hashKey, rangeKey } from '@aws/dynamodb-data-mapper-annotations';
import { App, Stage } from '../utils/appIdentity';

export class UserSubscription {
    @hashKey()
    userId: string;

    @rangeKey()
    subscriptionId: string;

    @attribute()
    creationTimestamp: string;

    constructor(userId: string, subscriptionId: string, creationTimestamp: string) {
        this.userId = userId;
        this.subscriptionId = subscriptionId;
        this.creationTimestamp = creationTimestamp;
    }

    get [DynamoDbTable]() {
        return `${App}-${Stage}-user-subscriptions`;
    }
}

// Note:
//   UserSubscriptionEmpty is a convenience class for when you need to create an empty UserSubscription object.
//   It's not meant to stand in places where we a UserSubscription would suffice.

export class UserSubscriptionEmpty extends UserSubscription {
    constructor() {
        super('', '', '');
    }
}
