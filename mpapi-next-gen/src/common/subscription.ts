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

	get fullTableName(): string {
		return `${App}-${Stage}-${this.tableName}`;
	}
}
