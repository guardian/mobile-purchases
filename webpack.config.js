const path = require('path');

const entries = {
  "google-pubsub": "./typescript/src/pubsub/google.ts",
  "apple-pubsub": "./typescript/src/pubsub/apple.ts",
  "feast-apple-pubsub": "./typescript/src/feast/pubsub/apple.ts",
  "feast-google-pubsub": "./typescript/src/feast/pubsub/google.ts",
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
  entry: entries,
  output: {
    path: path.resolve(__dirname, 'tsc-target'),
    libraryTarget: 'commonjs2'
  }
});
