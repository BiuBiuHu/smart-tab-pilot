/**
 * Side-panel views: task list vs settings page (mutually exclusive, not a popover).
 */

export const SETTINGS_PANEL_ID = 'settings-panel';
export const TASK_VIEW_ID = 'task-view-card';

/**
 * @typedef {'tasks'|'settings'} PanelView
 */

/**
 * @param {PanelView | boolean} current
 * @param {'open-settings'|'back-to-tasks'|'toggle'|'escape'|'settings'|'back'} action
 * @returns {PanelView}
 */
export function nextPanelView(current, action) {
  const now = current === true || current === 'settings' ? 'settings' : 'tasks';
  if (action === 'open-settings' || action === 'settings') return 'settings';
  if (action === 'back-to-tasks' || action === 'back' || action === 'escape') return 'tasks';
  if (action === 'toggle') return now === 'settings' ? 'tasks' : 'settings';
  return now;
}

/**
 * @param {PanelView | boolean} view
 * @param {{ quickSearchOn?: boolean }} [opts]
 */
export function panelViewState(view, opts = {}) {
  const settings = view === true || view === 'settings';
  const quickSearchOn = Boolean(opts.quickSearchOn);
  return {
    view: settings ? 'settings' : 'tasks',
    settingsHidden: !settings,
    taskHidden: settings,
    searchHidden: settings || !quickSearchOn,
    headerHintHidden: settings,
    settingsTrigger: {
      title: settings ? '当前：设置' : '设置',
      'aria-label': settings ? '当前视图：设置' : '设置',
      'aria-pressed': settings ? 'true' : 'false',
      'aria-controls': SETTINGS_PANEL_ID,
    },
    back: {
      title: '返回任务视图',
      'aria-label': '返回任务视图',
      hidden: !settings,
    },
  };
}

/** @deprecated use nextPanelView */
export function nextSettingsOpen(currentOpen, action) {
  const map =
    action === 'open'
      ? 'open-settings'
      : action === 'close' || action === 'outside'
        ? 'back-to-tasks'
        : action;
  return nextPanelView(currentOpen, map) === 'settings';
}

/** @deprecated use panelViewState */
export function settingsPanelView(open) {
  const state = panelViewState(open ? 'settings' : 'tasks');
  return {
    open: !state.settingsHidden,
    hidden: state.settingsHidden,
    taskHidden: state.taskHidden,
    trigger: {
      title: state.settingsTrigger.title,
      'aria-label': state.settingsTrigger['aria-label'],
      'aria-expanded': state.settingsTrigger['aria-pressed'],
      'aria-controls': state.settingsTrigger['aria-controls'],
    },
  };
}

export function settingsTriggerAttrs(open) {
  return panelViewState(open ? 'settings' : 'tasks').settingsTrigger;
}
