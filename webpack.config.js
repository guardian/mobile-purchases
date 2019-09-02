const path = require('path');

const config = {
    devtool: 'inline-source-map',
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
    mode: 'production'
};

function entryPoint(sourceFile, outputFile) {
    return Object.assign({}, config, {
        entry: `./typescript/src/${sourceFile}`,
        output: {
            filename: outputFile,
            path: path.resolve(__dirname, 'tsc-target'),
            libraryTarget: 'commonjs'
        }
    });
}

const googlePubSub = entryPoint('pubsub/google.ts', 'google-pubsub.js');
const applePubSub = entryPoint('pubsub/apple.ts', 'apple-pubsub.js');
const googlePlaySubStatus = entryPoint('playsubstatus/playsubstatus.ts', 'google-playsubstatus.js');
const googleUserLink = entryPoint('link/google.ts', 'google-link-user-subscription.js');
const appleUserLink = entryPoint('link/apple.ts', 'apple-link-user-subscription.js');
const userSubscriptions = entryPoint('user/user.ts', 'user-subscriptions.js');
const googleUpdateSub = entryPoint('update-subs/google.ts', 'google-update-subscriptions.js');
const appleUpdateSub = entryPoint('update-subs/apple.ts', 'apple-update-subscriptions.js');
const exportSubs = entryPoint('export/exportSubscriptions.ts', 'export-subscription-tables.js');
const exportEvents = entryPoint('export/exportEvents.ts', 'export-subscription-events-table.js');

module.exports = [
    googlePubSub,
    applePubSub,
    googlePlaySubStatus,
    googleUpdateSub,
    appleUpdateSub,
    appleUserLink,
    googleUserLink,
    userSubscriptions,
    exportSubs,
    exportEvents
];
