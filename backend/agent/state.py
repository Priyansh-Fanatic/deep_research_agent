import operator
from typing import Annotated, List, TypedDict, Dict, Any

def merge_dicts(left: Dict, right: Dict) -> Dict:
    """Merge two dictionaries, combining their keys."""
    return {**left, **right}

class AgentState(TypedDict):
    topic: str
    model: str
    plan: List[str]
    past_steps: Annotated[List[str], operator.add]
    search_queries: List[str]
    search_results: Annotated[List[Any], operator.add]
    scraped_content: Annotated[List[str], operator.add]
    scraped_urls: Annotated[List[Dict[str, str]], operator.add]  # Fixed: was missing from state
    research_notes: Annotated[List[str], operator.add]
    parallel_analyses: Annotated[Dict[str, str], merge_dicts]
    report: str
    is_finished: bool
    iteration: int
