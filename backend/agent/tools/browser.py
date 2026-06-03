import requests
from bs4 import BeautifulSoup

# Browsers that paywalled sites will accept
_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "en-US,en;q=0.9",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}

# Tags that are almost always noise
_NOISE_TAGS = ["script", "style", "nav", "footer", "header", "aside",
               "noscript", "iframe", "form", "button", "svg", "img"]

def scrape_url(url: str, max_chars: int = 4000) -> str:
    """
    Visits a URL and extracts the main text content.
    Returns up to `max_chars` characters of cleaned body text.
    Returns an error string (starting with 'Error') on failure.
    """
    try:
        resp = requests.get(url, headers=_HEADERS, timeout=12, allow_redirects=True)
        resp.raise_for_status()

        # Only process HTML responses
        content_type = resp.headers.get("Content-Type", "")
        if "html" not in content_type:
            return f"Error scraping {url}: non-HTML content ({content_type})"

        soup = BeautifulSoup(resp.content, "html.parser")

        # Remove noisy tags
        for tag in soup(_NOISE_TAGS):
            tag.decompose()

        # Prefer article/main body, fall back to body
        body = (
            soup.find("article")
            or soup.find("main")
            or soup.find(id="content")
            or soup.find(id="main-content")
            or soup.body
        )
        if body is None:
            body = soup

        text = body.get_text(separator="\n")

        # Collapse whitespace
        lines = [ln.strip() for ln in text.splitlines()]
        text = "\n".join(ln for ln in lines if ln)

        return text[:max_chars]

    except requests.exceptions.Timeout:
        return f"Error scraping {url}: request timed out"
    except requests.exceptions.HTTPError as e:
        return f"Error scraping {url}: HTTP {e.response.status_code}"
    except Exception as e:
        return f"Error scraping {url}: {str(e)}"
