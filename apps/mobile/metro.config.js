// Expo's default Metro config detects the npm-workspaces monorepo automatically
// (watches the repo root so @ukbj/* packages resolve from source).
const { getDefaultConfig } = require('expo/metro-config');

module.exports = getDefaultConfig(__dirname);
