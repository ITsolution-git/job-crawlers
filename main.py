import argparse


def main() -> int:
    parser = argparse.ArgumentParser(description="Run job crawlers")
    parser.add_argument(
        "--csv-only",        
        action="store_true",
        help="If set, save only to local CSV (disable saving to the Job Feeder server DB).",
    )
    args = parser.parse_args()

    # Local imports so `python main.py` works from repo root
    from simplify import Main as SimplifyCrawler
    from jobright import Main as JobrightCrawler
    from ziprecruiter import Main as ZipRecruiterCrawler

    crawlers = [
        ("simplify", SimplifyCrawler),
        ("jobright", JobrightCrawler),
        ("ziprecruiter", ZipRecruiterCrawler),
    ]

    any_failed = False
    save_db = not args.csv_only
    for name, Crawler in crawlers:
        try:
            Crawler(is_save_in_database=save_db).run()
        except Exception as e:
            any_failed = True
            print(f"[main] crawler failed: {name}: {e}")

    return 1 if any_failed else 0


if __name__ == "__main__":
    raise SystemExit(main())

