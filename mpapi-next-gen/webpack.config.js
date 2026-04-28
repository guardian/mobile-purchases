const path = require('path');

module.exports = (env = {}) => ({
	// Good for debugging Lambda errors
	devtool: 'inline-cheap-source-map',

	module: {
		rules: [
			{
				test: /\.ts$/,
				use: 'ts-loader',
				exclude: /node_modules/,
			},
		],
	},

	resolve: {
		extensions: ['.ts', '.js'],
	},

	target: 'node',
	mode: env.production ? 'production' : 'development',

	// Your Lambda handlers
	entry: {
		'mobile-purchases-google-oauth2':
			'./src/handlers/mobile-purchases-google-oauth2.ts',
	},

	output: {
		path: path.resolve(__dirname, 'dist'),
		filename: '[name].js',
		libraryTarget: 'commonjs2',
		clean: true,
	},

	// Optimize bundle size (AWS SDK v3 is already modular)
	optimization: {
		usedExports: true,
	},
});
