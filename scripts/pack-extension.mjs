#!/usr/bin/env node
/**
 * Pack a clean MV3 zip: manifest + runtime files only.
 * Usage: node scripts/pack-extension.mjs
 * Output: artifacts/smart-tab-pilot-<version>.zip
 *
 * Zipper order: system `zip` → `python3 -m zipfile` → pure Node (zlib/store).
 */
import {
  mkdirSync,
  rmSync,
  cpSync,
  readFileSync,
  writeFileSync,
  existsSync,
  readdirSync,
  statSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32 } from 'node:zlib';

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

export const ZIPPER_ORDER = ['zip', 'python', 'node'];

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

export function hasCommand(cmd, args = ['-v']) {
  const r = spawnSync(cmd, args, { encoding: 'utf8' });
  return !r.error && r.status === 0;
}

export function hasPythonZipfile() {
  const r = spawnSync('python3', ['-c', 'import zipfile'], { encoding: 'utf8' });
  return !r.error && r.status === 0;
}

/**
 * @param {string[]} [prefer]
 * @returns {'zip'|'python'|'node'}
 */
export function resolveZipper(prefer = ZIPPER_ORDER) {
  for (const kind of prefer) {
    if (kind === 'node') return 'node';
    if (kind === 'zip' && hasCommand('zip')) return 'zip';
    if (kind === 'python' && hasPythonZipfile()) return 'python';
  }
  return 'node';
}

function listFiles(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) listFiles(full, acc);
    else acc.push(full);
  }
  return acc;
}

function u16(n) {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(n);
  return b;
}

function u32(n) {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n >>> 0);
  return b;
}

function dosDateTime(date = new Date()) {
  const seconds = Math.floor(date.getSeconds() / 2);
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | seconds;
  const dosDate = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { dosTime, dosDate };
}

/**
 * Minimal ZIP (stored / method 0). Enough for Chrome Web Store upload.
 * @param {{ name: string, data: Buffer }[]} entries
 */
export function writeZipArchive(entries) {
  const { dosTime, dosDate } = dosDateTime();
  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, 'utf8');
    const crc = crc32(data);
    const local = Buffer.concat([
      u32(0x04034b50),
      u16(20),
      u16(0),
      u16(0),
      u16(dosTime),
      u16(dosDate),
      u32(crc),
      u32(data.length),
      u32(data.length),
      u16(nameBuf.length),
      u16(0),
      nameBuf,
      data,
    ]);
    locals.push(local);
    centrals.push(
      Buffer.concat([
        u32(0x02014b50),
        u16(20),
        u16(20),
        u16(0),
        u16(0),
        u16(dosTime),
        u16(dosDate),
        u32(crc),
        u32(data.length),
        u32(data.length),
        u16(nameBuf.length),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(0),
        u32(offset),
        nameBuf,
      ]),
    );
    offset += local.length;
  }

  const central = Buffer.concat(centrals);
  const eocd = Buffer.concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(entries.length),
    u16(entries.length),
    u32(central.length),
    u32(offset),
    u16(0),
  ]);
  return Buffer.concat([...locals, central, eocd]);
}

/**
 * @param {Buffer} buf
 * @returns {string[]}
 */
export function listZipNames(buf) {
  let eocd = -1;
  const min = Math.max(0, buf.length - 22 - 0xffff);
  for (let i = buf.length - 22; i >= min; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('not a zip (no EOCD)');
  const count = buf.readUInt16LE(eocd + 10);
  let i = buf.readUInt32LE(eocd + 16);
  const names = [];
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(i) !== 0x02014b50) throw new Error('bad central directory');
    const nameLen = buf.readUInt16LE(i + 28);
    const extraLen = buf.readUInt16LE(i + 30);
    const commentLen = buf.readUInt16LE(i + 32);
    names.push(buf.subarray(i + 46, i + 46 + nameLen).toString('utf8'));
    i += 46 + nameLen + extraLen + commentLen;
  }
  return names;
}

function zipWithCli(stage, zipPath, include) {
  const zipped = spawnSync('zip', ['-r', '-q', zipPath, ...include], {
    cwd: stage,
    encoding: 'utf8',
  });
  if (zipped.error || zipped.status !== 0) {
    throw new Error(`zip failed: ${zipped.stderr || zipped.stdout || zipped.error?.message || zipped.status}`);
  }
}

function zipWithPython(stage, zipPath) {
  const script = `
import os, sys, zipfile
root, dest = sys.argv[1], sys.argv[2]
with zipfile.ZipFile(dest, "w", compression=zipfile.ZIP_DEFLATED) as zf:
    for dirpath, _, files in os.walk(root):
        for name in files:
            full = os.path.join(dirpath, name)
            arc = os.path.relpath(full, root).replace(os.sep, "/")
            zf.write(full, arc)
`;
  const r = spawnSync('python3', ['-c', script, stage, zipPath], { encoding: 'utf8' });
  if (r.error || r.status !== 0) {
    throw new Error(`python zip failed: ${r.stderr || r.error?.message || r.status}`);
  }
}

function zipWithNode(stage, zipPath) {
  const entries = listFiles(stage).map((full) => ({
    name: relative(stage, full).replaceAll('\\', '/'),
    data: readFileSync(full),
  }));
  writeFileSync(zipPath, writeZipArchive(entries));
}

function writeZipFromStage(stage, zipPath, zipper, include) {
  if (zipper === 'zip') zipWithCli(stage, zipPath, include);
  else if (zipper === 'python') zipWithPython(stage, zipPath);
  else zipWithNode(stage, zipPath);
}

/**
 * @param {string} [repoRoot]
 * @param {{ prefer?: string[] }} [opts]
 */
export function packExtension(repoRoot = root, opts = {}) {
  const version = readPackVersion(repoRoot);
  const outDir = join(repoRoot, 'artifacts');
  const zipName = zipNameFor(version);
  const zipPath = join(outDir, zipName);
  const stage = join(outDir, `.pack-stage-${version}`);
  const zipper = resolveZipper(opts.prefer);

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
  try {
    writeZipFromStage(stage, zipPath, zipper, PACK_INCLUDE);
  } catch (err) {
    if (zipper !== 'node') {
      zipWithNode(stage, zipPath);
    } else {
      throw err;
    }
  }
  rmSync(stage, { recursive: true, force: true });
  return { version, zipPath, zipName, files: staged.sort(), zipper };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const result = packExtension();
  console.log(`packed ${result.zipName} via ${result.zipper}`);
  console.log(result.zipPath);
  for (const f of result.files) console.log(`  ${f}`);
}
