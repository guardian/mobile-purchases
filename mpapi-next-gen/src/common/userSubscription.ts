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

	static getTableName(): string {
		return `${App}-${Stage}-user-subscriptions`;
	}
}
