/**
 * Settings is a full-page view, mutually exclusive with the task list.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  nextPanelView,
  panelViewState,
  SETTINGS_PANEL_ID,
  TASK_VIEW_ID,
} from '../shared/settings-panel.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'sidepanel/sidepanel.html'), 'utf8');

describe('panel view switching (tasks ↔ settings)', () => {
  it('open settings hides the task view; back restores it', () => {
    assert.equal(nextPanelView('tasks', 'open-settings'), 'settings');
    assert.equal(nextPanelView('settings', 'back-to-tasks'), 'tasks');
    assert.equal(nextPanelView('settings', 'escape'), 'tasks');
    assert.equal(nextPanelView('settings', 'open-settings'), 'settings');

    const onSettings = panelViewState('settings', { quickSearchOn: true });
    assert.equal(onSettings.view, 'settings');
    assert.equal(onSettings.settingsHidden, false);
    assert.equal(onSettings.taskHidden, true);
    assert.equal(onSettings.searchHidden, true);
    assert.equal(onSettings.headerHintHidden, true);
    assert.equal(onSettings.settingsTrigger['aria-pressed'], 'true');
    assert.equal(onSettings.settingsTrigger['aria-label'], '当前视图：设置');
    assert.equal(onSettings.back['aria-label'], '返回任务视图');
    assert.equal(onSettings.back.hidden, false);

    const onTasks = panelViewState(nextPanelView('settings', 'back-to-tasks'), {
      quickSearchOn: true,
    });
    assert.equal(onTasks.view, 'tasks');
    assert.equal(onTasks.settingsHidden, true);
    assert.equal(onTasks.taskHidden, false);
    assert.equal(onTasks.searchHidden, false);
    assert.equal(onTasks.settingsTrigger['aria-pressed'], 'false');
    assert.equal(onTasks.settingsTrigger['aria-label'], '设置');
    assert.equal(onTasks.back.hidden, true);
  });

  it('does not treat outside click as a close action (not a popover)', () => {
    assert.equal(nextPanelView('settings', 'outside'), 'settings');
  });
});

describe('sidepanel HTML: settings page vs task surface', () => {
  it('has a 设置 control and a 返回任务视图 control', () => {
    assert.match(html, /id="btn-settings"/);
    assert.match(html, /aria-label="设置"/);
    assert.match(html, /id="btn-back-settings"/);
    assert.match(html, /aria-label="返回任务视图"/);
    assert.match(html, /返回任务视图/);
    assert.match(html, /id="settings-panel"/);
    assert.match(html, /id="settings-panel"[^>]*hidden/);
    const headerEnd = html.indexOf('</header>');
    const settingsIdx = html.indexOf('id="settings-panel"');
    const taskIdx = html.indexOf(`id="${TASK_VIEW_ID}"`);
    assert.ok(headerEnd > 0 && settingsIdx > headerEnd);
    assert.ok(taskIdx > 0);
    assert.equal(SETTINGS_PANEL_ID, 'settings-panel');
  });

  it('keeps Nano, model fields, and 功能开关 off the task-view card', () => {
    const settingsStart = html.indexOf('id="settings-panel"');
    const taskStart = html.indexOf('id="task-view-card"');
    const searchStart = html.indexOf('id="search-card"');
    assert.ok(settingsStart > 0 && taskStart > settingsStart && searchStart > taskStart);
    const settings = html.slice(settingsStart, taskStart);
    const task = html.slice(taskStart, searchStart);
    assert.match(settings, /返回任务视图/);
    assert.match(settings, /id="feature-toggles"/);
    assert.match(settings, /功能开关/);
    assert.match(settings, /id="scope-all"/);
    assert.match(settings, /id="toggle-dedupe"/);
    assert.match(settings, /id="nano-section"/);
    assert.match(settings, /Gemini Nano/);
    assert.match(settings, /Prompt API/);
    assert.match(settings, /id="custom-base-url"/);
    assert.match(task, /id="btn-group-now"/);
    assert.match(task, /id="btn-refresh-tasks"/);
    assert.match(task, /任务视图/);
    assert.doesNotMatch(task, /Gemini Nano/);
    assert.doesNotMatch(task, /Prompt API/);
    assert.doesNotMatch(task, /id="nano-section"/);
    assert.doesNotMatch(task, /id="custom-base-url"/);
    assert.doesNotMatch(task, /id="toggle-dedupe"/);
    assert.doesNotMatch(task, /功能开关/);
  });
});
