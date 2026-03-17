import os
from lxml import etree
from datetime import datetime, timedelta
from base import Base
import json
import pdb
import re


class Main(Base):
    base_url = "https://simplify.jobs"
    headers = {}

    def __init__(self, is_save_in_database=False):
        super().__init__(os.path.basename(__file__))

    def _is_posted_from_yesterday_to_now(self, posted_dt: datetime) -> bool:
        now = datetime.now()
        start_yesterday = (now - timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
        return start_yesterday <= posted_dt <= now

    def run(self):
        page_index = 1
        while True:
            self.print_out(f"Running: {self.name} - Page {page_index}")
            response = self.session.post("https://js-ha.simplify.jobs/multi_search?x-typesense-api-key=SWF1ODFZbzBkcVlVdnVwT2FqUE5EZ3JpSk5hVmdpUHg1SklXWEdGbHZVRT1POHJieyJleGNsdWRlX2ZpZWxkcyI6ImNvbXBhbnlfdXJsLGNhdGVnb3JpZXMsYWRkaXRpb25hbF9yZXF1aXJlbWVudHMsY291bnRyaWVzLGRlZ3JlZXMsZ2VvbG9jYXRpb25zLGluZHVzdHJpZXMsaXNfc2ltcGxlX2FwcGxpY2F0aW9uLGpvYl9saXN0cyxsZWFkZXJzaGlwX3R5cGUsc2VjdXJpdHlfY2xlYXJhbmNlLHNraWxscyx1cmwifQ%3D%3D",
                headers={
                    'accept': 'application/json, text/plain, */*',
                    'content-type': 'text/plain',
                    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
                },
                json={"searches":[{"query_by":"title,company_name,functions,locations","per_page":50,"sort_by":"_text_match:desc,start_date:desc","highlight_full_fields":"title,company_name,functions,locations","collection":"jobs","q":"*","facet_by":"countries,degrees,experience_level,functions,locations,travel_requirements,type","filter_by":"countries:=[`United States`, `Germany`, `Spain`, `Italy`, `France`, `Ireland`, `Australia`, `Canada`, `Netherlands`, `Sweden`, `Belgium`, `Switzerland`]","max_facet_values":50,"page": page_index}]},
            )
            jobs = response.json()["results"][0]["hits"]
            for job in jobs:
                self.parse(job)

            if len(jobs) == 0:
                break

            page_index += 1
    
    def parse(self, job):
        try:
            data = job.get('document', {})
            response = self.session.get(f"https://api.simplify.jobs/v2/job-posting/:id/{data.get('posting_id')}/company")
            details = response.json()

            ts = data.get('start_date')
            if not ts:
                return
            # handle seconds vs milliseconds epoch
            if ts > 10**12:
                ts = ts / 1000.0

            posted_dt = datetime.fromtimestamp(ts)
            if not self._is_posted_from_yesterday_to_now(posted_dt):
                exit(1)

            posted_at = posted_dt.strftime('%Y-%m-%d %H:%M:%S')
            url = f"https://simplify.jobs/jobs/click/{data.get('posting_id')}"
            job_response = self.session.get(url)
            if job_response.status_code == 200:
                job_url = job_response.url
            else:
                job_url = url

            self.write({
                "unique_id": data.get('posting_id'),
                "title": data.get('title'),
                "company": data.get('company_name'),
                "country": self.unique_countries(data.get('locations')),
                "salary_min": data.get('min_salary', 0),
                "salary_max": data.get('max_salary', 0),
                "salary_period": data.get('salary_period', 0),
                "salary_currency": data.get('currency_type'),
                "work_arrangement": data.get('travel_requirements'),
                "posted_at": posted_at,
                "experience_level": ", ".join(data.get('experience_level')),
                "job_type": data.get('type'),
                "skills": ", ".join(item.get("name", "") for item in details.get('skills', [])),
                "url": url,
                "job_url": job_url,
                "data": details,
            })
        except Exception as e:
            self.print_out(f"Parse Error: {e}")

    def unique_countries(self, locations):
        out = []
        seen = set()
        for loc in locations:
            if not loc:
                continue
            s = re.sub(r"\s+", " ", str(loc)).strip().strip(",")
            # country is typically the last comma-separated token
            country = s.split(",")[-1].strip()
            # normalize common variants
            if country in {"US", "U.S.", "U.S.A.", "United States", "United States of America"}:
                country = "USA"
            if country in {"UK", "U.K.", "Great Britain"}:
                country = "United Kingdom"
            if country and country not in seen:
                seen.add(country)
                out.append(country)
        return ", ".join(out)


if __name__ == '__main__':
    Main(is_save_in_database=False).run()
