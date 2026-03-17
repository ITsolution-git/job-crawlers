import os
from lxml import etree
from datetime import datetime
from base import Base
import json
import pdb
import time


class Main(Base):
    base_url = "https://www.ziprecruiter.com"
    headers = {}

    def __init__(self, is_save_in_database=False):
        super().__init__(os.path.basename(__file__), is_save_in_database=is_save_in_database)
        self.driver = self.get_driver()

    def run(self):
        self.print_out(f"Running: {self.name}")
        self.driver.get(f"{self.base_url}/jobs-search/3?search=&location=united+states")
        time.sleep(10)
        tree = etree.HTML(self.driver.page_source)
        pdb.set_trace()
        for job in tree.xpath("//div[@class='job-item']"):
            self.parse(job)
    
    def parse(self, job):
        try:            
            self.write({
                "title": "",
                "url": "",
            })
        except Exception as e:
            self.print_out(f"Parse Error: {e}")


if __name__ == '__main__':
    Main().run()
