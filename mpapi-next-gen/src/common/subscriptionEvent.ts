import { App, Stage } from '../common/appIdentity';

// This class abstract the records in the dynamo table
// mobile-purchases-PROD-subscription-events-v2

export class SubscriptionEvent {
	subscriptionId: string;
	timestampAndType: string;
	date: string;
	timestamp: string;
	eventType: string;
	platform: string;
	appId: string;
	freeTrial?: boolean | undefined;
	googlePayload?: unknown;
	applePayload?: unknown;
	ttl: number;
	promotional_offer_id: string | null;
	promotional_offer_name: string | null;
	product_id: string;
	purchase_date_ms: number;
	expires_date_ms: number;
	extra: string;

	constructor(
		subscriptionId: string,
		timestampAndType: string,
		date: string,
		timestamp: string,
		eventType: string,
		platform: string,
		appId: string,
		freeTrial: boolean | undefined,
		googlePayload: unknown,
		applePayload: unknown,
		ttl: number,
		promotional_offer_id: string | null,
		promotional_offer_name: string | null,
		product_id: string,
		purchase_date_ms: number,
		expires_date_ms: number,
		extra: string,
	) {
		this.subscriptionId = subscriptionId;
		this.timestampAndType = timestampAndType;
		this.date = date;
		this.timestamp = timestamp;
		this.eventType = eventType;
		this.platform = platform;
		this.appId = appId;
		this.freeTrial = freeTrial;
		this.googlePayload = googlePayload;
		this.applePayload = applePayload;
		this.ttl = ttl;
		this.promotional_offer_id = promotional_offer_id;
		this.promotional_offer_name = promotional_offer_name;
		this.product_id = product_id;
		this.purchase_date_ms = purchase_date_ms;
		this.expires_date_ms = expires_date_ms;
		this.extra = extra;
	}

	// Static method to get table name
	static getTableName(): string {
		return App + '-' + Stage + '-subscription-events-v2';
	}
}

export class SubscriptionEventEmpty extends SubscriptionEvent {
	constructor() {
		super(
			'', // subscriptionId
			'', // timestampAndType
			'', // date
			'', // timestamp
			'', // eventType
			'', // platform
			'', // appId
			undefined, // freeTrial
			{}, // googlePayload
			{}, // applePayload
			0, // ttl
			'', // promotional_offer_id
			'', // promotional_offer_name
			'', // product_id
			0, // purchase_date_ms
			0, // expires_date_ms
			'', // extra
		);
	}
}
