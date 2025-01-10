export interface SubscriptionReference {}

export interface GoogleSubscriptionReference extends SubscriptionReference {
	packageName: string;
	purchaseToken: string;
	subscriptionId: string;
}

export interface AppleSubscriptionReference extends SubscriptionReference {
	receipt: string;
}
