const path = require('path');

const getEntries = (env) => {
  const entries = {
    "google-pubsub": "./typescript/src/pubsub/google.ts",
    "apple-pubsub": "./typescript/src/pubsub/apple.ts",
    "google-subscription-status": "./typescript/src/subscription-status/googleSubStatus.ts",
    "apple-subscription-status": "./typescript/src/subscription-status/appleSubStatus.ts",
    "google-link-user-subscription": "./typescript/src/link/google.ts",
    "apple-link-user-subscription": "./typescript/src/link/apple.ts",
    "delete-user-subscription": "./typescript/src/link/deleteLink.ts",
    "user-subscriptions": "./typescript/src/user/user.ts",
    "google-update-subscriptions": "./typescript/src/update-subs/google.ts",
    "apple-update-subscriptions": "./typescript/src/update-subs/apple.ts",
    "soft-opt-in-acquisitions": "./typescript/src/soft-opt-ins/acquisitions.ts",
    "soft-opt-in-acquisitions-dql-processor": "./typescript/src/soft-opt-ins/dql-processor.ts",
    "export-subscription-tables": "./typescript/src/export/exportSubscriptions.ts",
    "export-subscription-table-v2": "./typescript/src/export/exportSubscriptions-v2.ts",
    "export-subscription-events-table": "./typescript/src/export/exportEvents.ts",
    "export-historical-data": "./typescript/src/export/exportHistoricalData.ts",
    "apple-revalidate-receipts": "./typescript/src/revalidate-receipts/appleRevalidateReceipts.ts",
  };
  return env.production ? entries : {
    ...entries,
    "test-launcher": "./typescript/src/test-launcher/test-launcher.ts",
  };
};

module.exports = (env) => ({
  devtool: 'inline-cheap-source-map',
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/
      }
    ]
  },
  resolve: {
    extensions: [ '.tsx', '.ts', '.js' ]
  },
  target: 'node',
  mode: env.production ? 'production' : 'development',
  entry: getEntries(env),
  output: {
    path: path.resolve(__dirname, 'tsc-target'),
    libraryTarget: 'commonjs2'
  }
});
