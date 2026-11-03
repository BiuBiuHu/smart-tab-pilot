import { DEFAULT_SETTINGS } from './constants.js';

/**
 * Read settings from chrome.storage.sync, merged with defaults.
 * @returns {Promise<typeof DEFAULT_SETTINGS>}
 */
export async function getSettings() {
  const stored = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  return { ...DEFAULT_SETTINGS, ...stored };
}

/**
 * Persist partial settings.
 * @param {Partial<typeof DEFAULT_SETTINGS>} partial
 */
export async function saveSettings(partial) {
  await chrome.storage.sync.set(partial);
}
