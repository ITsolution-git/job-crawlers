/**
 * Indeed External Jobs Exporter — Content Script v2
 *
 * Monitors the job-detail panel on Indeed.com.
 * Skips "Easily apply" jobs; captures all 8 export fields for external jobs:
 *   title | job url | company | country | experience level |
 *   job type | salary range | work arrangement
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'indeed_external_jobs';

  // ─── US states / Canadian provinces for country inference ────────────────────
  const US_STATES = new Set([
    'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN',
    'IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV',
    'NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN',
    'TX','UT','VT','VA','WA','WV','WI','WY','DC',
  ]);
  const CA_PROVINCES = new Set([
    'AB','BC','MB','NB','NL','NS','NT','NU','ON','PE','QC','SK','YT',
  ]);

  // ─── Storage helpers ─────────────────────────────────────────────────────────

  function getStoredJobs() {
    return new Promise((resolve) =>
      chrome.storage.local.get([STORAGE_KEY], (r) => resolve(r[STORAGE_KEY] || {}))
    );
  }

  function saveJobs(jobs) {
    return new Promise((resolve) =>
      chrome.storage.local.set({ [STORAGE_KEY]: jobs }, resolve)
    );
  }

  // ─── Crawl-state persistence (survives full page navigations) ──────────────

  const CRAWL_STATE_KEY = 'indeed_crawl_state';

  function getCrawlState() {
    return new Promise((resolve) =>
      chrome.storage.local.get([CRAWL_STATE_KEY], (r) => resolve(r[CRAWL_STATE_KEY] || null))
    );
  }

  function saveCrawlState(state) {
    return new Promise((resolve) =>
      chrome.storage.local.set({ [CRAWL_STATE_KEY]: state }, resolve)
    );
  }

  function clearCrawlState() {
    return new Promise((resolve) =>
      chrome.storage.local.remove([CRAWL_STATE_KEY], resolve)
    );
  }

  // ─── Field parsers ───────────────────────────────────────────────────────────

  /**
   * Infer the country from an Indeed location string.
   * Examples: "Culver City, CA" → "United States"
   *           "London, United Kingdom" → "United Kingdom"
   *           "Toronto, ON" → "Canada"
   *           "Remote" → "Remote"
   */
  function parseCountry(location) {
    if (!location) return '';
    const loc = location.trim();

    if (/^remote$/i.test(loc)) return 'Remote';
    if (/united\s+states|U\.S\.A?\.?/i.test(loc)) return 'United States';
    if (/united\s+kingdom|\bU\.?K\.?\b/i.test(loc)) return 'United Kingdom';
    if (/\bcanada\b/i.test(loc)) return 'Canada';
    if (/\baustralia\b/i.test(loc)) return 'Australia';
    if (/\bindian?\b/i.test(loc)) return 'India';
    if (/\bgermany\b/i.test(loc)) return 'Germany';
    if (/\bfrance\b/i.test(loc)) return 'France';

    // Split by comma — last segment is often a state/province/country
    const parts = loc.split(',').map((p) => p.trim());
    if (parts.length >= 2) {
      // Strip ZIP code from last part: "CA 90210" → "CA"
      const last = parts[parts.length - 1].replace(/\s*\d{5}(-\d{4})?$/, '').trim();
      const code = last.toUpperCase();
      if (US_STATES.has(code)) return 'United States';
      if (CA_PROVINCES.has(code)) return 'Canada';
      // More than 2 chars → treat as country name
      if (last.length > 2) return last;
    }

    return '';
  }

  /**
   * Derive an experience level from the job title then description text.
   * Checks the title first (more reliable) then falls back to description keywords.
   */
  function parseExperienceLevel(title, description) {
    const t = (title || '').toLowerCase();

    if (/\bvp\b|vice\s+president/i.test(t)) return 'VP';
    if (/\bdirector\b/i.test(t)) return 'Director';
    if (/\bprincipal\b/i.test(t)) return 'Principal';
    if (/\bstaff\b/i.test(t)) return 'Staff';
    if (/\blead\b/i.test(t)) return 'Lead';
    if (/\bsenior\b|\bsr\.?\b/i.test(t)) return 'Senior';
    if (/\bmid[- ]?level\b/i.test(t)) return 'Mid Level';
    if (/\bentry[- ]?level\b/i.test(t)) return 'Entry Level';
    if (/\bjunior\b|\bjr\.?\b/i.test(t)) return 'Junior';
    if (/\bmanager\b|\bmgr\.?\b/i.test(t)) return 'Manager';
    if (/\bintern(ship)?\b/i.test(t)) return 'Intern';
    if (/\bassociate\b/i.test(t)) return 'Associate';

    // Fallback: scan description for "Experience level: X" label
    if (description) {
      const match = description.match(/experience\s+level\s*[:\-]\s*([^\n,.]+)/i);
      if (match) return match[1].trim();

      // Keyword scan in description
      if (/\bsenior\b/i.test(description)) return 'Senior';
      if (/\bjunior\b/i.test(description)) return 'Junior';
      if (/\bentry[- ]?level\b/i.test(description)) return 'Entry Level';
      if (/\bmid[- ]?level\b/i.test(description)) return 'Mid Level';
    }

    return '';
  }

  /**
   * Extract work arrangement from the job description text.
   * Indeed appends "Work Location: In Person" (or Remote / Hybrid) to job descriptions.
   *   DOM: <div id="jobDescriptionText">…Work Location: In Person</div>
   */
  function parseWorkArrangement(descText) {
    if (!descText) return '';

    // "Work Location: In Person" — the primary signal from the provided DOM
    const locMatch = descText.match(/work\s+location\s*[:\-]\s*([^\n\r.]+)/i);
    if (locMatch) return locMatch[1].trim();

    // "Work setting:" / "Work environment:"
    const settingMatch = descText.match(/work\s+(?:setting|environment)\s*[:\-]\s*([^\n\r.]+)/i);
    if (settingMatch) return settingMatch[1].trim();

    // Keyword inference
    const text = descText.toLowerCase();
    if (/\bfully\s+remote\b|\b100\s*%\s+remote\b/.test(text)) return 'Remote';
    if (/\bhybrid\b/.test(text)) return 'Hybrid';
    if (/\bin[- ]person\b|\bon[- ]?site\b|\bonsite\b/.test(text)) return 'In Person';
    if (/\bremote\b/.test(text)) return 'Remote';

    return '';
  }

  // ─── Resolve the active job key ──────────────────────────────────────────────

  function resolveCurrentJk() {
    // 1. URL param — /viewjob?jk=... pages
    const urlParams = new URLSearchParams(window.location.search);
    const jkFromUrl = urlParams.get('jk') || urlParams.get('vjk');
    if (jkFromUrl) return jkFromUrl;

    // 2. Active / selected job card
    const activeCard =
      document.querySelector('[data-jk][class*="selected"]') ||
      document.querySelector('[data-jk][class*="active"]') ||
      document.querySelector('[data-jk][aria-selected="true"]') ||
      document.querySelector('[data-jk][tabindex="0"]');
    if (activeCard) return activeCard.getAttribute('data-jk');

    // 3. Embedded JSON in detail panel
    const detailPanel =
      document.querySelector('#mosaic-jobDetails') ||
      document.querySelector('.jobsearch-ViewJobLayout');
    if (detailPanel) {
      const jkMatch = detailPanel.innerHTML.match(/"jk"\s*:\s*"([a-f0-9]+)"/);
      if (jkMatch) return jkMatch[1];
    }

    return null;
  }

  // ─── Core extraction ─────────────────────────────────────────────────────────

  /**
   * Extract all 8 export fields from the currently visible job-detail panel.
   * Returns null if no panel is found or if the job is Easy Apply.
   */
  function extractJobData() {
    const panel =
      document.querySelector('#jobsearch-ViewjobPaneWrapper') ||
      document.querySelector('#mosaic-jobDetails') ||
      document.querySelector('[data-testid="jobdetails-container"]') ||
      document.querySelector('.jobsearch-ViewJobLayout');

    if (!panel) return null;

    // ── 1. Title ──────────────────────────────────────────────────────────────
    const titleEl =
      panel.querySelector('h1[data-testid="jobsearch-JobInfoHeader-title"]') ||
      panel.querySelector('h1.jobsearch-JobInfoHeader-title') ||
      panel.querySelector('.jobsearch-JobInfoHeader-title');
    const title = titleEl?.textContent?.trim() || '';

    // ── 2. Company ────────────────────────────────────────────────────────────
    // DOM: <div data-testid="inlineHeader-companyName">
    //        <span><a href="…">Property Matrix<svg…/></a></span>
    //      </div>
    // We want the text content of the <a> WITHOUT the SVG aria-label text.
    const companyContainer =
      panel.querySelector('[data-testid="inlineHeader-companyName"]') ||
      panel.querySelector('[data-company-name="true"]');

    let company = '';
    if (companyContainer) {
      const anchor = companyContainer.querySelector('a');
      if (anchor) {
        company = Array.from(anchor.childNodes)
          .filter((n) => n.nodeType === Node.TEXT_NODE)
          .map((n) => n.textContent.trim())
          .join('')
          .trim();
      }
      if (!company) company = companyContainer.textContent.trim();
    }

    // ── 3. Country ────────────────────────────────────────────────────────────
    // DOM: <div data-testid="inlineHeader-companyLocation"><div>Culver City, CA</div></div>
    const locationEl = panel.querySelector('[data-testid="inlineHeader-companyLocation"]');
    const location = locationEl?.textContent?.trim() || '';
    const country = parseCountry(location);

    // ── 4. Salary Range & Job Type ────────────────────────────────────────────
    // DOM: <div id="salaryInfoAndJobType">
    //        <span class="css-1oc7tea …">$65,000 - $80,000 a year</span>
    //        <span class="css-1u1g3ig …"> -  Full-time</span>
    //      </div>
    const salaryContainer = panel.querySelector('#salaryInfoAndJobType');
    let salaryRange = '';
    let jobType = '';

    if (salaryContainer) {
      const spans = salaryContainer.querySelectorAll('span');
      if (spans[0]) salaryRange = spans[0].textContent.trim();
      if (spans[1]) {
        // " -  Full-time" → "Full-time"
        jobType = spans[1].textContent.replace(/^\s*[-–]\s*/, '').trim();
      }
    }

    // Fallback: Indeed attribute snippet chips (e.g. "Full-time", "Part-time")
    if (!jobType) {
      panel.querySelectorAll('[data-testid="attribute_snippet_testid"]').forEach((el) => {
        const text = el.textContent.trim();
        if (/full[- ]?time|part[- ]?time|contract|temporary|internship/i.test(text)) {
          jobType = text;
        }
      });
    }

    // ── 5. Work Arrangement ───────────────────────────────────────────────────
    // DOM: <div id="jobDescriptionText"> … Work Location: In Person … </div>
    const descEl = panel.querySelector('#jobDescriptionText');
    const descText = descEl?.innerText || descEl?.textContent || '';
    let workArrangement = '';

    // Structured chips take priority
    panel.querySelectorAll('[data-testid="attribute_snippet_testid"]').forEach((el) => {
      const text = el.textContent.trim();
      if (/remote|hybrid|in[- ]person|on[- ]?site/i.test(text)) {
        workArrangement = text;
      }
    });

    if (!workArrangement) {
      workArrangement = parseWorkArrangement(descText);
    }

    // ── 6. Experience Level ───────────────────────────────────────────────────
    const experienceLevel = parseExperienceLevel(title, descText);

    // ── 7. Job URL & Easy-Apply detection ────────────────────────────────────
    let jobUrl = '';
    let isEasyApply = false;

    const applyContainer =
      panel.querySelector('#applyButtonLinkContainer');

    if (applyContainer) {
      // Presence of a button / element with IndeedApply class → Easy Apply
      if (applyContainer.querySelector('[class*="IndeedApply"], [class*="indeedApply"]')) {
        isEasyApply = true;
      }

      const applyLink = applyContainer.querySelector('button[href]');
      const rawHref = applyLink?.getAttribute('href') || '';
      if (rawHref) {
        // Resolve relative paths (e.g. "/applystart?jk=...") to absolute URLs
        jobUrl = rawHref.startsWith('http') ? rawHref : location.origin + rawHref;
      }
    }

    // NOTE: Do NOT check panel.textContent for "Easily apply" text — the panel
    // container (#jobsearch-ViewjobPaneWrapper) includes left-column job cards
    // which carry "Easily apply" labels for other jobs, causing false positives.

    // Fallback URL: indeed viewjob link (still navigates to external site)
    if (!jobUrl && !isEasyApply) {
      const urlParams = new URLSearchParams(window.location.search);
      const jk =
        urlParams.get('jk') ||
        urlParams.get('vjk') ||
        resolveCurrentJk();
      if (jk) jobUrl = `https://www.indeed.com/viewjob?jk=${jk}`;
    }

    if (!title) return null;

    return {
      title,
      jobUrl,
      company,
      location,
      country,
      experienceLevel,
      jobType,
      salaryRange,
      workArrangement,
      isEasyApply,
    };
  }

  // ─── Detail panel observer ───────────────────────────────────────────────────

  function startDetailObserver() {
    let lastJk = null;
    let debounceTimer = null;

    async function tryCapture() {
      const jk = resolveCurrentJk();
      if (!jk || jk === lastJk) return;

      const data = extractJobData();
      if (!data) return;
      if (data.isEasyApply) {
        lastJk = jk; // mark as visited so we don't re-check
        return;
      }

      lastJk = jk; // Set before any await so rapid re-clicks don't re-enter

      const storedJobs = await getStoredJobs();
      const existing   = storedJobs[jk] || {};

      // Click #applyButtonLinkContainer, follow the redirect in a hidden tab,
      // capture the real external company URL
      const externalUrl = await captureExternalUrl();

      storedJobs[jk] = {
        ...existing,
        ...data,
        jk,
        jobUrl: externalUrl || data.jobUrl || existing.jobUrl || '',
        capturedAt: Date.now(),
      };

      await saveJobs(storedJobs);
      notifyPopup();
    }

    const observer = new MutationObserver(() => {
      clearTimeout(debounceTimer);
      // Wait 700 ms after the last DOM mutation so salary/description renders
      debounceTimer = setTimeout(tryCapture, 700);
    });

    observer.observe(document.body, { childList: true, subtree: true });
    return observer;
  }

  // ─── External URL resolver ───────────────────────────────────────────────────

  /**
   * Sends the href from #applyButtonLinkContainer to the background worker,
   * which opens it in a hidden tab, waits for the redirect away from indeed.com,
   * and returns the final external company URL.
   *
   * Falls back to the original URL if no redirect is detected within the timeout.
   */
  function resolveExternalUrl(applyUrl) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { type: 'RESOLVE_EXTERNAL_URL', applyUrl },
        (response) => resolve(response?.externalUrl || applyUrl)
      );
    });
  }

  /**
   * Finds the href inside #applyButtonLinkContainer on the currently visible
   * detail panel, then resolves it to the real external URL via a background tab.
   * Returns null if no eligible link is found (e.g. Easy Apply modal button).
   */
  async function captureExternalUrl() {
    const applyContainer = document.querySelector('#applyButtonLinkContainer');
    if (!applyContainer) return null;

    const applyLink = applyContainer.querySelector('button[href]');
    if (!applyLink) return null;

    const rawHref = applyLink.getAttribute('href') || '';
    const href = rawHref.startsWith('http') ? rawHref : location.origin + rawHref;
    // Skip javascript: hrefs and IndeedApply modal triggers
    if (!href.startsWith('http')) return null;
    if (applyLink.hasAttribute('data-indeed-apply-joburl')) return null;
    if (applyLink.className.toLowerCase().includes('indeedapply')) return null;

    return resolveExternalUrl(href);
  }

  // ─── Pagination helpers ───────────────────────────────────────────────────────

  /**
   * Clicks the "Next Page" pagination link and waits for the page to change.
   *
   * Detection strategy: snapshot the text of [data-testid="pagination-page-current"]
   * before clicking, then poll until it shows a different number — this is reliable
   * regardless of how many cards each page contains.
   *
   * Returns false when there is no next-page link (last page reached) or the
   * navigation times out.
   */
  async function navigateToNextPage(pageNum, totalCards, processed, captured) {
    const nextLink = document.querySelector('a[data-testid="pagination-page-next"]');
    if (!nextLink) return false;

    // Persist crawl state BEFORE clicking — Indeed does a full page navigation,
    // which destroys this script's context. The new page's bootstrap will read
    // this state and resume crawlJobs automatically.
    await saveCrawlState({
      isCrawling: true,
      pageNum: pageNum + 1,
      totalCards,
      processed,
      captured,
    });

    nextLink.click();
    // Full page navigation will destroy this script — the new page resumes via bootstrap.
    // Return true so the caller knows navigation was initiated (though it won't matter
    // since the script context will be gone).
    return true;
  }

  // ─── Popup messaging ─────────────────────────────────────────────────────────

  function notifyPopup() {
    chrome.runtime.sendMessage({ type: 'JOBS_UPDATED' }).catch(() => {
      // Popup not open — safe to ignore
    });
  }

  // ─── Crawling ─────────────────────────────────────────────────────────────────

  let isCrawling = false;

  /**
   * Finds every div whose class contains "resultContent" inside
   * #mosaic-provider-jobcards, clicks them one by one, waits 500 ms for the
   * #jobsearch-ViewjobPaneWrapper to update, then extracts and saves the job.
   */
  async function crawlJobs(resumeState = null) {
    isCrawling = true;

    let pageNum    = resumeState?.pageNum    || 1;
    let totalCards = resumeState?.totalCards  || 0;
    let processed  = resumeState?.processed  || 0;
    let captured   = resumeState?.captured   || 0;

    chrome.runtime.sendMessage({
      type: 'CRAWL_PROGRESS', status: 'started', page: pageNum,
      total: totalCards, processed, captured,
    }).catch(() => {});

    while (isCrawling && pageNum <= 50) {
      const cards = Array.from(
        document.querySelectorAll(
          '#mosaic-provider-jobcards div.cardOutline'
        )
      );

      // Accumulate total across pages so the progress bar fills cumulatively
      totalCards += cards.length;

      chrome.runtime.sendMessage({
        type: 'CRAWL_PROGRESS', status: 'running', page: pageNum,
        total: totalCards, processed, captured,
      }).catch(() => {});

      for (const card of cards) {
        if (!isCrawling) break;

        // Skip "Easily Apply" jobs early — no need to click or wait for the panel
        if (/easily\s+apply/i.test(card.textContent)) {
          processed++;
          chrome.runtime.sendMessage({
            type: 'CRAWL_PROGRESS', status: 'running', page: pageNum,
            total: totalCards, processed, captured,
          }).catch(() => {});
          continue;
        }

        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await new Promise((r) => setTimeout(r, 300)); // let scroll settle
        card.querySelector("a").click();

        // Poll until the detail pane fully renders (title + apply button visible),
        // up to 5 s. This replaces the fixed 500 ms wait so we never extract stale
        // or partially-loaded data.
        const panelReady = await (async () => {
          const deadline = Date.now() + 5000;
          while (Date.now() < deadline) {
            const panel =
              document.querySelector('#jobsearch-ViewjobPaneWrapper') ||
              document.querySelector('#mosaic-jobDetails');
            if (panel) {
              const hasTitle = !!panel.querySelector(
                'h1[data-testid="jobsearch-JobInfoHeader-title"], h1.jobsearch-JobInfoHeader-title'
              );
              const hasApply = !!panel.querySelector('#applyButtonLinkContainer');
              if (hasTitle && hasApply) return true;
            }
            await new Promise((r) => setTimeout(r, 200));
          }
          return false; // timed out
        })();

        if (!panelReady) {
          console.warn('Detail panel did not fully render in time — skipping card');
          processed++;
          chrome.runtime.sendMessage({
            type: 'CRAWL_PROGRESS', status: 'running', page: pageNum,
            total: totalCards, processed, captured,
          }).catch(() => {});
          continue;
        }

        const jk = resolveCurrentJk();
        if (jk) {
          const data = extractJobData();
          if (data && !data.isEasyApply) {
            // Open #applyButtonLinkContainer in a hidden tab, follow redirect,
            // capture the real external company URL
            const externalUrl = await captureExternalUrl();

            const storedJobs = await getStoredJobs();
            const existing   = storedJobs[jk] || {};
            storedJobs[jk]   = {
              ...existing,
              ...data,
              jk,
              jobUrl: externalUrl || data.jobUrl || existing.jobUrl || '',
              capturedAt: Date.now(),
            };
            await saveJobs(storedJobs);
            captured++;
            notifyPopup();
          } else {
            continue;
          }
        } else {
          continue;
        }

        processed++;
        chrome.runtime.sendMessage({
          type: 'CRAWL_PROGRESS', status: 'running', page: pageNum,
          total: totalCards, processed, captured,
        }).catch(() => {});
      }

      if (!isCrawling) break;

      // Try to advance to the next page; stop if none exists
      const hasNextPage = await navigateToNextPage(pageNum, totalCards, processed, captured);
      if (!hasNextPage) break;
      // // If navigateToNextPage returned true, a full page navigation was triggered.
      // // This script will be destroyed — the new page's bootstrap resumes crawlJobs.
      // return;

      pageNum++;
    }

    isCrawling = false;
    await clearCrawlState();
    chrome.runtime.sendMessage({
      type: 'CRAWL_PROGRESS', status: 'done', page: pageNum,
      total: totalCards, processed, captured,
    }).catch(() => {});
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    switch (message.type) {
      case 'GET_JOBS':
        getStoredJobs().then((jobs) => sendResponse({ jobs }));
        return true;

      case 'CLEAR_JOBS':
        chrome.storage.local.remove([STORAGE_KEY], () =>
          sendResponse({ success: true })
        );
        return true;

      case 'START_CRAWL':
        if (!isCrawling) crawlJobs();
        sendResponse({ success: true, alreadyRunning: isCrawling });
        return true;

      case 'STOP_CRAWL':
        isCrawling = false;
        clearCrawlState();
        sendResponse({ success: true });
        return true;

      default:
        break;
    }
  });

  // ─── SPA navigation re-trigger ───────────────────────────────────────────────

  let lastUrl = location.href;
  new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
    }
  }).observe(document, { subtree: true, childList: true });

  // ─── Bootstrap ───────────────────────────────────────────────────────────────
  startDetailObserver();

  // Auto-resume crawling if we arrived here via a full page navigation mid-crawl
  getCrawlState().then((state) => {
    if (state?.isCrawling) {
      crawlJobs(state);
    }
  });
})();
