import warnings
# Suppress the package renaming warning from duckduckgo_search
warnings.filterwarnings("ignore", category=RuntimeWarning, message=".*duckduckgo_search.*")

from duckduckgo_search import DDGS
from typing import List, Dict
import time


def perform_search(query: str, max_results: int = 8) -> List[Dict]:
    """
    Executes a DuckDuckGo search and returns results as a list of dicts.
    Uses the modern DDGS API instead of the deprecated LangChain wrapper.
    Each result has: title, snippet, link keys.
    """
    try:
        with DDGS() as ddgs:
            raw = list(ddgs.text(query, max_results=max_results))
        
        results = []
        for r in raw:
            results.append({
                "title":   r.get("title", ""),
                "snippet": r.get("body", ""),
                "link":    r.get("href", ""),
            })
        return results
    except Exception as e:
        print(f"Search error for '{query}': {str(e)}")
        # Small back-off on rate-limit style errors
        if "ratelimit" in str(e).lower() or "202" in str(e):
            time.sleep(3)
        return []
