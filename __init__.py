# Import all scraper classes
from .jobright import Main as JobrightScraper
from .simplify import Main as SimplifyScraper
from .remoterocketship import Main as RemoteRocketshipScraper
from .indeed import Main as IndeedScraper
from .ziprecruiter import Main as ZipRecruiterScraper

# Create a mapping dictionary for platform slugs to scraper classes
crawlers = {
    "jobright": JobrightScraper,
    "simplify": SimplifyScraper,
    "remoterocketship": RemoteRocketshipScraper,
    "indeed": IndeedScraper,
    "ziprecruiter": ZipRecruiterScraper,
}

