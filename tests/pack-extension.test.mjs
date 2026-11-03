/**
 * Chrome Web Store pack recipe: allowlist only, version is store-ready.
 * Must pack without a system `zip` binary (Node / Python fallback).
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PACK_EXCLUDE_HINTS,
  PACK_INCLUDE,
  listZipNames,
  packExtension,
  readPackVersion,
  resolveZipper,
  writeZipArchive,
  zipNameFor,
} from '../scripts/pack-extension.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function assertCleanZip(zipPath, files) {
  assert.ok(existsSync(zipPath));
  assert.ok(files.includes('manifest.json'));
  assert.ok(files.some((f) => f.startsWith('sidepanel/')));
  assert.ok(files.some((f) => f.startsWith('_locales/')));
  assert.ok(!files.some((f) => f.startsWith('tests/') || f.startsWith('docs/') || f.startsWith('.git')));
  const names = listZipNames(readFileSync(zipPath));
  assert.ok(names.includes('manifest.json'));
  assert.ok(names.some((f) => f.startsWith('sidepanel/')));
  assert.ok(!names.some((f) => f.startsWith('tests/') || f.startsWith('docs/') || f.startsWith('.git')));
  assert.ok(!names.some((f) => f.includes('node_modules') || f.startsWith('popup/')));
}

describe('Chrome Web Store pack', () => {
  it('uses a real semver in manifest (not a placeholder)', () => {
    const version = readPackVersion(root);
    assert.match(version, /^\d+\.\d+\.\d+$/);
    assert.notEqual(version, '0.0.0');
    assert.notEqual(version, '0.0.1');
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    assert.equal(pkg.version, version);
  });

  it('allowlists only MV3 runtime paths', () => {
    for (const must of ['manifest.json', 'background', 'sidepanel', 'shared', 'content', 'icons', '_locales']) {
      assert.ok(PACK_INCLUDE.includes(must), must);
    }
    for (const no of ['tests', 'docs', '.git', 'node_modules', 'popup']) {
      assert.ok(!PACK_INCLUDE.includes(no), no);
      assert.ok(PACK_EXCLUDE_HINTS.includes(no), no);
    }
  });

  it('writes a zip with the default zipper and lists it without unzip(1)', () => {
    const { version, zipPath, files, zipper } = packExtension(root);
    assert.equal(zipNameFor(version), `smart-tab-pilot-${version}.zip`);
    assert.ok(['zip', 'python', 'node'].includes(zipper));
    assertCleanZip(zipPath, files);
  });

  it('packs with the pure Node zipper when zip CLI is skipped', () => {
    assert.equal(resolveZipper(['node']), 'node');
    const { zipPath, files, zipper } = packExtension(root, { prefer: ['node'] });
    assert.equal(zipper, 'node');
    assertCleanZip(zipPath, files);
  });

  it('round-trips a tiny archive through writeZipArchive + listZipNames', () => {
    const buf = writeZipArchive([
      { name: 'hello.txt', data: Buffer.from('hi') },
      { name: 'dir/a.js', data: Buffer.from('export default 1\n') },
    ]);
    assert.deepEqual(listZipNames(buf).sort(), ['dir/a.js', 'hello.txt']);
  });
});

describe('hosted privacy policy HTML', () => {
  it('ships a standalone privacy.html with the same data-flow claims', () => {
    const html = readFileSync(join(root, 'docs/chrome-web-store/privacy.html'), 'utf8');
    assert.match(html, /<!DOCTYPE html>/i);
    assert.match(html, /Privacy Policy/);
    assert.match(html, /user-provided/);
    assert.match(html, /No analytics/);
    assert.match(html, /on-device/);
    assert.match(html, /chrome\.storage\.sync/);
    assert.doesNotMatch(html, /https?:\/\/cdn\./);
  });
});
