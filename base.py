import io
import logging
import time
from datetime import datetime, timedelta
import requests
from lxml import etree
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.support.ui import Select
import csv
import os
import pdb
from urllib.parse import urlparse
import re
from webdriver_manager.chrome import ChromeDriverManager


class Base:
    name = "base"
    delay = 5
    max_retry_count = 3
    retry_count = 0
    jobfeeder_api_url = "http://18.191.195.218"
    is_save_in_database = False
    column_headers = [
        "unique_id",
        "title",
        "company",
        "country",
        "salary_min",
        "salary_max",
        "salary_period",
        "salary_currency",
        "work_arrangement",
        "posted_at",
        "experience_level",
        "job_type",
        "skills",
        "url",
        "job_url",
        # "data",
    ]
    unique_index = 0
    history = []

    def __init__(self, name, is_save_in_database=False):
        self.name = name.split(".")[0]
        self.session = requests.Session()
        os.makedirs(os.path.dirname(f"data/{self.name}/"), exist_ok=True)
        self.timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        self.config_log()
        self.writer = self.get_writer()
        self.get_platform()
        self.is_save_in_database = is_save_in_database

    # Override these in a subclass or set them before calling get_driver()
    # to attach to an already-running Chrome instance that has your profile
    # and Cloudflare cookies already solved.
    #
    # How to start Chrome manually (do this once before running the scraper):
    #   Linux/Mac:
    #     google-chrome --remote-debugging-port=9222 --user-data-dir=/tmp/chromeProfile
    #   Windows:
    #     "C:\Program Files\Google\Chrome\Application\chrome.exe" ^
    #       --remote-debugging-port=9222 ^
    #       --user-data-dir="C:\chromeProfile" ^
    #       --profile-directory="Default"
    #
    # Then set use_existing_browser = True below.
    use_existing_browser = False
    remote_debugging_host = "127.0.0.1"
    remote_debugging_port = 9222

    def get_driver(self):
        options = webdriver.ChromeOptions()

        if self.use_existing_browser:
            debugger_url = (
                f"http://{self.remote_debugging_host}:{self.remote_debugging_port}/json/version"
            )

            # Ensure the remote debugging endpoint is reachable and read the
            # *actual* browser major version we are attaching to.
            # This avoids webdriver_manager falling back to an older cached
            # ChromeDriver (e.g. trying to use ChromeDriver 143 against Chrome 145).
            version_json = None
            deadline = time.time() + 20
            last_err = None
            while time.time() < deadline:
                try:
                    resp = self.session.get(debugger_url, timeout=2)
                    if resp.status_code == 200:
                        version_json = resp.json()
                        break
                    last_err = f"status={resp.status_code}"
                except Exception as e:
                    last_err = str(e)
                time.sleep(0.5)

            if not version_json:
                raise RuntimeError(
                    "Could not connect to the existing browser via remote debugging. "
                    f"Expected {debugger_url} to respond. Last error: {last_err}"
                )

            browser_str = version_json.get("Browser") or ""
            # Examples:
            #   "Chrome/145.0.7632.116"
            #   "Chromium/125.0.0.0"
            m = re.search(r"/(\d+)\.", browser_str)
            chrome_major = m.group(1) if m else None

            self.print_out(
                "Attaching to existing browser via remote debugging. "
                f"browser={browser_str!r}, major={chrome_major!r}"
            )

            # Attach to an already-running Chrome that was started with
            # --remote-debugging-port. All cookies / profile / login state
            # from that browser session are reused automatically.
            options.add_experimental_option(
                "debuggerAddress",
                f"{self.remote_debugging_host}:{self.remote_debugging_port}",
            )
            # Selenium's built-in Selenium Manager may look at the "default"
            # installed Chrome (often Google Chrome 143 on this machine),
            # but your attached browser is Chromium 145.
            # Pin Selenium to the Chromium binary so it downloads a matching
            # ChromeDriver.
            # Candidate browser binaries across OSes (used only to pin
            # Selenium to the correct browser so it downloads a matching
            # ChromeDriver).
            for candidate in [
                # Linux (snap/apt)
                "/snap/bin/chromium",
                "/usr/bin/chromium",
                "/usr/bin/chromium-browser",
                "/usr/bin/google-chrome",
                # macOS (default app install locations)
                "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
                "/Applications/Chromium.app/Contents/MacOS/Chromium",
            ]:
                if os.path.exists(candidate):
                    options.binary_location = candidate
                    break
            # Let Selenium manage the correct ChromeDriver binary for the
            # *current* browser version (your attached browser is Chrome/145).
            driver = webdriver.Chrome(options=options)
        else:
            # Start a fresh Chrome (visible, not headless, so you can interact)
            options.add_argument("--disable-popup-blocking")
            options.add_argument("--disable-gpu")
            options.add_argument("--kiosk-printing")
            # Uncomment to run headless once you no longer need to solve Cloudflare:
            # options.add_argument("--headless=new")
            options.add_argument("--no-sandbox")
            options.add_argument("--disable-dev-shm-usage")
            driver = webdriver.Chrome(
                service=Service(ChromeDriverManager().install()),
                options=options,
            )

        return driver

    def get_platform(self):
        try:
            response = self.session.get(f"{self.jobfeeder_api_url}/api/v1/platforms/?slug={self.name}")
            platforms = response.json().get("results")
            if platforms:
                self.platform = platforms[0]
            else:
                response = self.session.post(
                    f"{self.jobfeeder_api_url}/api/v1/platforms/", json={
                        "name": " ".join(self.name.split("_")).capitalize(),
                        "slug": self.name,
                        "website": self.base_url
                    }
                )
                if response.status_code == 201:
                    self.platform = response.json()
        except Exception as e:
            self.print_out(f"Platform Error: {e}")

    def set_input_value(self, element, value):
        try:            
            # driver.execute_script("arguments[0].removeAttribute('readonly')", element)
            element.clear()
            time.sleep(1)
            element.send_keys(value)
            time.sleep(1)
        except Exception as e:
            self.print_out(f"input_text: {e}")

    def set_select_option(self, element, value):
        try:
            if element.tag_name == "select":
                select = Select(element)
                select.select_by_visible_text(value)
                time.sleep(1)
            else:
                self.print_out(f"Element is not a select element.")
        except Exception as e:
            self.print_out(f"select_option: {e}")

    def get_writer(self):
        writer = csv.writer(
            open(f'data/{self.name}/{self.name}.csv', mode='w', newline='', encoding="utf-8-sig"),
            delimiter=',', quotechar='"', quoting=csv.QUOTE_ALL
        )
        writer.writerow(self.column_headers)
        return writer

    def write(self, values):
        row = []
        for header in self.column_headers:
            row.append(values.get(header, ''))
        self.writer.writerow(row)
        msg = f"{self.unique_index}: {values.get('url')}"
        if self.is_save_in_database:
            values["platform"] = self.platform.get("id")
            values["version"] = self.platform.get("version") + 1
            response = self.session.post(f"{self.jobfeeder_api_url}/api/v1/listings/", json=values, headers={
                'content-yype': 'application/json',
            })
            if response.status_code in [200, 201]:
                msg = f"{msg}: saved in DB - {values['version']}"
            else:
                msg = f"{msg}: failed to save in DB - {response.text}"
        self.print_out(msg)
        self.unique_index += 1

    def validate(self, item):
        try:
            if item == None:
                item = ''
            if type(item) == list:
                item = ' '.join(item)
            item = str(item).strip()
            return item
        except:
            return ""

    def eliminate_space(self, items):
        values = []
        for item in items:
            item = self.validate(item)
            if item.lower() not in ['', ',']:
                values.append(item)
        return values
    
    def config_log(self):
        logging.basicConfig(
            filename=f"data/{self.name}/history.log",
            format='%(asctime)s %(levelname)-s %(message)s',
            level=logging.INFO,
            datefmt='%Y-%m-%d %H:%M:%S')

    def print_out(self, value):
        print(value)
        logging.info(value)
