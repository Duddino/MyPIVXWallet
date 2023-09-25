/* eslint-env node */
/* eslint @typescript-eslint/no-var-requires: "off" */

const { merge } = require('webpack-merge');
const common = require('./webpack.common.js');
const CssMinimizerPlugin = require('css-minimizer-webpack-plugin');
const webpack = require('webpack');

module.exports = merge(common, {
    mode: 'production',
    optimization: {
        // Inject a CSS minimizer alongside the default JS minimizer (the '...' is the inclusion of the default webpack JS minimizer!)
        minimizer: [new CssMinimizerPlugin(), '...'],
    },
    plugins: [
        new webpack.DefinePlugin({
            __VUE_OPTIONS_API__: false,
            __VUE_PROD_DEVTOOLS__: false,
        }),
    ],
});
