const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];
// Keep hierarchical lookup so Expo Router / Metro runtime can resolve nested deps.
config.resolver.disableHierarchicalLookup = false;
config.resolver.unstable_enableSymlinks = true;
config.resolver.extraNodeModules = {
  "@fitness-autopilot/contracts": path.resolve(workspaceRoot, "packages/contracts"),
  "@fitness-autopilot/domain": path.resolve(workspaceRoot, "packages/domain"),
  "@fitness-autopilot/validation": path.resolve(workspaceRoot, "packages/validation"),
  "@fitness-autopilot/test-fixtures": path.resolve(workspaceRoot, "packages/test-fixtures"),
};

module.exports = config;
