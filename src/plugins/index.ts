export type {
  PluginManifest,
  PluginRule,
  PluginContext,
  PluginAnalyzer,
  PluginAnalyzerResult,
  PluginSetupContext,
  FathomPlugin,
} from './types.js';

export { createPluginContext } from './context.js';
export { PluginRegistry, defaultPluginRegistry } from './registry.js';
export { reactPlugin, REACT_RULES, reactAnalyzer } from './examples/react.js';
