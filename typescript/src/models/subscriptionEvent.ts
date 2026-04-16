import { DynamoDbTable } from '@aws/dynamodb-data-mapper';
import {
	attribute,
	hashKey,
	rangeKey,
} from '@aws/dynamodb-data-mapper-annotations';
import { App, Stage } from '../utils/appIdentity';

export class SubscriptionEvent {
	@hashKey()
	subscriptionId: string;
	@rangeKey()
	timestampAndType: string;
	@attribute()
	date: string;
	@attribute()
	timestamp: string;
	@attribute()
	eventType: string;
	@attribute()
	platform: string;
	@attribute()
	appId: string;
	@attribute()
	freeTrial?: boolean;

	@attribute()
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	googlePayload?: any;

	@attribute()
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	applePayload?: any;

	@attribute()
	ttl: number;
	@attribute()
	promotional_offer_id: string | null;
	@attribute()
	promotional_offer_name: string | null;
	@attribute()
	product_id: string;
	@attribute()
	purchase_date_ms: number;
	@attribute()
	expires_date_ms: number;
	@attribute()
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

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		googlePayload: any,

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		applePayload: any,

		ttl: number,
		promotional_offer_id: string | null,
		promotional_offer_name: string | null,

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		product_id: any,

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		purchase_date_ms: any,

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		expires_date_ms: any,

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

	get [DynamoDbTable]() {
		return App + '-' + Stage + '-subscription-events-v2';
	}
}

// Pascal, 14th April
// I am not updating these `any` ^ for the moment to prevent breaking something by accident

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
