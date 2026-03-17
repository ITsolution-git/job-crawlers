# Job Crawlers

Small Python crawlers that fetch job listings and write them to CSV under `data/<crawler>/`.

## Prerequisites

- Python 3.10+ (3.11/3.12 should work too)
- Google Chrome installed (needed for Selenium-based crawlers)

## Setup (Windows / PowerShell)

Create and activate a virtual environment:

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
```

Install dependencies:

```powershell
pip install -r .\requirements.txt
```

## Setup (Ubuntu / Linux)

Install system dependencies (Python venv + build tools for common wheels):

```bash
sudo apt update
sudo apt install -y python3 python3-venv python3-pip build-essential
```

Create and activate a virtual environment:

```bash
python3 -m venv .venv
source .venv/bin/activate
```

Install dependencies:

```bash
pip install -r requirements.txt
```

## Running a crawler

Run a crawler script directly from the repo root:

```powershell
python .\simplify.py
```

Other scripts are present as templates/stubs and may not yet scrape real data:

```powershell
python .\indeed.py
python .\jobright.py
python .\remoterocketship.py
python .\ziprecruiter.py
```

## Saving mode: CSV vs Database

All crawlers accept `is_save_in_database`:

- **`is_save_in_database=False` (default)**: save **only to local CSV**
- **`is_save_in_database=True`**: save to **local CSV** and also **POST to the Job Feeder server**

You can view saved job links in the admin dashboard: [Job Feeder Admin](http://18.191.195.218)


## Output files

Each run creates a folder and writes:

- `data/<crawler>/<crawler>.csv`: scraped listings
- `data/<crawler>/history.log`: run logs

Example for `simplify.py`:

- `data/simplify/simplify.csv`
- `data/simplify/history.log`

## Notes / gotchas

- **Selenium/Chrome**: Crawlers that call `Base.get_driver()` use `webdriver-manager` to download a compatible ChromeDriver automatically, but Chrome must be installed and runnable on the machine.
- **`simplify.py` exits early for older posts**: if it encounters a posting older than “yesterday → now”, it calls `exit(1)`. That means you may see a non-zero exit code even though it successfully wrote some rows.
- **Debug breakpoints**: some scripts include `pdb.set_trace()` (e.g. `ziprecruiter.py`). If you run them, Python will drop into the debugger.

## Troubleshooting

- If `pip install lxml` fails on Windows, upgrade build tooling and try again:

```powershell
python -m pip install --upgrade pip setuptools wheel
pip install -r .\requirements.txt
```

- If Selenium can’t start Chrome, ensure Chrome is installed and up-to-date, then rerun the script so `webdriver-manager` can fetch a matching driver.

