/**
 * Indeed External Jobs Exporter — Background Service Worker
 *
 * 1. Badge counter: updates the extension badge whenever jobs are saved.
 * 2. RESOLVE_EXTERNAL_URL: given an Indeed apply-redirect URL, opens it in a
 *    hidden background tab, waits for the tab to redirect away from indeed.com
 *    to the real company site, captures that URL, closes the tab, and responds.
 */

const STORAGE_KEY = 'indeed_external_jobs';

// ─── Badge counter ────────────────────────────────────────────────────────────

chrome.storage.local.onChanged.addListener((changes) => {
  if (!changes[STORAGE_KEY]) return;
  const jobs  = changes[STORAGE_KEY].newValue || {};
  const count = Object.values(jobs).filter((j) => !j.isEasyApply).length;
  chrome.action.setBadgeText({ text: count > 0 ? String(count) : '' });
  chrome.action.setBadgeBackgroundColor({ color: '#16a34a' });
});

// ─── External URL resolver ────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type !== 'RESOLVE_EXTERNAL_URL') return;

  const { applyUrl } = message;
  let tabId   = null;
  let settled = false;

  function finish(url) {
    if (settled) return;
    settled = true;
    chrome.tabs.onUpdated.removeListener(onUpdated);
    // Close the tab silently; swallow "No tab with id" errors if already gone
    if (tabId !== null) {
      chrome.tabs.remove(tabId, () => { void chrome.runtime.lastError; });
    }
    sendResponse({ externalUrl: url });
  }

  // Fired for every URL change in any tab; we filter by our tabId
  function onUpdated(updatedTabId, changeInfo) {
    if (tabId === null || updatedTabId !== tabId) return;
    const url = changeInfo.url || '';
    // The moment the tab leaves indeed.com is when the external site URL appears
    if (url && !url.includes('indeed.com') && url.startsWith('http')) {
      finish(url);
    }
  }

  // Register the listener BEFORE creating the tab to avoid missing fast redirects
  chrome.tabs.onUpdated.addListener(onUpdated);

  chrome.tabs.create({ url: applyUrl, active: false }, (tab) => {
    tabId = tab.id;

    // Hard timeout: if the redirect hasn't fired within 2.5 s, use whatever
    // URL the tab currently shows (might still be the indeed.com redirect page).
    // Guard with `settled` — finish() may have already closed the tab via onUpdated.
    setTimeout(() => {
      chrome.tabs.get(tabId, (t) => {
        void chrome.runtime.lastError; // suppress "No tab with id" if already closed
        finish(t?.url || applyUrl);
      });
    }, 2500);
  });

  return true; // Keep the message channel open for the async sendResponse
});
