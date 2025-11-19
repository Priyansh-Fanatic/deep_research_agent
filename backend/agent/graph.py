import json
from typing import List
from langchain_core.messages import SystemMessage, HumanMessage
from langgraph.graph import StateGraph, END
import concurrent.futures

from agent.state import AgentState
from agent.utils.llm import get_llm
from agent.tools.search import perform_search
from agent.tools.browser import scrape_url

# --- Parallel Analysis Nodes ---

def analyze_facts_node(state: AgentState):
    """
    Analyzes search results for key facts and data points in parallel.
    """
    print("--- ANALYZING FACTS (PARALLEL) ---")
    search_results = state["search_results"]
    scraped_content = state.get("scraped_content", [])
    model = state.get("model", "openai/gpt-4o-mini")
    llm = get_llm(model_name=model)
    
    # Format results
    formatted_results = ""
    for r in search_results[-20:]:
        if isinstance(r, dict):
            formatted_results += f"- {r.get('title', 'No title')}: {r.get('snippet', '')} ({r.get('link', '')})\n"
        else:
            formatted_results += f"- {str(r)}\n"
            
    formatted_scraped = "\n\n".join(scraped_content[-10:])
    
    prompt = f"""
    Topic: {state['topic']}
    
    Search Results:
    {formatted_results}
    
    Detailed Content from Key Sources:
    {formatted_scraped}
    
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
        return {"parallel_analyses": {"facts": response.content}}
    except Exception as e:
        print(f"Error in facts analysis: {e}")
        return {"parallel_analyses": {"facts": "Analysis pending..."}}

def analyze_trends_node(state: AgentState):
    """
    Analyzes search results for trends and developments in parallel.
    """
    print("--- ANALYZING TRENDS (PARALLEL) ---")
    search_results = state["search_results"]
    scraped_content = state.get("scraped_content", [])
    model = state.get("model", "openai/gpt-4o-mini")
    llm = get_llm(model_name=model)
    
    # Format results
    formatted_results = ""
    for r in search_results[-20:]:
        if isinstance(r, dict):
            formatted_results += f"- {r.get('title', 'No title')}: {r.get('snippet', '')} ({r.get('link', '')})\n"
        else:
            formatted_results += f"- {str(r)}\n"
            
    formatted_scraped = "\n\n".join(scraped_content[-10:])
    
    prompt = f"""
    Topic: {state['topic']}
    
    Search Results:
    {formatted_results}
    
    Detailed Content from Key Sources:
    {formatted_scraped}
    
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
        return {"parallel_analyses": {"trends": response.content}}
    except Exception as e:
        print(f"Error in trends analysis: {e}")
        return {"parallel_analyses": {"trends": "Analysis pending..."}}

def analyze_insights_node(state: AgentState):
    """
    Analyzes search results for insights and implications in parallel.
    """
    print("--- ANALYZING INSIGHTS (PARALLEL) ---")
    search_results = state["search_results"]
    scraped_content = state.get("scraped_content", [])
    model = state.get("model", "gpt-4o-mini")
    llm = get_llm(model_name=model)
    
    # Format results
    formatted_results = ""
    for r in search_results[-20:]:
        if isinstance(r, dict):
            formatted_results += f"- {r.get('title', 'No title')}: {r.get('snippet', '')} ({r.get('link', '')})\n"
        else:
            formatted_results += f"- {str(r)}\n"
            
    formatted_scraped = "\n\n".join(scraped_content[-10:])
    
    prompt = f"""
    Topic: {state['topic']}
    
    Search Results:
    {formatted_results}
    
    Detailed Content from Key Sources:
    {formatted_scraped}
    
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
        return {"parallel_analyses": {"insights": response.content}}
    except Exception as e:
        print(f"Error in insights analysis: {e}")
        return {"parallel_analyses": {"insights": "Analysis pending..."}}

def synthesize_parallel_node(state: AgentState):
    """
    Synthesizes results from parallel analyses.
    """
    print("--- SYNTHESIZING PARALLEL ANALYSES ---")
    parallel = state.get("parallel_analyses", {})
    
    facts = parallel.get('facts', '')
    trends = parallel.get('trends', '')
    insights = parallel.get('insights', '')
    
    # Combine into cohesive research notes
    synthesis = f"""
### Factual Data and Statistics
{facts}

### Trends and Market Developments
{trends}

### Expert Analysis and Strategic Implications
{insights}
"""
    
    # Append to existing notes if any
    existing_notes = state.get("research_notes", [])
    all_notes = existing_notes + [synthesis]
    
    return {
        "research_notes": all_notes,
        "past_steps": ["Synthesized parallel analyses into professional research notes"]
    }

# --- Nodes ---

def planner_node(state: AgentState):
    """
    Generates a research plan and initial search queries.
    """
    print("--- PLANNING ---")
    topic = state["topic"]
    model = state.get("model", "gpt-4o-mini")
    iteration = state.get("iteration", 0)
    
    llm = get_llm(model_name=model)
    
    if iteration == 0:
        # Initial planning
        prompt = f"""
        You are an expert research strategist. Create comprehensive search queries for in-depth research.
        
        Topic: {topic}
        
        Generate 4-5 strategic search queries that will uncover:
        
        1. **Overview & Fundamentals**: General information, definitions, and key concepts
        2. **Recent Developments**: Latest news, updates, and trends (2023-2025)
        3. **Expert Analysis**: Professional insights, studies, and authoritative sources
        4. **Practical Applications**: Real-world examples, case studies, and use cases
        5. **Future Outlook**: Predictions, implications, and emerging trends
        
        **CRITICAL FOR "HOW-TO" or PROCESS TOPICS:**
        If the topic involves a process (e.g., "how to buy", "application process"), ensure queries cover:
        - Step-by-step procedures
        - Legal and paperwork requirements (checklists)
        - Regulatory compliance and official forms
        - Costs and fees involved
        
        Make queries:
        - Specific and targeted
        - Diverse in coverage
        - Likely to return quality information
        - Focused on authoritative sources
        
        Return ONLY a JSON array of search query strings:
        Example: ["what is [topic] definition and basics", "[topic] latest developments 2024", "[topic] expert analysis"]
        
        Your queries:
        """
        
        messages = [SystemMessage(content="You are an expert research planner with deep analytical skills."), HumanMessage(content=prompt)]
        response = llm.invoke(messages)
        
        try:
            queries = json.loads(response.content.replace("```json", "").replace("```", "").strip())
            if not isinstance(queries, list):
                queries = [topic, f"{topic} explained", f"{topic} latest developments"]
        except Exception as e:
            print(f"Error parsing queries: {e}")
            queries = [topic, f"{topic} explained", f"{topic} latest developments"]

    else:
        # Follow-up research based on gaps
        notes = state.get("research_notes", [])
        prompt = f"""
        You are continuing research on: {topic}
        
        Previous findings summary: {notes[-1] if notes else 'None'}
        
        Identify 2-3 specific areas that need more depth or clarification.
        Generate targeted search queries to fill these gaps.
        
        Return ONLY a JSON array of strings.
        """
        
        messages = [SystemMessage(content="You are an expert research planner."), HumanMessage(content=prompt)]
        response = llm.invoke(messages)
        
        try:
            queries = json.loads(response.content.replace("```json", "").replace("```", "").strip())
            if not isinstance(queries, list):
                queries = [f"{topic} in-depth analysis"]
        except:
            queries = [f"{topic} in-depth analysis"]
        
    return {
        "plan": ["Research plan created"],
        "search_queries": queries,
        "past_steps": [f"Generated {len(queries)} search queries"],
        "iteration": iteration
    }

def search_node(state: AgentState):
    """
    Executes the search queries.
    """
    print("--- SEARCHING ---")
    queries = state["search_queries"]
    results = []
    
    for query in queries:
        print(f"Searching for: {query}")
        res = perform_search(query)
        # res is List[Dict]
        results.extend(res)
        
    return {
        "search_results": results,
        "past_steps": [f"Searched for {len(queries)} queries"]
    }

def scrape_node(state: AgentState):
    """
    Scrapes content from the top search results.
    """
    print("--- SCRAPING ---")
    results = state["search_results"]
    # Filter for dicts and take latest 15
    latest_results = [r for r in results if isinstance(r, dict)][-15:]
    
    scraped = []
    scraped_urls = []
    for res in latest_results:
        url = res.get('link')
        if url:
            print(f"Scraping: {url}")
            try:
                content = scrape_url(url)
                scraped.append(f"Source: {url}\nTitle: {res.get('title')}\nContent: {content[:2000]}...")
                scraped_urls.append({"url": url, "title": res.get('title', '')})
            except Exception as e:
                print(f"Failed to scrape {url}: {e}")
    
    return {
        "scraped_content": scraped,
        "scraped_urls": scraped_urls,
        "past_steps": [f"Scraped {len(scraped)} pages"]
    }

def research_node(state: AgentState):
    """
    Analyzes search results and extracts key information.
    In production, this could scrape actual pages for deeper analysis.
    """
    print("--- RESEARCHING ---")
    search_results = state["search_results"][-len(state["search_queries"]):] # Get latest results
    existing_notes = state.get("research_notes", [])
    model = state.get("model", "gpt-4o-mini")
    
    llm = get_llm(model_name=model)
    
    prompt = f"""
    You are an expert research analyst with exceptional synthesis skills.
    
    Topic: {state['topic']}
    
    Search Results to Analyze:
    {chr(10).join(search_results)}
    
    Previous Research Notes (if any):
    {chr(10).join(existing_notes) if existing_notes else 'This is the first analysis phase.'}
    
    ANALYSIS TASK:
    Extract and synthesize information into these categories:
    
    ### 📌 Key Facts & Statistics
    - List specific data points, numbers, and measurable facts
    - Include percentages, dates, and quantifiable information
    - Use bullet points with **bold** for emphasis
    
    ### 🎯 Core Concepts & Definitions
    - Define important terms and concepts
    - Explain technical aspects clearly
    - Use simple, accessible language
    
    ### 🔄 Different Perspectives & Viewpoints
    - Present multiple angles or opinions
    - Include expert viewpoints when available
    - Note any controversies or debates
    
    ### 📊 Recent Developments & Trends
    - Highlight what's new or changing
    - Identify emerging patterns
    - Note future implications
    
    ### ✅ Credible Sources & Expert Opinions
    - Mention authoritative sources found
    - Include expert quotes or insights
    - Note reliability indicators
    
    ### 🔗 Connections & Context
    - How pieces of information relate
    - Broader context and implications
    - Practical applications or examples
    
    REQUIREMENTS:
    - Use markdown formatting with clear headers
    - Be specific and detailed
    - Focus on accuracy and depth
    - Organize information logically
    - Use bullet points and bold text for emphasis
    - Keep each section concise but informative
    
    Provide your comprehensive analysis now:
    """
    
    messages = [
        SystemMessage(content="You are an expert research analyst with strong critical thinking skills."),
        HumanMessage(content=prompt)
    ]
    
    try:
        response = llm.invoke(messages)
        analysis = response.content
    except Exception as e:
        print(f"Error in research analysis: {e}")
        analysis = f"Analysis completed with {len(search_results)} search results."
    
    return {
        "research_notes": [analysis],
        "past_steps": [f"Analyzed {len(search_results)} search results with deep synthesis"]
    }

def review_node(state: AgentState):
    """
    Decides whether to continue researching or write the report.
    Uses LLM to evaluate if more research is needed.
    """
    print("--- REVIEWING ---")
    iteration = state.get("iteration", 0)
    topic = state["topic"]
    notes = state.get("research_notes", [])
    model = state.get("model", "gpt-4o-mini")
    
    llm = get_llm(model_name=model)
    
    # Hard limit to prevent infinite loops
    if iteration >= 2:
        print("Max iterations reached, proceeding to report writing")
        return {"is_finished": True, "iteration": iteration + 1}
    
    # Ask LLM if we have enough information
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
    
    messages = [
        SystemMessage(content="You are a research quality evaluator."),
        HumanMessage(content=prompt)
    ]
    
    try:
        response = llm.invoke(messages)
        decision = response.content.strip().upper()
        
        if "SUFFICIENT" in decision or iteration >= 1:
            return {"is_finished": True, "iteration": iteration + 1}
        else:
            return {"is_finished": False, "iteration": iteration + 1}
    except Exception as e:
        print(f"Error in review: {e}")
        # Default to finishing if there's an error
        return {"is_finished": True, "iteration": iteration + 1}

def writer_node(state: AgentState):
    """
    Writes the final comprehensive research report.
    """
    print("--- WRITING ---")
    topic = state["topic"]
    notes = state["research_notes"]
    model = state.get("model", "gpt-4o-mini")
    
    prompt = f"""
    You are an AI research assistant creating a comprehensive, well-structured report in the style of ChatGPT.
    
    Topic: {topic}
    
    Research Materials:
    {chr(10).join([f"### Research Phase {i+1}\n{note}" for i, note in enumerate(notes)])}
    
    Create a detailed research report.
    
    **CRITICAL: ADAPT THE STRUCTURE TO THE TOPIC**
    
    **IF the topic is a "How-to", Guide, or Process (e.g., "How to buy a car"):**
    Use this structure:
    1. **Introduction**: Brief overview and importance.
    2. **Step-by-Step Process**: Detailed, chronological steps.
    3. **Requirements & Paperwork**: Comprehensive checklist of documents/forms needed (crucial!).
    4. **Costs & Financials**: Breakdown of expenses.
    5. **Common Pitfalls/Tips**: Expert advice.
    6. **Conclusion**: Final thoughts.
    
    **IF the topic is a Market Analysis or General Research:**
    Use this structure:
    1. **Introduction**: Context and scope.
    2. **Key Statistics**: Data table and analysis.
    3. **Market Landscape**: Players, trends, and technologies.
    4. **Challenges & Opportunities**: Strategic analysis.
    5. **Future Outlook**: Predictions.
    6. **Conclusion**: Summary.
    
    **MANDATORY REQUIREMENTS:**
    1. **Citations**: You MUST include inline citations for every claim, statistic, or fact (e.g., [Source Name]).
    2. **Accuracy**: Do NOT invent statistics. If exact numbers are missing, state "Data not available" or give a qualitative range.
    3. **References Section**: At the very end, include a "## References" section listing all sources used.
    4. **Tone**: Professional, objective, and authoritative.
    
    **Formatting:**
    - Use Markdown (## Headers, **Bold**, Tables).
    - Keep tables clean and readable.
    - Use bullet points for checklists.
    
    Write the complete report now, ensuring it perfectly matches the user's intent and the topic type:
    """
    
    messages = [
        SystemMessage(content="You are an expert technical writer and researcher known for clear, comprehensive reports."),
        HumanMessage(content=prompt)
    ]
    
    try:
        writer_llm = get_llm(model_name=model, max_tokens=3000)  # Use more tokens for the final report
        response = writer_llm.invoke(messages)
        report = response.content
    except Exception as e:
        print(f"Error writing report: {e}")
        report = f"# Research Report: {topic}\n\n" + "\n\n".join(notes)
    
    return {
        "report": report,
        "past_steps": ["Wrote comprehensive final report"]
    }

# --- Graph Definition ---

workflow = StateGraph(AgentState)

workflow.add_node("planner", planner_node)
workflow.add_node("search", search_node)
workflow.add_node("analyze_facts", analyze_facts_node)
workflow.add_node("analyze_trends", analyze_trends_node)
workflow.add_node("analyze_insights", analyze_insights_node)
workflow.add_node("synthesize_parallel", synthesize_parallel_node)
workflow.add_node("review", review_node)
workflow.add_node("writer", writer_node)

workflow.set_entry_point("planner")

workflow.add_node("scrape", scrape_node)

workflow.add_edge("planner", "search")
workflow.add_edge("search", "scrape")
# After scrape, route to all three parallel analysis nodes
workflow.add_edge("scrape", "analyze_facts")
workflow.add_edge("scrape", "analyze_trends")
workflow.add_edge("scrape", "analyze_insights")
# All parallel nodes converge to synthesis
workflow.add_edge("analyze_facts", "synthesize_parallel")
workflow.add_edge("analyze_trends", "synthesize_parallel")
workflow.add_edge("analyze_insights", "synthesize_parallel")
# Synthesis goes to review
workflow.add_edge("synthesize_parallel", "review")

def should_continue(state: AgentState):
    if state.get("is_finished"):
        return "writer"
    return "planner" # Loop back to planning for next iteration

workflow.add_conditional_edges(
    "review",
    should_continue,
    {
        "writer": "writer",
        "planner": "planner"
    }
)

workflow.add_edge("writer", END)

app = workflow.compile()
