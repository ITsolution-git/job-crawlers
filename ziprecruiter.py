import os
import re
import time
from datetime import datetime, timedelta
from urllib.parse import parse_qs, urlparse

from base import Base
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver import ActionChains


class Main(Base):
    base_url = "https://www.ziprecruiter.com"
    headers = {}

    # Set to True to attach to a Chrome you started manually with:
    #   google-chrome --remote-debugging-port=9222 --user-data-dir=/tmp/chromeProfile
    # That way you solve Cloudflare once in your own browser and the scraper
    # reuses your session (cookies, login, etc.) automatically.
    use_existing_browser = True

    # Debug: dump raw HTML to disk.
    # Keeping this False avoids creating lots of `data/ziprecruiter/page_*.html` files.
    dump_debug_html = False

    def __init__(self, is_save_in_database: bool = False):
        super().__init__(os.path.basename(__file__), is_save_in_database=is_save_in_database)
        self.driver = self.get_driver()
        # keep track of URLs we've already written to avoid duplicates
        self._seen_urls = set()

    def run(self):
        """
        Very first version of the ZipRecruiter scraper.
        - Visits the first few search pages for USA roles
        - Extracts basic fields from each job card

        NOTE: The XPaths/CSS class names may need tweaking after
        inspecting the live DOM in your browser / via `pdb`.
        """
        self.print_out(f"Running: {self.name}")

        max_pages = 5  # keep conservative while iterating

        # Keywords to search for (from your example URL)
        search_terms = ["javascript", "python", "ruby", "typescript", "node", "ai"]

        for term in search_terms:
            page_index = 1
            lk_value = None  # ZipRecruiter search/session token; required for stable pagination.
            self.print_out(f"=== Searching for term: {term} ===")

            while page_index <= max_pages:
                # Pagination format on ZipRecruiter is path-based:
                #   /jobs-search/<pageIndex>?...
                # (e.g. https://www.ziprecruiter.com/jobs-search/4? ... )
                query_tail = (
                    "days=1"
                    "&location=US"
                    "&radius=4000"
                    "&refine_by_employment="
                    "&refine_by_location_type="
                    "&refine_by_salary="
                    "&refine_by_salary_ceil="
                    "&refine_by_apply_type="
                    "&refine_by_experience_level="
                )

                lk_tail = f"&lk={lk_value}" if lk_value else ""
                url = f"{self.base_url}/jobs-search/{page_index}?{query_tail}&search={term}{lk_tail}"
                self.print_out(f"Fetching page {page_index} for '{term}': {url}")

                # Capture a job link before navigation so we can detect page changes.
                def get_first_job_href():
                    try:
                        anchors = self.driver.find_elements(
                            By.CSS_SELECTOR, ".job_results_two_pane a[href^='/jobs/']"
                        )
                        if not anchors:
                            return None
                        return anchors[0].get_attribute("href")
                    except Exception:
                        return None

                first_job_before = get_first_job_href()
                self.driver.get(url)
                time.sleep(7)

                # Wait a bit for client-side routing to finish. The site is
                # React/Next.js, so content can lag behind URL changes.
                try:
                    if first_job_before:
                        page_wait_deadline = time.time() + 20
                        while time.time() < page_wait_deadline:
                            first_job_after = get_first_job_href()
                            if first_job_after and first_job_after != first_job_before:
                                break
                            time.sleep(1)
                except Exception:
                    pass

                # Extract lk token after page 1 loads so pagination stays consistent.
                if lk_value is None:
                    try:
                        parsed = urlparse(self.driver.current_url)
                        qs = parse_qs(parsed.query)
                        if "lk" in qs and qs["lk"]:
                            lk_value = qs["lk"][0]
                            self.print_out(f"Detected lk for '{term}': {lk_value}")
                    except Exception:
                        pass

                page_source = self.driver.page_source

                # Detect Cloudflare / bot protection challenge pages
                if "Performing security verification" in page_source or "cf-turnstile" in page_source:
                    self.print_out(
                        f"Hit Cloudflare security verification page instead of job listings "
                        f"for term '{term}'. Public scraping from this environment is currently being blocked."
                    )
                    self.print_out(
                        "Waiting for the challenge to be cleared in your open Chromium window "
                        "(you can complete it manually)."
                    )

                    # Give the user time to complete the challenge. Because we attach
                    # to an existing browser session, any cookies set by your manual
                    # solve will carry over.
                    challenge_deadline = time.time() + 180  # 3 minutes
                    while time.time() < challenge_deadline:
                        try:
                            # If cards exist, the page is usable again.
                            cards_now = self.driver.find_elements(
                                By.CSS_SELECTOR, ".job_results_two_pane .job_result_two_pane_v2"
                            )
                            if cards_now:
                                page_source = self.driver.page_source
                                self.print_out("Cloudflare challenge cleared; continuing scrape.")
                                break
                        except Exception:
                            pass

                        # Otherwise keep polling for marker removal.
                        page_source = self.driver.page_source
                        if (
                            "Performing security verification" not in page_source
                            and "cf-turnstile" not in page_source
                        ):
                            self.print_out("Cloudflare markers removed; continuing scrape.")
                            break

                        time.sleep(3)
                    else:
                        self.print_out(f"Timed out waiting for Cloudflare to clear for term '{term}'.")
                        break

                # Optionally dump raw HTML for debugging.
                if self.dump_debug_html:
                    debug_path = f"data/{self.name}/page_{term}_{page_index}.html"
                    try:
                        with open(debug_path, "w", encoding="utf-8") as f:
                            f.write(page_source)
                        self.print_out(f"Wrote debug HTML to {debug_path}")
                    except Exception as e:
                        self.print_out(
                            f"Failed writing debug HTML for term '{term}' page {page_index}: {e}"
                        )

                # IMPORTANT: For the US Next.js site, the job cards are rendered
                # dynamically in the live DOM. We select the list cards from the
                # left pane, click each, then read full details from the right pane.
                try:
                    cards = WebDriverWait(self.driver, 15).until(
                        EC.presence_of_all_elements_located(
                            (By.CSS_SELECTOR, ".job_results_two_pane .job_result_two_pane_v2")
                        )
                    )
                except Exception:
                    cards = []

                self.print_out(
                    f"Found {len(cards)} job cards on page {page_index} for '{term}'"
                )

                if not cards:
                    self.print_out(f"No job cards found for '{term}', stopping pagination for this term.")
                    break

                # Click cards one by one; re-query each time to avoid stale references
                for idx in range(len(cards)):
                    try:
                        cards = self.driver.find_elements(
                            By.CSS_SELECTOR, ".job_results_two_pane .job_result_two_pane_v2"
                        )
                        if idx >= len(cards):
                            break
                        card = cards[idx]

                        # Scroll card into center of viewport
                        self.driver.execute_script(
                            "arguments[0].scrollIntoView({block: 'center'});", card
                        )
                        time.sleep(0.5)

                        # Click near the center of the card to avoid hitting child buttons
                        actions = ActionChains(self.driver)
                        size = card.size
                        actions.move_to_element_with_offset(
                            card, size.get("width", 0) / 2, size.get("height", 0) / 2
                        ).click().perform()
                    except Exception as e:
                        self.print_out(f"Failed to click card {idx} for '{term}': {e}")
                        continue

                    # Let the right pane update
                    time.sleep(1.5)

                    # Parse details from the right pane
                    self.parse_from_right_pane(term)

                page_index += 1

    def _parse_relative_posted_at(self, text: str) -> str:
        """
        Convert strings like '3 days ago', '1 day ago', 'Just posted'
        into a concrete timestamp string, similar to `simplify.py`.
        """
        if not text:
            return ""

        text = text.lower().strip()
        now = datetime.now()

        if "just posted" in text or "today" in text:
            dt = now
        elif "hour" in text:
            m = re.search(r"(\d+)", text)
            hours = int(m.group(1)) if m else 1
            dt = now - timedelta(hours=hours)
        elif "day" in text:
            m = re.search(r"(\d+)", text)
            days = int(m.group(1)) if m else 1
            dt = now - timedelta(days=days)
        elif "week" in text:
            m = re.search(r"(\d+)", text)
            weeks = int(m.group(1)) if m else 1
            dt = now - timedelta(weeks=weeks)
        else:
            return ""

        return dt.strftime("%Y-%m-%d %H:%M:%S")

    def _extract_text(self, node, xpath_expr: str) -> str:
        res = node.xpath(xpath_expr)
        if not res:
            return ""
        # take first match; node.text if element
        item = res[0]
        if isinstance(item, str):
            return item.strip()
        return "".join(item.itertext()).strip()

    def _extract_attr(self, node, xpath_expr: str, attr: str) -> str:
        res = node.xpath(xpath_expr)
        if not res:
            return ""
        el = res[0]
        return (el.get(attr) or "").strip()

    def parse_from_right_pane(self, term: str):
        """
        Extract job details from the right-hand pane after a card click.
        """
        try:
            right_pane = WebDriverWait(self.driver, 10).until(
                EC.presence_of_element_located(
                    (By.CSS_SELECTOR, "div[data-testid='job-details-scroll-container']")
                )
            )
        except Exception as e:
            self.print_out(f"Right pane not found for term '{term}': {e}")
            return

        try:
            # Title
            title_el = right_pane.find_element(
                By.CSS_SELECTOR,
                "h2.font-bold.text-primary.text-header-md"
            )
            title = (title_el.text or "").strip()
        except Exception:
            title = ""

        # Company and company profile link
        try:
            company_el = right_pane.find_element(
                By.CSS_SELECTOR,
                "h2.font-bold.text-primary.text-header-md + a"
            )
            company = (company_el.text or "").strip()
            company_link = company_el.get_attribute("href") or ""
        except Exception:
            company = ""
            company_link = ""

        # Job detail URL (use company_link as a fallback if we don't have a better one)
        url = company_link or self.driver.current_url

        # Use URL as a poor-man's unique id (ZipRecruiter usually has job id in URL)
        unique_id = re.sub(r"[^a-zA-Z0-9]", "_", url)
        if unique_id in self._seen_urls:
            return
        self._seen_urls.add(unique_id)

        # Location
        try:
            location_el = right_pane.find_element(
                By.XPATH,
                ".//h2/following::p[contains(@class,'text-body-md')][1]"
            )
            location = (location_el.text or "").strip()
        except Exception:
            location = ""

        # Country: last comma-separated token from location
        country = ""
        if location:
            parts = [p.strip() for p in location.split(",") if p.strip()]
            if parts:
                country = parts[-1]

        # Salary text like "$221K - $299K/yr"
        salary_text = ""
        salary_min = 0
        salary_max = 0
        salary_period = ""
        salary_currency = ""
        try:
            salary_el = right_pane.find_element(
                By.XPATH,
                ".//p[contains(@class,'text-body-md') and contains(., '$')]"
            )
            salary_text = (salary_el.text or "").strip()
        except Exception:
            salary_text = ""

        if salary_text:
            m = re.findall(r"\$([\d,]+)", salary_text)
            if m:
                numbers = [int(x.replace(",", "")) for x in m]
                salary_min = numbers[0]
                salary_max = numbers[-1] if len(numbers) > 1 else numbers[0]
            if "/yr" in salary_text or "/ year" in salary_text or "per year" in salary_text:
                salary_period = "year"
            elif "/hr" in salary_text or "/ hour" in salary_text or "per hour" in salary_text:
                salary_period = "hour"
            salary_currency = "USD"

        # Job type e.g. Full-time / Part-time
        try:
            job_type_el = right_pane.find_element(
                By.XPATH,
                ".//p[contains(@class,'text-body-md') and "
                "(contains(., 'Full-time') or contains(., 'Part-time') or contains(., 'Contract'))]"
            )
            job_type = (job_type_el.text or "").strip()
        except Exception:
            job_type = ""

        # Posted at relative text like "Posted 4 hours ago"
        posted_at = ""
        try:
            posted_el = right_pane.find_element(
                By.XPATH,
                ".//p[contains(@class,'text-body-md') and contains(., 'Posted ')]"
            )
            posted_text = (posted_el.text or "").strip()
            posted_at = self._parse_relative_posted_at(posted_text)
        except Exception:
            posted_at = ""

        # Work arrangement – look for Remote/Hybrid/On-site in the description/title
        work_arrangement = ""
        full_text = (title + " " + location + " " + salary_text).lower()
        if "remote" in full_text:
            work_arrangement = "Remote"
        elif "hybrid" in full_text:
            work_arrangement = "Hybrid"
        elif "on-site" in full_text or "on site" in full_text:
            work_arrangement = "On-site"

        try:
            self.write(
                {
                    "unique_id": unique_id,
                    "title": title,
                    "company": company,
                    "country": country,
                    "salary_min": salary_min,
                    "salary_max": salary_max,
                    "salary_period": salary_period,
                    "salary_currency": salary_currency,
                    "work_arrangement": work_arrangement,
                    "posted_at": posted_at,
                    "experience_level": "",
                    "job_type": job_type,
                    "skills": "",
                    "url": url,
                    "job_url": url,
                }
            )
        except Exception as e:
            self.print_out(f"Parse Error: {e}")


if __name__ == "__main__":
    Main(is_save_in_database=True).run()
