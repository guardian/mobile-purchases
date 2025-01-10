import {
	hashKey,
	rangeKey,
	attribute,
} from '@aws/dynamodb-data-mapper-annotations';
import { DynamoDbTable } from '@aws/dynamodb-data-mapper';
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
	googlePayload?: any;
	@attribute()
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

	constructor(
		subscriptionId: string,
		timestampAndType: string,
		date: string,
		timestamp: string,
		eventType: string,
		platform: string,
		appId: string,
		freeTrial: boolean | undefined,
		googlePayload: any,
		applePayload: any,
		ttl: number,
		promotional_offer_id: string | null,
		promotional_offer_name: string | null,
		product_id: any,
		purchase_date_ms: any,
		expires_date_ms: any,
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
	}

	get [DynamoDbTable]() {
		return App + '-' + Stage + '-subscription-events-v2';
	}
}

export class SubscriptionEventEmpty extends SubscriptionEvent {
	constructor() {
		super('', '', '', '', '', '', '', undefined, {}, {}, 0, '', '', '', 0, 0);
	}
}
