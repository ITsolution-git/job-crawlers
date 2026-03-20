import os
from lxml import etree
from datetime import datetime, timedelta
from base import Base
import json
import pdb
import re


class Main(Base):
    base_url = "https://jobright.ai"
    headers = {}

    def __init__(self, is_save_in_database=False):
        super().__init__(os.path.basename(__file__), is_save_in_database=is_save_in_database)

    def _is_posted_from_yesterday_to_now(self, posted_dt: datetime) -> bool:
        now = datetime.now()
        start_yesterday = (now - timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
        return start_yesterday <= posted_dt <= now

    def run(self):
        page_index = 1
        for query in self.search_queries:
            need_to_break = False
            while True:
                self.print_out(f"Running: {self.name} - Page {query} - {page_index}" )
                payload = '{"searchType":"job_title","value":"python","jobTaxonomyList":[{"taxonomyId":"00-00-00","title":"_KEYWORD_"}],"country":"US","jobTypes":[],"seniority":[],"workModel":[],"locations":[],"companies":[],"isH1BOnly":false,"companyCategory":null,"annualSalaryMinimum":null,"roleType":null,"companyStages":null,"skills":[],"excludedCompanies":[],"excludedSkills":null,"excludeStaffingAgency":false,"minYearsOfExperienceRange":null,"excludeCompanyCategory":[],"excludeSecurityClearance":false,"excludeUsCitizen":false,"refresh":false,"position":_POSITION_INDEX_,"sortCondition":0}'
                position_index = (page_index-1)*10
                payload = payload.replace("_KEYWORD_", query).replace("_POSITION_INDEX_", str(position_index))
                response = self.session.post(f"https://jobright.ai/swan/recommend/search?searchType=job_title&refresh=false",
                    headers={
                        'accept': '*/*',
                        'content-type': 'application/json',
                        'cookie': '_ga=GA1.1.1831875953.1772817918; _tt_enable_cookie=1; _ttp=01KK22XFZ0KF7R139JE3EFHG91_.tt.1; _gcl_au=1.1.1575288858.1772897920; AMP_1a6abdb582=JTdCJTIyZGV2aWNlSWQlMjIlM0ElMjJlM2NhZTdlMi0wZjQ4LTRiOWQtOTY0ZC1kMzMxMjhlNjk3NzUlMjIlMkMlMjJzZXNzaW9uSWQlMjIlM0ExNzcyODk4MDUzNTYxJTJDJTIyb3B0T3V0JTIyJTNBZmFsc2UlMkMlMjJsYXN0RXZlbnRUaW1lJTIyJTNBMTc3Mjg5ODA1MzU2NyUyQyUyMmxhc3RFdmVudElkJTIyJTNBMiUyQyUyMnBhZ2VDb3VudGVyJTIyJTNBMSU3RA==; g_state={"i_l":0,"i_ll":1772898084996,"i_b":"A2iTS41kyacRxXZUKcEfQ/cm91IkK5wgJNCcHW21O+Q","i_e":{"enable_itp_optimization":0}}; SESSION_ID=5471ea63eefe4462a057679eee4e82e7; __stripe_mid=ceed1f04-6ebc-4bfe-92ff-707b9988c05ad2ea01; __stripe_sid=9ec8835e-c5eb-458a-8524-13559b8370eb53867c; _clck=1ft7xrf%5E2%5Eg4i%5E0%5E2256; _uetsid=dfd99fe0242511f1ae20fdcf7987947c; _uetvid=7518dd50198111f184d3bd98fd79613c; ttcsid_CM0IJ53C77U0797CAP10=1773988052485::RyTfPQwR_tksxBNqWsPT.3.1773988085625.1; ttcsid=1773988052486::piJdm_gIyqfvj4RCqlRi.3.1773988085625.0; _clsk=4ndqvm%5E1773988086178%5E4%5E1%5Eq.clarity.ms%2Fcollect; _ga_ETKKWETCJD=GS2.1.s1773988047$o3$g1$t1773988086$j21$l0$h2085272583; _ga_EMDW7CFP60=GS2.1.s1773988047$o3$g1$t1773988086$j21$l0$h724774176',
                        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
                    },
                    data=payload
                )
                jobs = response.json().get("result", {}).get("jobList", [])
                for job in jobs:
                    res = self.parse(job)
                    if not res:
                        need_to_break = True
                        break
                
                if need_to_break:
                    break

                if len(jobs) == 0:
                    break

                page_index += 1
    
    def parse(self, job):
        try:
            data = job.get('jobResult', {})
            posting_id = data.get('jobId', None)
            if posting_id in ["None", None, ""] or posting_id in self.history:
                return 'duplicated'

            self.history.append(posting_id)

            ts = data.get('publishTime')
            if not ts:
                return 'no publishTime'

            posted_dt = None
            if isinstance(ts, (int, float)):
                # handle seconds vs milliseconds epoch
                ts_val = ts / 1000.0 if ts > 10**12 else ts
                posted_dt = datetime.fromtimestamp(ts_val)
            elif isinstance(ts, str):
                ts_s = ts.strip()
                try:
                    # Example: "2026-02-05 00:55:19"
                    posted_dt = datetime.strptime(ts_s, "%Y-%m-%d %H:%M:%S")
                except ValueError:
                    # Try ISO-8601 variants (may include timezone)
                    try:
                        posted_dt = datetime.fromisoformat(ts_s.replace("Z", "+00:00"))
                        if posted_dt.tzinfo is not None:
                            posted_dt = posted_dt.astimezone().replace(tzinfo=None)
                    except Exception:
                        return 'invalid publishTime'
            elif isinstance(ts, datetime):
                posted_dt = ts
            else:
                return 'invalid publishTime'
            if not self._is_posted_from_yesterday_to_now(posted_dt):
                return False

            posted_at = posted_dt.strftime('%Y-%m-%d %H:%M:%S')

            self.write({
                "unique_id": posting_id,
                "title": data.get('jobTitle'),
                "company": job.get("companyResult", {}).get('companyName'),
                "country": data.get('jobLocation'),
                "work_arrangement": data.get('workModel'),
                "posted_at": posted_at,
                "experience_level": data.get('jobSeniority'),
                "job_type": data.get('employmentType'),
                "skills": ", ".join(self.eliminate_space([skill.get("skill") for skill in data.get("detailQualifications", {}).get("mustHave", {}).get("hardSkill", [])])),
                "url": f"https://jobright.ai/jobs/info/{posting_id}",
                "job_url": data.get('applyLink'),
                # "data": details,
            })
        except Exception as e:
            self.print_out(f"Parse Error: {e}")
        
        return 'success'

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
