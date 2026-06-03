import json
from typing import List
from langchain_core.messages import SystemMessage, HumanMessage
from langgraph.graph import StateGraph, END

from agent.state import AgentState
from agent.utils.llm import get_llm
from agent.tools.search import perform_search
from agent.tools.browser import scrape_url

# ---------------------------------------------------------------------------
# Helper: format search results for prompts
# ---------------------------------------------------------------------------

def _fmt_results(search_results: list, limit: int = 20) -> str:
    out = ""
    for r in search_results[-limit:]:
        if isinstance(r, dict):
            out += f"- {r.get('title', 'No title')}: {r.get('snippet', '')} ({r.get('link', '')})\n"
        else:
            out += f"- {str(r)}\n"
    return out

def _fmt_scraped(scraped_content: list, limit: int = 5) -> str:
    return "\n\n".join(scraped_content[-limit:])

# ---------------------------------------------------------------------------
# Analysis nodes  (run sequentially inside synthesize to avoid fan-out bug)
# ---------------------------------------------------------------------------

def _analyze_facts(topic: str, search_results: list, scraped_content: list, llm) -> str:
    prompt = f"""
    Topic: {topic}

    Search Results:
    {_fmt_results(search_results)}

    Detailed Content from Key Sources:
    {_fmt_scraped(scraped_content)}

    Extract factual data and statistics for an academic research report:

    **DATA POINTS AND STATISTICS**
    - Extract specific numbers, percentages, metrics, and dates
    - Include market sizes, growth rates, survey results
    - Document quantifiable outcomes and measurements
    - CRITICAL: Cite the source for every statistic (e.g., "According to [Source], X% of...")

    **HISTORICAL AND CONTEXTUAL FACTS**
    - Important dates, milestones, and timeline information
    - Technical specifications and parameters
    - Verified factual information

    Use formal academic language. Structure in clear paragraphs or organized lists.
    Always include source attribution for data points.
    """
    try:
        response = llm.invoke([
            SystemMessage(content="You are a data extraction specialist."),
            HumanMessage(content=prompt)
        ])
        return response.content
    except Exception as e:
        print(f"Error in facts analysis: {e}")
        return "Facts analysis pending..."


def _analyze_trends(topic: str, search_results: list, scraped_content: list, llm) -> str:
    prompt = f"""
    Topic: {topic}

    Search Results:
    {_fmt_results(search_results)}

    Detailed Content from Key Sources:
    {_fmt_scraped(scraped_content)}

    Conduct a professional trend analysis for an academic research report:

    **CURRENT TRENDS AND PATTERNS**
    - Identify emerging patterns and industry movements
    - Document significant market or behavioral shifts
    - Support each trend with evidence from credible sources

    **RECENT DEVELOPMENTS**
    - Highlight significant developments from the past 6-12 months
    - Include innovations, policy changes, or market shifts
    - Cite sources for major developments

    **FUTURE PROJECTIONS**
    - Evaluate predicted developments based on current trajectory
    - Base projections on expert forecasts and analysis
    - Identify potential disruptions or transformative factors

    Use formal analytical language. Structure in cohesive paragraphs.
    Maintain objective, professional tone. Cite sources for claims.
    """
    try:
        response = llm.invoke([
            SystemMessage(content="You are a trends analyst."),
            HumanMessage(content=prompt)
        ])
        return response.content
    except Exception as e:
        print(f"Error in trends analysis: {e}")
        return "Trends analysis pending..."


def _analyze_insights(topic: str, search_results: list, scraped_content: list, llm) -> str:
    prompt = f"""
    Topic: {topic}

    Search Results:
    {_fmt_results(search_results)}

    Detailed Content from Key Sources:
    {_fmt_scraped(scraped_content)}

    Conduct expert analysis and synthesis for an academic research report:

    **EXPERT PERSPECTIVES**
    - Document insights from industry experts and thought leaders
    - Include relevant academic or research viewpoints
    - Clearly attribute all insights to their sources

    **STRATEGIC IMPLICATIONS**
    - Analyze business impact and strategic opportunities
    - Evaluate risks, challenges, and critical success factors
    - Assess competitive dynamics where relevant

    **ANALYTICAL SYNTHESIS**
    - Examine root causes and underlying mechanisms
    - Identify interconnections between factors
    - Contextualize findings within broader trends

    Use formal academic language. Attribute all expert opinions to sources.
    Structure in analytical paragraphs. Maintain scholarly, objective tone.
    """
    try:
        response = llm.invoke([
            SystemMessage(content="You are an insights analyst."),
            HumanMessage(content=prompt)
        ])
        return response.content
    except Exception as e:
        print(f"Error in insights analysis: {e}")
        return "Insights analysis pending..."


# ---------------------------------------------------------------------------
# Graph Nodes
# ---------------------------------------------------------------------------

def planner_node(state: AgentState):
    """Generates a research plan and initial search queries."""
    print("--- PLANNING ---")
    topic = state["topic"]
    model = state.get("model", "llama-3.3-70b-versatile")
    iteration = state.get("iteration", 0)

    llm = get_llm(model_name=model)

    if iteration == 0:
        prompt = f"""
        You are an expert research strategist. Create comprehensive search queries for in-depth research.

        Topic: {topic}

        Generate 4-5 strategic search queries that will uncover:
        1. Overview & Fundamentals: General information, definitions, and key concepts
        2. Recent Developments: Latest news, updates, and trends (2023-2025)
        3. Expert Analysis: Professional insights, studies, and authoritative sources
        4. Practical Applications: Real-world examples, case studies, and use cases
        5. Future Outlook: Predictions, implications, and emerging trends

        **CRITICAL FOR "HOW-TO" or PROCESS TOPICS:**
        If the topic involves a process (e.g., "how to buy", "application process"), ensure queries cover:
        - Step-by-step procedures
        - Legal and paperwork requirements (checklists)
        - Regulatory compliance and official forms
        - Costs and fees involved

        Make queries specific, diverse, and focused on authoritative sources.

        Return ONLY a JSON array of search query strings:
        Example: ["what is {topic} definition and basics", "{topic} latest developments 2024"]

        Your queries:
        """
    else:
        notes = state.get("research_notes", [])
        prompt = f"""
        You are continuing research on: {topic}

        Previous findings summary: {notes[-1] if notes else 'None'}

        Identify 2-3 specific areas that need more depth or clarification.
        Generate targeted search queries to fill these gaps.

        Return ONLY a JSON array of strings.
        """

    messages = [
        SystemMessage(content="You are an expert research planner with deep analytical skills."),
        HumanMessage(content=prompt)
    ]

    try:
        response = llm.invoke(messages)
    except Exception as e:
        if "429" in str(e) or "rate limit" in str(e).lower():
            raise RuntimeError(
                "All LLM providers are currently rate-limited. "
                "Please wait a few minutes and try again, or switch to a different model."
            ) from e
        raise

    try:
        raw = response.content.replace("```json", "").replace("```", "").strip()
        queries = json.loads(raw)
        if not isinstance(queries, list):
            raise ValueError("Not a list")
    except Exception as e:
        print(f"Error parsing queries: {e}")
        queries = [topic, f"{topic} explained", f"{topic} latest developments 2024"]

    return {
        "plan": ["Research plan created"],
        "search_queries": queries,
        "past_steps": [f"Generated {len(queries)} search queries"],
        "iteration": iteration,
    }


def search_node(state: AgentState):
    """Executes the search queries concurrently."""
    import concurrent.futures
    print("--- SEARCHING ---")
    queries = state["search_queries"]
    results = []

    def _do_search(query):
        print(f"Searching for: {query}")
        return perform_search(query)

    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
        futures = {executor.submit(_do_search, q): q for q in queries}
        for future in concurrent.futures.as_completed(futures):
            try:
                res = future.result()
                results.extend(res)
            except Exception as e:
                print(f"Error in concurrent search: {e}")

    return {
        "search_results": results,
        "past_steps": [f"Searched {len(queries)} queries, got {len(results)} results"],
    }


def scrape_node(state: AgentState):
    """Scrapes content from the top search results concurrently."""
    import concurrent.futures
    print("--- SCRAPING ---")
    results = state["search_results"]
    # De-duplicate URLs and take latest results
    seen_urls: set = set()
    unique_results = []
    for r in reversed(results):
        if isinstance(r, dict):
            url = r.get("link", "")
            if url and url not in seen_urls:
                seen_urls.add(url)
                unique_results.append(r)
        if len(unique_results) >= 10:
            break

    scraped = []
    scraped_urls = []

    def _do_scrape(res):
        url = res.get("link")
        if not url:
            return None
        print(f"Scraping: {url}")
        try:
            content = scrape_url(url)
            if content and not content.startswith("Error"):
                return {
                    "scraped_str": f"Source: {url}\nTitle: {res.get('title', '')}\nContent:\n{content}",
                    "url_info": {"url": url, "title": res.get("title", "")}
                }
            else:
                print(f"Skipping failed scrape for {url}: {content[:120]}")
        except Exception as e:
            print(f"Failed to scrape {url}: {e}")
        return None

    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
        futures = [executor.submit(_do_scrape, r) for r in unique_results]
        for future in concurrent.futures.as_completed(futures):
            try:
                res = future.result()
                if res:
                    scraped.append(res["scraped_str"])
                    scraped_urls.append(res["url_info"])
            except Exception as e:
                print(f"Error in concurrent scrape: {e}")

    return {
        "scraped_content": scraped,
        "scraped_urls": scraped_urls,
        "past_steps": [f"Scraped {len(scraped)} of {len(unique_results)} pages"],
    }


def analyze_node(state: AgentState):
    """
    Runs all three analysis types concurrently (facts, trends, insights)
    and stores results in parallel_analyses.
    
    NOTE: LangGraph doesn't support true fan-out to multiple separate nodes
    without the Send API, so we run the analyses in a single node to avoid
    the graph topology bug.
    """
    import concurrent.futures
    print("--- ANALYZING (facts + trends + insights) ---")
    topic = state["topic"]
    model = state.get("model", "llama-3.3-70b-versatile")
    search_results = state.get("search_results", [])
    scraped_content = state.get("scraped_content", [])

    llm = get_llm(model_name=model)

    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
        future_facts = executor.submit(_analyze_facts, topic, search_results, scraped_content, llm)
        future_trends = executor.submit(_analyze_trends, topic, search_results, scraped_content, llm)
        future_insights = executor.submit(_analyze_insights, topic, search_results, scraped_content, llm)

        facts = future_facts.result()
        trends = future_trends.result()
        insights = future_insights.result()

    return {
        "parallel_analyses": {
            "facts": facts,
            "trends": trends,
            "insights": insights,
        },
        "past_steps": ["Completed facts, trends, and insights analysis"],
    }


def synthesize_node(state: AgentState):
    """Synthesizes the three analyses into cohesive research notes."""
    print("--- SYNTHESIZING ---")
    parallel = state.get("parallel_analyses", {})

    facts    = parallel.get("facts", "")
    trends   = parallel.get("trends", "")
    insights = parallel.get("insights", "")

    synthesis = f"""### Factual Data and Statistics
{facts}

### Trends and Market Developments
{trends}

### Expert Analysis and Strategic Implications
{insights}
"""
    existing_notes = state.get("research_notes", [])
    return {
        "research_notes": existing_notes + [synthesis],
        "past_steps": ["Synthesized analyses into research notes"],
    }


def review_node(state: AgentState):
    """Decides whether to continue researching or write the report."""
    print("--- REVIEWING ---")
    iteration = state.get("iteration", 0)
    topic = state["topic"]
    notes = state.get("research_notes", [])
    model = state.get("model", "llama-3.3-70b-versatile")

    # Hard limit to prevent infinite loops
    if iteration >= 2:
        print("Max iterations reached, proceeding to report writing")
        return {"is_finished": True, "iteration": iteration + 1}

    llm = get_llm(model_name=model)

    prompt = f"""
    You are evaluating research completeness for the topic: {topic}

    Current iteration: {iteration + 1}
    Research notes gathered:
    {chr(10).join(notes)}

    Assess if the research is sufficient to write a comprehensive report.

    Consider:
    - Have we covered the main aspects of the topic?
    - Is there sufficient depth and detail?
    - Are there obvious gaps that need more research?

    Respond with ONLY 'SUFFICIENT' or 'NEEDS_MORE' followed by a brief reason.
    """

    try:
        response = llm.invoke([
            SystemMessage(content="You are a research quality evaluator."),
            HumanMessage(content=prompt)
        ])
        decision = response.content.strip().upper()
        finished = "SUFFICIENT" in decision or iteration >= 1
        return {"is_finished": finished, "iteration": iteration + 1}
    except Exception as e:
        print(f"Error in review: {e}")
        return {"is_finished": True, "iteration": iteration + 1}


def writer_node(state: AgentState):
    """Writes the final comprehensive research report."""
    print("--- WRITING ---")
    topic = state["topic"]
    notes = state.get("research_notes", [])
    model = state.get("model", "llama-3.3-70b-versatile")

    prompt = f"""
    You are an AI research assistant creating a comprehensive, well-structured research report.

    Topic: {topic}

    Research Materials:
    {chr(10).join([f"### Research Phase {i+1}\n{note}" for i, note in enumerate(notes)])}

    Create a detailed research report.

    **CRITICAL: ADAPT THE STRUCTURE TO THE TOPIC**

    **IF the topic is a "How-to", Guide, or Process:**
    Structure:
    1. Introduction
    2. Step-by-Step Process
    3. Requirements & Paperwork
    4. Costs & Financials
    5. Common Pitfalls / Tips
    6. Conclusion

    **IF the topic is a Market Analysis or General Research:**
    Structure:
    1. Introduction
    2. Key Statistics (data table)
    3. Market Landscape
    4. Challenges & Opportunities
    5. Future Outlook
    6. Conclusion

    **MANDATORY REQUIREMENTS:**
    1. Citations: Include inline citations for every claim (e.g., [Source Name]).
    2. Accuracy: Do NOT invent statistics. If exact numbers are missing, state "Data not available".
    3. References Section: End with "## References" listing all sources.
    4. Tone: Professional, objective, and authoritative.

    **Formatting:** Use Markdown (## Headers, **Bold**, Tables, bullet points).

    Write the complete report now:
    """

    try:
        writer_llm = get_llm(model_name=model, max_tokens=4000)
        response = writer_llm.invoke([
            SystemMessage(content="You are an expert technical writer and researcher."),
            HumanMessage(content=prompt)
        ])
        report = response.content
    except Exception as e:
        print(f"Error writing report: {e}")
        report = f"# Research Report: {topic}\n\n" + "\n\n".join(notes)

    return {
        "report": report,
        "past_steps": ["Wrote comprehensive final report"],
    }


# ---------------------------------------------------------------------------
# Graph Definition
# ---------------------------------------------------------------------------

def should_continue(state: AgentState):
    if state.get("is_finished"):
        return "writer"
    return "planner"


workflow = StateGraph(AgentState)

workflow.add_node("planner",     planner_node)
workflow.add_node("search",      search_node)
workflow.add_node("scrape",      scrape_node)
workflow.add_node("analyze",     analyze_node)      # single node (was fan-out bug)
workflow.add_node("synthesize",  synthesize_node)   # renamed from synthesize_parallel
workflow.add_node("review",      review_node)
workflow.add_node("writer",      writer_node)

workflow.set_entry_point("planner")

workflow.add_edge("planner",    "search")
workflow.add_edge("search",     "scrape")
workflow.add_edge("scrape",     "analyze")
workflow.add_edge("analyze",    "synthesize")
workflow.add_edge("synthesize", "review")

workflow.add_conditional_edges(
    "review",
    should_continue,
    {"writer": "writer", "planner": "planner"},
)

workflow.add_edge("writer", END)

app = workflow.compile()
