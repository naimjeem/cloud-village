#!/usr/bin/env -S tsx
import fs from 'node:fs';
import path from 'node:path';
import { parseCompose } from './parsers/dockerCompose';
import { parsePackageJsons } from './parsers/packageJson';
import { parseDotenv } from './parsers/dotenv';
import { parseServerless } from './parsers/serverless';
import { parseK8s } from './parsers/k8s';
import { mergeVillages } from './merge';
import { autoLayout } from '../src/loaders/autoLayout';

const argv = process.argv.slice(2);
if (argv.length === 0 || argv.includes('--help') || argv.includes('-h')) {
  console.log(`Usage:
  npm run generate -- <project-path> [-o <output.json>] [--skip <parsers>]

Parsers (run by default): compose, pkg, env, serverless, k8s
  --skip pkg,env       comma-separated list to skip

Examples:
  npm run generate -- ../tap-games
  npm run generate -- /path/to/project -o /tmp/village.json
  npm run generate -- . --skip k8s
`);
  process.exit(0);
}

const projectPath = path.resolve(argv[0]);
if (!fs.existsSync(projectPath)) {
  console.error(`Path not found: ${projectPath}`);
  process.exit(1);
}

const outIdx = argv.findIndex((a) => a === '-o' || a === '--output');
const outPath =
  outIdx >= 0 && argv[outIdx + 1]
    ? path.resolve(argv[outIdx + 1])
    : path.join(projectPath, 'village.json');

const skipIdx = argv.findIndex((a) => a === '--skip');
const skipped = new Set(
  skipIdx >= 0 && argv[skipIdx + 1] ? argv[skipIdx + 1].split(',') : []
);

const projName = path.basename(projectPath);
console.log(`Scanning ${projectPath}…`);

const parts = [];
if (!skipped.has('compose')) {
  const v = parseCompose(projectPath);
  console.log(`  compose:    ${v.components.length} components, ${v.connections.length} edges`);
  parts.push(v);
}
if (!skipped.has('pkg')) {
  const v = parsePackageJsons(projectPath);
  console.log(`  package:    ${v.components.length} components, ${v.connections.length} edges`);
  parts.push(v);
}
if (!skipped.has('env')) {
  const v = parseDotenv(projectPath);
  console.log(`  dotenv:     ${v.components.length} components, ${v.connections.length} edges`);
  parts.push(v);
}
if (!skipped.has('serverless')) {
  const v = parseServerless(projectPath);
  console.log(`  serverless: ${v.components.length} components, ${v.connections.length} edges`);
  parts.push(v);
}
if (!skipped.has('k8s')) {
  const v = parseK8s(projectPath);
  console.log(`  k8s:        ${v.components.length} components, ${v.connections.length} edges`);
  parts.push(v);
}

const merged = mergeVillages(projName, parts);
merged.components = autoLayout(merged.components, merged.connections);

if (merged.components.length === 0) {
  console.error('\nNo components detected. Try removing --skip flags or pass a different path.');
  process.exit(1);
}

fs.writeFileSync(outPath, JSON.stringify(merged, null, 2));
console.log(`\n✓ Wrote ${merged.components.length} components, ${merged.connections.length} edges`);
console.log(`  → ${outPath}`);
console.log(`\nLoad in UI: 📂 JSON → ${outPath}`);
