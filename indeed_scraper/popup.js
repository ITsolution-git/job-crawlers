/**
 * Indeed External Jobs Exporter — Popup Script v2
 *
 * Displays captured jobs and exports the 8 fields:
 *   title | job url | company | country | experience level |
 *   job type | salary range | work arrangement
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'indeed_external_jobs';

  // ── DOM refs ─────────────────────────────────────────────────────────────────
  const jobList        = document.getElementById('job-list');
  const emptyState     = document.getElementById('empty-state');
  const bannerHint     = document.getElementById('banner-hint');
  const searchInput    = document.getElementById('search');
  const btnExportCsv   = document.getElementById('btn-export-csv');
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
      updateCrawlProgress(0, 0, 0);
      chrome.tabs.sendMessage(tab.id, { type: 'START_CRAWL' }).catch(() => {
        setCrawlState(false);
        showToast('Could not reach the page. Try refreshing Indeed.');
      });
    }
  });

  btnExportCsv.addEventListener('click', exportCsv);
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
