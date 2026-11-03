/**
 * Chrome Web Store pack recipe: allowlist only, version is store-ready.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { describe, it } from 'node:test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PACK_EXCLUDE_HINTS,
  PACK_INCLUDE,
  packExtension,
  readPackVersion,
  zipNameFor,
} from '../scripts/pack-extension.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

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

  it('writes artifacts/smart-tab-pilot-<version>.zip without tests/docs/git', () => {
    const { version, zipPath, files } = packExtension(root);
    assert.equal(zipNameFor(version), `smart-tab-pilot-${version}.zip`);
    assert.ok(existsSync(zipPath));
    assert.ok(files.includes('manifest.json'));
    assert.ok(files.some((f) => f.startsWith('sidepanel/')));
    assert.ok(files.some((f) => f.startsWith('_locales/')));
    assert.ok(!files.some((f) => f.startsWith('tests/') || f.startsWith('docs/') || f.startsWith('.git')));

    const listing = spawnSync('unzip', ['-l', zipPath], { encoding: 'utf8' });
    assert.equal(listing.status, 0, listing.stderr);
    assert.match(listing.stdout, /manifest\.json/);
    assert.doesNotMatch(listing.stdout, /\btests\//);
    assert.doesNotMatch(listing.stdout, /\bdocs\//);
    assert.doesNotMatch(listing.stdout, /\.git\//);
    assert.doesNotMatch(listing.stdout, /node_modules/);
    assert.doesNotMatch(listing.stdout, /\bpopup\//);
  });
});
