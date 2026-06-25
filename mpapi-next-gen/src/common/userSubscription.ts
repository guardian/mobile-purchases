import { DynamoDbTable } from '@aws/dynamodb-data-mapper';
import { App, Stage } from '../common/appIdentity';

// This class abstract the records in the dynamo table
// mobile-purchases-PROD-user-subscriptions

export class UserSubscription {
	userId: string;
	subscriptionId: string;
	creationTimestamp: string;

	constructor(
		userId: string,
		subscriptionId: string,
		creationTimestamp: string,
	) {
		this.userId = userId;
		this.subscriptionId = subscriptionId;
		this.creationTimestamp = creationTimestamp;
	}

	get [DynamoDbTable]() {
		return `${App}-${Stage}-user-subscriptions`;
	}
}

// Note:
//   UserSubscriptionEmpty is a convenience class for when you need to create
//   an empty UserSubscription object. But the type should be used in place
//   of UserSubscription.

export class UserSubscriptionEmpty extends UserSubscription {
	constructor() {
		super('', '', '');
	}
}
