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

const googlePubSub = Object.assign({}, config, {
    entry: './typescript/src/pubsub/google.ts',
    output: {
        filename: 'google-pubsub.js',
        path: path.resolve(__dirname, 'tsc-target'),
        libraryTarget: 'commonjs'
    }
});

const applePubSub = Object.assign({}, config, {
    entry: './typescript/src/pubsub/apple.ts',
    output: {
        filename: 'apple-pubsub.js',
        path: path.resolve(__dirname, 'tsc-target'),
        libraryTarget: 'commonjs'
    }
});

const googlePlaySubStatus = Object.assign({}, config, {
    entry: './typescript/src/playsubstatus/playsubstatus.ts',
    output: {
        filename: 'google-playsubstatus.js',
        path: path.resolve(__dirname, 'tsc-target'),
        libraryTarget: 'commonjs'
    }
});

const googleUserLink = Object.assign({}, config, {
    entry: './typescript/src/link/google.ts',
    output: {
        filename: 'google-link-user-subscription.js',
        path: path.resolve(__dirname, 'tsc-target'),
        libraryTarget: 'commonjs'
    }
});

const appleUserLink = Object.assign({}, config, {
    entry: './typescript/src/link/apple.ts',
    output: {
        filename: 'apple-link-user-subscription.js',
        path: path.resolve(__dirname, 'tsc-target'),
        libraryTarget: 'commonjs'
    }
});

const userSubscriptions = Object.assign({}, config, {
    entry: './typescript/src/user/user.ts',
    output: {
        filename: 'user-subscriptions.js',
        path: path.resolve(__dirname, 'tsc-target'),
        libraryTarget: 'commonjs'
    }
});

const googleUpdateSub = Object.assign({}, config, {
    entry: './typescript/src/update-subs/google.ts',
    output: {
        filename: 'google-update-subscriptions.js',
        path: path.resolve(__dirname, 'tsc-target'),
        libraryTarget: 'commonjs'
    }
});


const appleUpdateSub = Object.assign({}, config, {
    entry: './typescript/src/update-subs/apple.ts',
    output: {
        filename: 'apple-update-subscriptions.js',
        path: path.resolve(__dirname, 'tsc-target'),
        libraryTarget: 'commonjs'
    }
});


module.exports = [googlePubSub, applePubSub, googlePlaySubStatus, googleUpdateSub, appleUpdateSub, appleUserLink, googleUserLink, userSubscriptions]
