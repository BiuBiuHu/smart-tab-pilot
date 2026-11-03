/**
 * Who still needs a timed extract during 「立即整理」refine.
 * Must include every eligible uncached tab — never a hard cap.
 */
import { shouldSkipUrl } from './url-utils.js';

/**
 * @param {{ id?: number, url?: string }[]} tabs
 * @param {Iterable<number>} [cachedIds]
 * @returns {{ id: number, url?: string }[]}
 */
export function listUncachedEligibleTabs(tabs, cachedIds) {
  const cached = cachedIds instanceof Set ? cachedIds : new Set(cachedIds || []);
  return (tabs || []).filter((t) => {
    if (t.id == null) return false;
    if (shouldSkipUrl(t.url)) return false;
    if (cached.has(t.id)) return false;
    return true;
  });
}
