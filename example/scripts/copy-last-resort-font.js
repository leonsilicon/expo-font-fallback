#!/usr/bin/env node
// Copies the Last Resort font out of node_modules into the app's font assets so
// the config plugin can bundle it as the final entry of the fallback chain.
//
// The font (~9 MB) is a build artifact pulled from the `fontpkg-last-resort`
// npm package rather than committed to the repo. Run before prebuild/build.
const fs = require('fs');
const path = require('path');

const SOURCE = require.resolve('fontpkg-last-resort/LastResort-Regular.ttf');
const DEST_DIR = path.resolve(__dirname, '..', 'assets', 'fonts', 'generated');
const dest = path.join(DEST_DIR, 'LastResort-Regular.ttf');

fs.mkdirSync(DEST_DIR, { recursive: true });
fs.copyFileSync(SOURCE, dest);
console.log(`Copied Last Resort font -> ${path.relative(process.cwd(), dest)}`);
