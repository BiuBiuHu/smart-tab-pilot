#!/usr/bin/env node
/**
 * Pack a clean MV3 zip: manifest + runtime files only.
 * Usage: node scripts/pack-extension.mjs
 * Output: artifacts/smart-tab-pilot-<version>.zip
 */
import { mkdirSync, rmSync, cpSync, readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PACK_INCLUDE = [
  'manifest.json',
  'LICENSE',
  'background',
  'sidepanel',
  'shared',
  'content',
  'icons',
  '_locales',
];

export const PACK_EXCLUDE_HINTS = [
  'tests',
  'docs',
  '.git',
  'node_modules',
  'popup',
  'scripts',
  'artifacts',
  'README.md',
  'package.json',
];

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

export function readPackVersion(repoRoot = root) {
  const manifest = JSON.parse(readFileSync(join(repoRoot, 'manifest.json'), 'utf8'));
  if (!manifest.version || !/^\d+\.\d+\.\d+$/.test(manifest.version)) {
    throw new Error(`manifest.json version is missing or placeholder: ${manifest.version}`);
  }
  return manifest.version;
}

export function zipNameFor(version) {
  return `smart-tab-pilot-${version}.zip`;
}

function listFiles(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) listFiles(full, acc);
    else acc.push(full);
  }
  return acc;
}

export function packExtension(repoRoot = root) {
  const version = readPackVersion(repoRoot);
  const outDir = join(repoRoot, 'artifacts');
  const zipName = zipNameFor(version);
  const zipPath = join(outDir, zipName);
  const stage = join(outDir, `.pack-stage-${version}`);

  mkdirSync(outDir, { recursive: true });
  rmSync(stage, { recursive: true, force: true });
  mkdirSync(stage, { recursive: true });

  for (const item of PACK_INCLUDE) {
    const from = join(repoRoot, item);
    if (!existsSync(from)) throw new Error(`missing pack input: ${item}`);
    cpSync(from, join(stage, item), { recursive: true });
  }

  const staged = listFiles(stage).map((f) => relative(stage, f).replaceAll('\\', '/'));
  const leaked = staged.filter((f) =>
    PACK_EXCLUDE_HINTS.some((hint) => f === hint || f.startsWith(`${hint}/`)),
  );
  if (leaked.length) throw new Error(`pack leak: ${leaked.join(', ')}`);

  rmSync(zipPath, { force: true });
  const zipped = spawnSync('zip', ['-r', '-q', zipPath, ...PACK_INCLUDE], {
    cwd: stage,
    encoding: 'utf8',
  });
  if (zipped.status !== 0) {
    throw new Error(`zip failed: ${zipped.stderr || zipped.stdout || zipped.status}`);
  }
  rmSync(stage, { recursive: true, force: true });
  return { version, zipPath, zipName, files: staged.sort() };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const result = packExtension();
  console.log(`packed ${result.zipName}`);
  console.log(result.zipPath);
  for (const f of result.files) console.log(`  ${f}`);
}
