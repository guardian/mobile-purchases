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

const userLink = Object.assign({}, config, {
    entry: './typescript/src/link/index.ts',
    output: {
        filename: 'link-user-subscription.js',
        path: path.resolve(__dirname, 'tsc-target'),
        libraryTarget: 'commonjs'
    }
});

const updateSubs = Object.assign({}, config, {
    entry: '../typescripts/src/link/index.js',
    output: {
        fileName: 'update-subscriptions.js',
        path: path.resolve(__dirname, 'tsc-target'),
        libraryTarget: 'commonjs'
    }
});


module.exports = [googlePubSub, applePubSub, googlePlaySubStatus, userLink];