import { DynamoDbTable } from '@aws/dynamodb-data-mapper';
import { App, Stage } from '../common/appIdentity';

export class Subscription {
	/*
        Warning: The subscriptionId value, defined in this schema, is going to carry the purchase token (`purchaseToken`) 
        from a Google Play notification and not the value of the attribute `subscriptionId` of that notification.

        See the file: google-identifiers.md in the documentation folder for details.
    */

	subscriptionId: string;
	startTimestamp: string;
	endTimestamp: string;
	cancellationTimestamp?: string | undefined;
	autoRenewing: boolean;
	productId: string;
	platform: string | undefined;
	freeTrial: boolean | undefined;
	billingPeriod: string | undefined;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	googlePayload?: any;
	receipt: string | undefined;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	applePayload?: any;
	ttl: number | undefined;
	extra: string | undefined;

	tableName: string;

	constructor(
		subscriptionId: string,
		startTimestamp: string,
		endTimestamp: string,
		cancellationTimestamp: string | undefined,
		autoRenewing: boolean,
		productId: string,
		platform: string | undefined,
		freeTrial: boolean | undefined,
		billingPeriod: string | undefined,

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		googlePayload?: any,
		receipt?: string,

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		applePayload?: any,

		ttl?: number,
		extra?: string,
		tableName = 'subscriptions',
	) {
		this.subscriptionId = subscriptionId;
		this.startTimestamp = startTimestamp;
		this.endTimestamp = endTimestamp;
		this.cancellationTimestamp = cancellationTimestamp;
		this.autoRenewing = autoRenewing;
		this.productId = productId;
		this.platform = platform;
		this.freeTrial = freeTrial;
		this.billingPeriod = billingPeriod;
		this.googlePayload = googlePayload;
		this.receipt = receipt;
		this.applePayload = applePayload;
		this.ttl = ttl;
		this.extra = extra;
		this.tableName = tableName;
	}

	get [DynamoDbTable]() {
		return `${App}-${Stage}-${this.tableName}`;
	}
}

// Note:
//     SubscriptionEmpty is a convenience class to help with the instantiation of an empty Subscription object.
//     It's often used to create a argument of dynamoMapper.get (we instantiate it and then
//     set the subscriptionId, before passing the resulting object to dynamoMapper.get).
//     It is not meant to stand where a Subscription is the right type, notably as the return type of dynamoMapper.get.
//     Function dynamoMapper.get will return a Subscription object, not a SubscriptionEmpty object.

export class SubscriptionEmpty extends Subscription {
	constructor() {
		super(
			'', // subscriptionId
			'', // startTimestamp
			'', // endTimestamp
			undefined, // cancellationTimestamp
			false, // autoRenewing
			'', // productId
			undefined, // platform
			undefined, // freeTrial
			undefined, // billingPeriod
		);
	}

	setSubscriptionId(subscriptionId: string): SubscriptionEmpty {
		this.subscriptionId = subscriptionId;
		return this;
	}

	get [DynamoDbTable]() {
		return `${App}-${Stage}-${this.tableName}`;
	}
}
