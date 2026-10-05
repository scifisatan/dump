// The app runs the web app's own notebook core from ../src. Metro sees only this app and ../src,
// so packages imported there (TinyBase, Zod) resolve from this app's node_modules and load once.
const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.watchFolders = [path.resolve(__dirname, '../src')];
config.resolver.nodeModulesPaths = [path.resolve(__dirname, 'node_modules')];

module.exports = config;
