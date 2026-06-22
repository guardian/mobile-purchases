const path = require('path');
const webpack = require('webpack');

module.exports = (env = {}) => ({
	devtool: 'inline-cheap-source-map',

	module: {
		rules: [
			{
				test: /\.ts$/,
				use: {
					loader: 'ts-loader',
					options: {
						configFile: 'tsconfig.json',
					},
				},
				exclude: /node_modules/,
			},
		],
	},

	resolve: {
		extensions: ['.ts', '.js'],
		extensionAlias: {
			'.js': ['.ts', '.js'],
			'.mjs': ['.mts', '.mjs'],
			'.cjs': ['.cts', '.cjs'],
		},
		// Force a single version of the library
		alias: {
			'google-auth-library': require.resolve('google-auth-library'),
		},
	},

	target: 'node',
	mode: env.production ? 'production' : 'development',

	entry: {
		'mobile-purchases-google-oauth2':
			'./src/handlers/mobile-purchases-google-oauth2.ts',
		'export-subscription-table-v2':
			'./src/handlers/export-subscription-table-v2.ts',
	},

	output: {
		path: path.resolve(__dirname, 'dist'),
		filename: '[name].js',
		libraryTarget: 'commonjs2',
		clean: true,
		chunkFilename: '[name].js',
	},

	optimization: {
		splitChunks: false,
		minimize: true,
		usedExports: true,
		runtimeChunk: false,
		// Disable all chunk optimizations
		removeAvailableModules: true,
		removeEmptyChunks: true,
		mergeDuplicateChunks: true,
	},

	// No externals - bundle everything
	externals: {},

	node: {
		__dirname: false,
		__filename: false,
	},

	plugins: [
		// Force a single chunk
		new webpack.optimize.LimitChunkCountPlugin({
			maxChunks: 1,
		}),
	],
});
