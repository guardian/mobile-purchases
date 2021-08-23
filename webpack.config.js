const path = require('path');

module.exports = {
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
    mode: 'production',
    entry: {
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
        "export-subscription-tables": "./typescript/src/export/exportSubscriptions.ts",
        "export-subscription-table-v2": "./typescript/src/export/exportSubscriptions-v2.ts",
        "export-subscription-events-table": "./typescript/src/export/exportEvents.ts",
        "export-historical-data": "./typescript/src/export/exportHistoricalData.ts",
        "apple-revalidate-receipts": "./typescript/src/revalidate-receipts/appleRevalidateReceipts.ts",
    },
    output: {
        path: path.resolve(__dirname, 'tsc-target'),
        libraryTarget: 'commonjs2'
    }
};
