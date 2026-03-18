# Indeed External Jobs Scraper

A Chrome Extension (Manifest V3) that scans Indeed.com job listings and collects **external job application URLs**, automatically skipping "Easily apply" (on-site) jobs.

---

## Features

| Feature | Description |
|---|---|
| Auto-scan | Detects job cards on any Indeed search results page |
| Easy Apply filter | Skips jobs tagged "Easily apply" |
| Direct URL capture | Captures the real external apply URL when you view a job detail |
| Live badge | Extension icon shows count of external jobs found |
| Search / filter | Filter the list by title or company name |
| Export CSV | Download all results as a spreadsheet |
| Export TXT | Download just the URLs as plain text |
| Copy All | Copy all external URLs to clipboard in one click |

---

## Installation

### 1. Generate icons (one-time setup)

1. Open `generate_icons.html` in Chrome
2. Click **Download All Icons**
3. Create an `icons/` folder inside this project directory
4. Move the three downloaded PNGs (`icon16.png`, `icon48.png`, `icon128.png`) into `icons/`

### 2. Load the extension

1. Open Chrome and go to `chrome://extensions/`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select this project folder (`Indeed_scraper/`)

---

## Usage

1. Go to `https://www.indeed.com/jobs?q=...` and run a job search
2. Click the extension icon in the Chrome toolbar
3. Click **Scan Page** — the extension reads all visible job cards
4. Scroll through the results and click individual jobs on Indeed to capture their external apply URLs (they appear automatically in the popup as you browse)
5. Use **CSV**, **TXT**, or **Copy All** to export the collected URLs

### Tips

- Scroll down on the Indeed results page to load more jobs before scanning
- The **Direct URLs** stat shows jobs where the actual company URL was captured
- Jobs without a direct URL still show the Indeed URL which redirects to the external site
- Data persists between popup opens — click **Clear** to reset

---

## File structure

```
indeed-external-jobs/
├── manifest.json          # Extension manifest (MV3)
├── content.js             # Runs on Indeed pages, scans cards & monitors detail panel
├── background.js          # Service worker, manages badge counter
├── popup.html             # Extension popup UI
├── popup.js               # Popup logic (render, filter, export)
├── popup.css              # Popup styles
├── generate_icons.html    # Helper to generate icon PNGs
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

---

## How it works

### Easy Apply detection

The content script checks each job card for:
- `aria-label` containing "Easily apply"
- CSS classes referencing `IndeedApply`
- Plain text matching `/easily\s+apply/i`

### External URL capture

When you click a job on Indeed, the detail panel loads. The content script watches for changes to the apply button and captures its `href` — but only if it's **not** an IndeedApply button (which would indicate on-site application).

### Storage

Jobs are stored in `chrome.storage.local` keyed by Indeed's job key (`jk`). Data persists until you click **Clear** in the popup.
