import 'source-map-support/register';
import { GuRoot } from '@guardian/cdk/lib/constructs/root';
import { MobilePurchasesFeast } from '../lib/mobile-purchases-feast';
import { MobilePurchasesSoftOptInAcquisitions } from '../lib/mobile-purchases-soft-opt-in-acquisitions';

const app = new GuRoot();

new MobilePurchasesFeast(app, 'MobilePurchasesFeast-CODE', {
	stack: 'mobile',
	stage: 'CODE',
	env: { region: 'eu-west-1' },
});

new MobilePurchasesFeast(app, 'MobilePurchasesFeast-PROD', {
	stack: 'mobile',
	stage: 'PROD',
	env: { region: 'eu-west-1' },
});

// Soft Opt-In Acquisitions stacks
new MobilePurchasesSoftOptInAcquisitions(
	app,
	'MobilePurchasesSoftOptInAcquisitions-CODE',
	{
		stack: 'mobile',
		stage: 'CODE',
		env: { region: 'eu-west-1' },
		membershipAccountId: '123456789012', // TODO: Replace with actual membership account ID
		userSubscriptionsStreamArn:
			'arn:aws:dynamodb:eu-west-1:123456789012:table/mobile-purchases-CODE-user-subscriptions/stream/2023-01-01T00:00:00.000', // TODO: Replace with actual stream ARN
	},
);

new MobilePurchasesSoftOptInAcquisitions(
	app,
	'MobilePurchasesSoftOptInAcquisitions-PROD',
	{
		stack: 'mobile',
		stage: 'PROD',
		env: { region: 'eu-west-1' },
		membershipAccountId: '123456789012', // TODO: Replace with actual membership account ID
		userSubscriptionsStreamArn:
			'arn:aws:dynamodb:eu-west-1:123456789012:table/mobile-purchases-PROD-user-subscriptions/stream/2023-01-01T00:00:00.000', // TODO: Replace with actual stream ARN
	},
);
