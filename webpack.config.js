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

const googlePlaySubStatus = Object.assign({}, config, {
    entry: './typescript/src/playsubstatus/playsubstatus.ts',
    output: {
        filename: 'google-playsubstatus.js',
        path: path.resolve(__dirname, 'tsc-target'),
        libraryTarget: 'commonjs'
    }
});

module.exports = [googlePubSub, googlePlaySubStatus];