// Entry point for the Expo config plugin. Expo loads this file (CommonJS) at
// prebuild time. It re-exports the compiled plugin from `plugin/build`.
module.exports = require('./plugin/build/withFontFallback').default;
