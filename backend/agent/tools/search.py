from langchain_community.tools import DuckDuckGoSearchResults
from langchain_community.utilities import DuckDuckGoSearchAPIWrapper
import json

from typing import List, Dict

def perform_search(query: str, max_results=20) -> List[Dict]:
    """
    Executes a search using DuckDuckGo and returns the results as a list of dictionaries.
    """
    wrapper = DuckDuckGoSearchAPIWrapper(max_results=max_results)
    try:
        return wrapper.results(query, max_results=max_results)
    except Exception as e:
        print(f"Search error for '{query}': {str(e)}")
        return []
