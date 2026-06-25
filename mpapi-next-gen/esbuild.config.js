const esbuild = require('esbuild');

// maintenance: please maintain alphabetical order
const entryPoints = {
	'export-historical-data': './src/lambdas/exportHistoricalData.ts',
	'export-subscription-events-table':
		'./src/lambdas/exportSubscriptionEventsTable.ts',
	'export-subscription-table-v2': './src/lambdas/exportSubscriptionTableV2.ts',
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
