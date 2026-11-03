/**
 * Side-panel header settings: open/close the model-config panel.
 * Pure — no DOM. Side panel applies hidden / aria-expanded from this.
 */

export const SETTINGS_PANEL_ID = 'settings-panel';

/**
 * @param {boolean} currentOpen
 * @param {'toggle'|'open'|'close'|'outside'|'escape'} action
 */
export function nextSettingsOpen(currentOpen, action) {
  if (action === 'toggle') return !currentOpen;
  if (action === 'open') return true;
  if (action === 'close' || action === 'outside' || action === 'escape') return false;
  return Boolean(currentOpen);
}

/**
 * @param {boolean} open
 */
export function settingsTriggerAttrs(open) {
  return {
    title: '设置',
    'aria-label': '设置',
    'aria-expanded': open ? 'true' : 'false',
    'aria-controls': SETTINGS_PANEL_ID,
  };
}

/**
 * @param {boolean} open
 */
export function settingsPanelView(open) {
  const on = Boolean(open);
  return {
    open: on,
    hidden: !on,
    trigger: settingsTriggerAttrs(on),
  };
}

/**
 * True when a click target is outside both the gear and the panel.
 * @param {{ toggleContains?: boolean, panelContains?: boolean }} hit
 */
export function isSettingsOutsideClick(hit) {
  return !hit?.toggleContains && !hit?.panelContains;
}
