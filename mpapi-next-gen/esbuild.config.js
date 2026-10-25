const esbuild = require('esbuild');

// maintenance: please maintain alphabetical order
const entryPoints = {
	'apple-link-user-subscription': './src/lambdas/appleLinkUserSubscription.ts',
	'apple-subscription-status': './src/lambdas/appleSubscriptionStatus.ts',
	'apple-update-subscriptions': './src/lambdas/appleUpdateSubscriptions.ts',
	'delete-user-subscription': './src/lambdas/deleteUserSubscription.ts',
	'export-historical-data': './src/lambdas/exportHistoricalData.ts',
	'export-subscription-events-table':
		'./src/lambdas/exportSubscriptionEventsTable.ts',
	'export-subscription-table-v2': './src/lambdas/exportSubscriptionTableV2.ts',
	'feast-acquisition-events-router':
		'./src/lambdas/feastAcquisitionEventsRouter.ts',
	'feast-apple-acquisition-events':
		'./src/lambdas/feastAppleAcquisitionEvents.ts',
	'feast-apple-update-subscriptions':
		'./src/lambdas/feastAppleUpdateSubscriptions.ts',
	'feast-google-acquisition-events':
		'./src/lambdas/feastGoogleAcquisitionEvents.ts',
	'feast-google-update-subscriptions':
		'./src/lambdas/feastGoogleUpdateSubscriptions.ts',
	'google-link-user-subscription':
		'./src/lambdas/googleLinkUserSubscription.ts',
	'google-subscription-status': './src/lambdas/googleSubscriptionStatus.ts',
	'google-update-subscriptions': './src/lambdas/googleUpdateSubscriptions.ts',
	'apple-fetch-offer-details': './src/lambdas/promotionalOffersAppleFetchOfferDetails.ts',
	'soft-opt-in-acquisitions': './src/lambdas/softOptInAcquisitions.ts',
	'soft-opt-in-acquisitions-dlq-processor':
		'./src/lambdas/softOptInAcquisitionsDLQProcessor.ts',
	googleoauth2: './src/lambdas/googleOauth2.ts',
};

async function build() {
	for (const [name, entry] of Object.entries(entryPoints)) {
		await esbuild.build({
			entryPoints: [entry],
			bundle: true,
			platform: 'node',
			target: 'node22',
			format: 'cjs',
			outfile: `dist/${name}.js`,
			minify: true,
			sourcemap: true,
			external: [
				'@aws-sdk/client-dynamodb',
				'@aws-sdk/client-s3',
				'@aws-sdk/client-sqs',
				'@aws-sdk/client-ssm',
				'google-auth-library',
			],
			tsconfig: 'tsconfig.json',
			mainFields: ['main'],
		});
	}
}

build().catch((err) => {
	console.error(err);
	process.exit(1);
});
