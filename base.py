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

    def get_driver(self):
        options = webdriver.ChromeOptions()
        options.add_argument("--disable-popup-blocking")
        options.add_argument("--disable-gpu")
        options.add_argument('--kiosk-printing')
        options.add_argument("--headless=new")
        options.add_argument("--no-sandbox")
        options.add_argument("--disable-dev-shm-usage")
        driver = webdriver.Chrome(
            service=Service(ChromeDriverManager().install()),
            options=options
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
