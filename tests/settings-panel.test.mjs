/**
 * Header settings control: model config lives in a collapsible panel.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  isSettingsOutsideClick,
  nextSettingsOpen,
  SETTINGS_PANEL_ID,
  settingsPanelView,
  settingsTriggerAttrs,
} from '../shared/settings-panel.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'sidepanel/sidepanel.html'), 'utf8');

describe('settings panel state', () => {
  it('toggles, closes on outside / escape, and exposes 设置 a11y attrs', () => {
    assert.equal(nextSettingsOpen(false, 'toggle'), true);
    assert.equal(nextSettingsOpen(true, 'toggle'), false);
    assert.equal(nextSettingsOpen(true, 'outside'), false);
    assert.equal(nextSettingsOpen(true, 'escape'), false);
    assert.equal(nextSettingsOpen(false, 'open'), true);

    const closed = settingsPanelView(false);
    assert.equal(closed.hidden, true);
    assert.equal(closed.trigger['aria-label'], '设置');
    assert.equal(closed.trigger.title, '设置');
    assert.equal(closed.trigger['aria-expanded'], 'false');
    assert.equal(closed.trigger['aria-controls'], SETTINGS_PANEL_ID);

    const open = settingsPanelView(true);
    assert.equal(open.hidden, false);
    assert.equal(open.trigger['aria-expanded'], 'true');
    assert.deepEqual(settingsTriggerAttrs(true)['aria-label'], '设置');
  });

  it('outside click ignores hits on the gear or the panel', () => {
    assert.equal(isSettingsOutsideClick({ toggleContains: true, panelContains: false }), false);
    assert.equal(isSettingsOutsideClick({ toggleContains: false, panelContains: true }), false);
    assert.equal(isSettingsOutsideClick({ toggleContains: false, panelContains: false }), true);
  });
});

describe('sidepanel HTML: model fields and feature toggles only inside settings', () => {
  it('places a 设置 control at the header and hides the panel by default', () => {
    assert.match(html, /id="btn-settings"/);
    assert.match(html, /aria-label="设置"/);
    assert.match(html, /title="设置"/);
    assert.match(html, /id="settings-panel"/);
    assert.match(html, /id="settings-panel"[^>]*hidden/);
    const headerIdx = html.indexOf('class="header"');
    const btnIdx = html.indexOf('id="btn-settings"');
    const taskIdx = html.indexOf('id="task-view-card"');
    assert.ok(headerIdx >= 0 && btnIdx > headerIdx && btnIdx < taskIdx);
  });

  it('moves Nano, custom model, 功能开关, and window scope off the main body', () => {
    const start = html.indexOf('id="settings-panel"');
    const end = html.indexOf('id="task-view-card"');
    assert.ok(start > 0 && end > start);
    const inside = html.slice(start, end);
    const outsideBefore = html.slice(0, start);
    const outsideAfter = html.slice(end);
    assert.match(inside, /id="feature-toggles"/);
    assert.match(inside, /功能开关/);
    assert.match(inside, /id="scope-all"/);
    assert.match(inside, /id="scope-current"/);
    assert.match(inside, /id="toggle-dedupe"/);
    assert.match(inside, /id="toggle-ignore-hash"/);
    assert.match(inside, /id="toggle-auto-group"/);
    assert.match(inside, /id="toggle-quick-search"/);
    assert.match(inside, /id="nano-section"/);
    assert.match(inside, /id="custom-base-url"/);
    assert.match(inside, /id="custom-api-key"/);
    assert.match(inside, /id="custom-model"/);
    assert.match(inside, /id="btn-save-custom"/);
    assert.match(inside, /id="btn-download-nano"/);
    assert.doesNotMatch(outsideBefore, /id="custom-base-url"/);
    assert.doesNotMatch(outsideAfter, /id="nano-section"/);
    assert.doesNotMatch(outsideAfter, /id="custom-base-url"/);
    assert.doesNotMatch(outsideAfter, /id="toggle-dedupe"/);
    assert.doesNotMatch(outsideAfter, /id="scope-all"/);
    assert.doesNotMatch(outsideAfter, /功能开关/);
    assert.doesNotMatch(outsideAfter, /Gemini Nano/);
    assert.doesNotMatch(outsideAfter, /Prompt API/);
    assert.doesNotMatch(outsideAfter, /id="nano-status"/);
    assert.doesNotMatch(outsideAfter, /id="btn-download-nano"/);
    assert.match(outsideAfter, /id="btn-group-now"/);
    assert.match(outsideAfter, /id="btn-refresh-tasks"/);
  });
});
