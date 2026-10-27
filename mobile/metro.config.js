const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
// Keep bundling usable on the 8 GB Windows development machine.
config.maxWorkers = 2;
module.exports = config;
