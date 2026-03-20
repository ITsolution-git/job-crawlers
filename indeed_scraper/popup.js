/**
 * Indeed External Jobs Exporter — Popup Script v2
 *
 * Displays captured jobs and exports the 8 fields:
 *   title | job url | company | country | experience level |
 *   job type | salary range | work arrangement
 */
(function () {
  'use strict';

  const STORAGE_KEY   = 'indeed_external_jobs';
  const API_BASE      = 'http://18.191.195.218';
  const PLATFORM_SLUG = 'indeed';

  // ── DOM refs ─────────────────────────────────────────────────────────────────
  const jobList        = document.getElementById('job-list');
  const emptyState     = document.getElementById('empty-state');
  const bannerHint     = document.getElementById('banner-hint');
  const searchInput    = document.getElementById('search');
  const btnExportCsv   = document.getElementById('btn-export-csv');
  const btnSaveDb      = document.getElementById('btn-save-db');
  const btnCopyAll     = document.getElementById('btn-copy-all');
  const btnClear       = document.getElementById('btn-clear');
  const btnCrawl       = document.getElementById('btn-crawl');
  const crawlLabel     = document.getElementById('crawl-label');
  const crawlIconPlay  = document.getElementById('crawl-icon-play');
  const crawlIconStop  = document.getElementById('crawl-icon-stop');
  const crawlBar       = document.getElementById('crawl-bar');
  const crawlBarFill   = document.getElementById('crawl-bar-fill');
  const crawlBarLabel  = document.getElementById('crawl-bar-label');
  const statExternal   = document.getElementById('stat-external');
  const statSalary     = document.getElementById('stat-salary');
  const statRemote     = document.getElementById('stat-remote');
  const statTotal      = document.getElementById('stat-total');
  const headerMeta     = document.getElementById('header-meta');
  const toastEl        = document.getElementById('toast');

  let allJobs     = {};
  let searchQuery = '';
  let toastTimer  = null;
  let crawling    = false;

  // ── Toast ─────────────────────────────────────────────────────────────────────

  function showToast(msg, ms = 2400) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), ms);
  }

  // ── Load & render ─────────────────────────────────────────────────────────────

  function loadJobs() {
    chrome.storage.local.get([STORAGE_KEY], (result) => {
      allJobs = result[STORAGE_KEY] || {};
      renderAll();
    });
  }

  function renderAll() {
    updateStats();
    renderList();
  }

  function updateStats() {
    const jobs     = Object.values(allJobs);
    const external = jobs.filter((j) => !j.isEasyApply);
    const withSal  = external.filter((j) => j.salaryRange);
    const remote   = external.filter((j) =>
      /remote/i.test(j.workArrangement || '') || /remote/i.test(j.country || '')
    );

    statTotal.textContent    = jobs.length;
    statExternal.textContent = external.length;
    statSalary.textContent   = withSal.length;
    statRemote.textContent   = remote.length;

    const noun = external.length === 1 ? 'job' : 'jobs';
    headerMeta.textContent = `${external.length} external ${noun} collected`;
  }

  function filteredJobs() {
    let jobs = Object.values(allJobs).filter((j) => !j.isEasyApply);

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      jobs = jobs.filter(
        (j) =>
          (j.title        || '').toLowerCase().includes(q) ||
          (j.company      || '').toLowerCase().includes(q) ||
          (j.country      || '').toLowerCase().includes(q) ||
          (j.jobType      || '').toLowerCase().includes(q) ||
          (j.workArrangement || '').toLowerCase().includes(q)
      );
    }

    // Sort: salary first, then most recent
    jobs.sort((a, b) => {
      if (a.salaryRange && !b.salaryRange) return -1;
      if (!a.salaryRange && b.salaryRange) return 1;
      return (b.capturedAt || 0) - (a.capturedAt || 0);
    });

    return jobs;
  }

  function renderList() {
    // Clear existing cards
    jobList.querySelectorAll('.job-item').forEach((el) => el.remove());

    const jobs = filteredJobs();

    const hasAny = Object.keys(allJobs).some((k) => !allJobs[k].isEasyApply);
    bannerHint.style.display  = hasAny ? 'none' : '';
    emptyState.style.display  = jobs.length === 0 ? '' : 'none';

    if (jobs.length === 0) return;

    const frag = document.createDocumentFragment();
    jobs.forEach((job) => frag.appendChild(buildCard(job)));
    jobList.appendChild(frag);
  }

  // ── Card builder ──────────────────────────────────────────────────────────────

  function buildCard(job) {
    const card = document.createElement('div');
    card.className = 'job-item';

    // Build meta pills
    const pills = [
      job.country        && pill('globe',    job.country),
      job.jobType        && pill('briefcase', job.jobType),
      job.workArrangement && pill('map-pin',  job.workArrangement),
      job.experienceLevel && pill('user',     job.experienceLevel),
    ].filter(Boolean).join('');

    const salaryHtml = job.salaryRange
      ? `<div class="job-salary">
           <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
             <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
           </svg>
           ${esc(job.salaryRange)}
         </div>`
      : '';

    const urlDisplay  = job.jobUrl ? truncateUrl(job.jobUrl) : '—';
    const urlHref     = job.jobUrl ? esc(job.jobUrl) : '#';
    const urlDisabled = job.jobUrl ? '' : ' disabled';

    card.innerHTML = `
      <div class="job-header">
        <div class="job-title" title="${esc(job.title)}">${esc(job.title)}</div>
        <div class="job-company">${esc(job.company || '—')}</div>
      </div>

      ${pills ? `<div class="job-pills">${pills}</div>` : ''}
      ${salaryHtml}

      <div class="job-url-row">
        <a class="job-url-link"
           href="${urlHref}"
           target="_blank"
           rel="noopener noreferrer"
           title="${esc(job.jobUrl || '')}"
           ${job.jobUrl ? '' : 'style="pointer-events:none;color:#9ca3af"'}>
          ${urlDisplay}
        </a>
        <div class="url-actions">
          ${job.jobUrl ? `
          <button class="btn-icon copy-url-btn" data-url="${esc(job.jobUrl)}" title="Copy URL">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
              <rect x="9" y="9" width="13" height="13" rx="2"/>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
            </svg>
          </button>
          <a class="btn-icon" href="${esc(job.jobUrl)}" target="_blank" rel="noopener noreferrer" title="Open in new tab">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
              <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
            </svg>
          </a>` : '<span class="no-url-note">No external URL yet</span>'}
        </div>
      </div>
    `;

    return card;
  }

  /** Render a small labelled pill. iconName is unused in SVG here; we use simple text. */
  function pill(_icon, text) {
    return `<span class="pill">${esc(text)}</span>`;
  }

  function truncateUrl(url) {
    try {
      const u = new URL(url);
      const path = u.pathname.length > 30
        ? u.pathname.slice(0, 28) + '…'
        : u.pathname;
      return esc(u.hostname + path);
    } catch {
      return esc(url.length > 55 ? url.slice(0, 53) + '…' : url);
    }
  }

  function esc(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ── Database save ─────────────────────────────────────────────────────────────

  function parseSalary(raw) {
    if (!raw) return { min: '', max: '', period: '', currency: '' };
    const currency = raw.includes('$') ? 'USD' : '';
    let period = '';
    if (/year|yr|annual/i.test(raw))  period = 'year';
    else if (/hour|hr/i.test(raw))    period = 'hour';
    else if (/month/i.test(raw))      period = 'month';
    else if (/week/i.test(raw))       period = 'week';
    const nums   = raw.match(/[\d,]+(?:\.\d+)?/g) || [];
    const values = nums.map((n) => parseFloat(n.replace(/,/g, '')));
    return { min: values[0] ?? '', max: values[1] ?? '', period, currency };
  }

  async function getOrCreatePlatform() {
    const res  = await fetch(`${API_BASE}/api/v1/platforms/?slug=${PLATFORM_SLUG}`);
    const data = await res.json();
    if (data.results && data.results.length > 0) return data.results[0];
    const createRes = await fetch(`${API_BASE}/api/v1/platforms/`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ name: 'Indeed', slug: PLATFORM_SLUG, website: 'https://www.indeed.com' }),
    });
    return createRes.json();
  }

  async function saveToDatabase() {
    const jobs = filteredJobs();
    if (jobs.length === 0) { showToast('No external jobs to save'); return; }

    btnSaveDb.disabled = true;
    showToast('Connecting to database…', 60000);

    let platform;
    try {
      platform = await getOrCreatePlatform();
    } catch (err) {
      showToast('Failed to reach database');
      btnSaveDb.disabled = false;
      return;
    }

    let saved = 0, failed = 0;
    const version = (platform.version || 0) + 1;

    for (const job of jobs) {
      const salary = parseSalary(job.salaryRange || '');
      const postedAt = job.capturedAt
        ? new Date(job.capturedAt).toISOString().replace('T', ' ').slice(0, 19)
        : '';
      const payload = {
        unique_id:        job.jk           || '',
        title:            job.title        || '',
        company:          job.company      || '',
        country:          job.country      || '',
        salary_min:       salary.min,
        salary_max:       salary.max,
        salary_period:    salary.period,
        salary_currency:  salary.currency,
        work_arrangement: job.workArrangement  || '',
        posted_at:        postedAt,
        experience_level: job.experienceLevel  || '',
        job_type:         job.jobType          || '',
        skills:           '',
        url:              job.jk ? `https://www.indeed.com/viewjob?jk=${job.jk}` : '',
        job_url:          job.jobUrl           || '',
        platform:         platform.id,
        version,
      };
      try {
        const res = await fetch(`${API_BASE}/api/v1/listings/`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(payload),
        });
        (res.status === 200 || res.status === 201) ? saved++ : failed++;
      } catch {
        failed++;
      }
      showToast(`Saving… ${saved + failed} / ${jobs.length}`, 60000);
    }

    btnSaveDb.disabled = false;
    const failNote = failed > 0 ? `, ${failed} failed` : '';
    showToast(`Done: ${saved} saved${failNote}`, 4000);
  }

  // ── CSV export ────────────────────────────────────────────────────────────────

  /**
   * Exports the 8 required fields:
   *   Title | Job URL | Company | Country | Experience Level |
   *   Job Type | Salary Range | Work Arrangement
   */
  function exportCsv() {
    const jobs = filteredJobs();
    if (jobs.length === 0) { showToast('No external jobs to export'); return; }

    const HEADERS = [
      'Title',
      'Job URL',
      'Company',
      'Country',
      'Experience Level',
      'Job Type',
      'Salary Range',
      'Work Arrangement',
    ];

    const rows = jobs.map((j) => [
      csvCell(j.title           || ''),
      csvCell(j.jobUrl          || ''),
      csvCell(j.company         || ''),
      csvCell(j.country         || ''),
      csvCell(j.experienceLevel || ''),
      csvCell(j.jobType         || ''),
      csvCell(j.salaryRange     || ''),
      csvCell(j.workArrangement || ''),
    ]);

    const csv = [HEADERS.map(csvCell), ...rows]
      .map((r) => r.join(','))
      .join('\r\n');

    const ts   = new Date().toISOString().slice(0, 10);
    downloadFile(`indeed_external_jobs_${ts}.csv`, csv, 'text/csv;charset=utf-8;');
    showToast(`Exported ${jobs.length} job${jobs.length === 1 ? '' : 's'} to CSV`);
  }

  function csvCell(val) {
    const s = String(val).replace(/"/g, '""');
    return /[",\n\r]/.test(s) ? `"${s}"` : s;
  }

  function downloadFile(filename, content, mimeType) {
    const BOM  = '\uFEFF'; // UTF-8 BOM so Excel opens accented chars correctly
    const blob = new Blob([BOM + content], { type: mimeType });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), {
      href: url, download: filename,
    });
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Copy URLs ─────────────────────────────────────────────────────────────────

  function copyAllUrls() {
    const jobs = filteredJobs().filter((j) => j.jobUrl);
    if (jobs.length === 0) { showToast('No URLs to copy'); return; }
    const text = jobs.map((j) => j.jobUrl).join('\n');
    navigator.clipboard.writeText(text).then(() =>
      showToast(`Copied ${jobs.length} URL${jobs.length === 1 ? '' : 's'}`)
    );
  }

  function copyText(text) {
    navigator.clipboard.writeText(text).then(() => showToast('URL copied'));
  }

  // ── Crawl UI helpers ──────────────────────────────────────────────────────────

  function setCrawlState(active) {
    crawling = active;
    crawlLabel.textContent      = active ? 'Stop Crawling' : 'Start Crawling';
    crawlIconPlay.style.display = active ? 'none' : '';
    crawlIconStop.style.display = active ? ''     : 'none';
    btnCrawl.classList.toggle('btn-crawl-active', active);
    if (!active) {
      // Hide bar after a short delay so user can see the final state
      setTimeout(() => { crawlBar.style.display = 'none'; }, 1800);
    }
  }

  function updateCrawlProgress(processed, total, captured, page) {
    crawlBar.style.display = '';
    const pct    = total > 0 ? Math.round((processed / total) * 100) : 0;
    const pageTag = page > 1 ? `Page ${page} — ` : '';
    crawlBarFill.style.width  = pct + '%';
    crawlBarLabel.textContent = `${pageTag}${processed} / ${total}  (${captured} captured)`;
  }

  // ── Event wiring ──────────────────────────────────────────────────────────────

  btnCrawl.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url?.includes('indeed.com')) {
      showToast('Not on an Indeed.com page');
      return;
    }

    if (crawling) {
      // Stop
      chrome.tabs.sendMessage(tab.id, { type: 'STOP_CRAWL' }).catch(() => {});
      setCrawlState(false);
      showToast('Crawling stopped');
    } else {
      // Start
      setCrawlState(true);
      updateCrawlProgress(0, 0, 0, 1);

      // If the active tab is on a viewjob page, navigate back to the search
      // results page and let the content script auto-resume via stored crawl state.
      if ((tab.url.includes('/viewjob') && tab.url.includes('jk=')) || tab.url.includes('?from=jobsearch-empty-whatwhere')) {
        await new Promise((r) => setTimeout(r, 10000));
        chrome.storage.local.get(['indeed_crawl_state'], (result) => {
          const state = result['indeed_crawl_state'] || {};
          const targetUrl = state.searchUrl || 'https://www.indeed.com/jobs';
          chrome.storage.local.set(
            { 'indeed_crawl_state': { ...state, isCrawling: true } },
            () => chrome.tabs.update(tab.id, { url: targetUrl })
          );
        });

        return;
      } else if (tab.url.includes('/jobs?') && !tab.url.includes('q=') && !tab.url.includes(`from=`)) {
        // wait 15 seconds
        await new Promise((r) => setTimeout(r, 15000)); // wait for captcha bypass

        chrome.storage.local.get(['indeed_crawl_state'], (result) => {
          const state = result['indeed_crawl_state'] || {};
          const targetUrl = state.searchUrl || 'https://www.indeed.com/jobs';
          chrome.storage.local.set(
            { 'indeed_crawl_state': { ...state, isCrawling: true } },
            () => chrome.tabs.update(tab.id, { url: targetUrl })
          );
        });

        return;
      }

      chrome.tabs.sendMessage(tab.id, { type: 'START_CRAWL' }).catch((err) => {
        setCrawlState(false);
        showToast('Could not reach the page. Try refreshing Indeed.');
      });
    }
  });

  btnExportCsv.addEventListener('click', exportCsv);
  btnSaveDb.addEventListener('click', saveToDatabase);
  btnCopyAll.addEventListener('click', copyAllUrls);

  btnClear.addEventListener('click', () => {
    if (!confirm('Clear all stored jobs?')) return;
    chrome.storage.local.remove([STORAGE_KEY], () => {
      allJobs = {};
      renderAll();
      showToast('All jobs cleared');
    });
  });

  searchInput.addEventListener('input', (e) => {
    searchQuery = e.target.value.trim();
    renderList();
  });

  // Delegated click for copy buttons
  jobList.addEventListener('click', (e) => {
    const btn = e.target.closest('.copy-url-btn');
    if (btn) copyText(btn.getAttribute('data-url'));
  });

  // Live updates and crawl progress from content script
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'JOBS_UPDATED') {
      loadJobs();
    } else if (msg.type === 'CRAWL_PROGRESS') {
      updateCrawlProgress(msg.processed, msg.total, msg.captured, msg.page);
      if (msg.status === 'done') {
        setCrawlState(false);
        showToast(`Done — ${msg.captured} external job${msg.captured === 1 ? '' : 's'} captured`);
      }
    }
  });

  // ── Init ──────────────────────────────────────────────────────────────────────
  loadJobs();
})();
