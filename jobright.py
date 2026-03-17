import os
from lxml import etree
from datetime import datetime
from base import Base
import json
import pdb


class Main(Base):
    base_url = "https://example.com"
    headers = {}

    def __init__(self):
        super().__init__(os.path.basename(__file__))

    def run(self):
        self.print_out(f"Running: {self.name}")
        response = self.session.get(self.base_url)
        tree = etree.HTML(response.text)
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
