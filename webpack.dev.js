const path = require('path');
const { merge } = require('webpack-merge');
const common = require('./webpack.common.js');

module.exports = merge(common, {
    mode: 'development',
    devServer: {
        static: {
          directory: path.join(__dirname, './'),
        },
        compress: true,
        port: 5500,
        hot: true,
        client: {
            overlay: false
        },
	headers: {
	    "Cross-Origin-Embedder-Policy": "require-corp",
	    "Cross-Origin-Opener-Policy": "same-origin",
	}
    },
});
