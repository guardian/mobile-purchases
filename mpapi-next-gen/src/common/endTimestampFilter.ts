// TODO: Rename this.
//       We already have a Subscription object.

export class Subscription {
	subscriptionId: string;
	endTimestamp: string;
	receipt?: string | undefined;
	autoRenewing: boolean;
	platform: string;

	constructor(
		subscriptionId: string,
		endTimestamp: string,
		autoRenewStatus: boolean,
		platform: string,
		receipt?: string,
	) {
		this.subscriptionId = subscriptionId;
		this.endTimestamp = endTimestamp;
		this.receipt = receipt;
		this.autoRenewing = autoRenewStatus;
		this.platform = platform;
	}
}
