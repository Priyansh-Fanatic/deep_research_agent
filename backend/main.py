from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from fastapi.responses import StreamingResponse
import json
import asyncio
import traceback
from agent.graph import app as agent_app

app = FastAPI(
    title="Deep Research Agent API",
    description="Advanced AI-powered research assistant with LangGraph",
    version="2.0.0"
)

# Allow CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:3000",
        "https://deep-research-agent-1-22jz.onrender.com"  # Your Render frontend URL
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ResearchRequest(BaseModel):
    topic: str
    model: str = "openai/gpt-4o-mini"  # Default model
    
    class Config:
        json_schema_extra = {
            "example": {
                "topic": "Artificial Intelligence in Healthcare",
                "model": "openai/gpt-4o-mini"
            }
        }

@app.post("/research")
async def start_research(request: ResearchRequest):
    """
    Starts a research task and streams the output as Server-Sent Events (SSE).
    
    The agent will:
    1. Plan research queries
    2. Search for information
    3. Analyze and synthesize findings
    4. Generate a comprehensive report
    """
    if not request.topic or not request.topic.strip():
        raise HTTPException(status_code=400, detail="Topic cannot be empty")
    
    async def event_generator():
        initial_state = {
            "topic": request.topic.strip(),
            "model": request.model,
            "plan": [],
            "past_steps": [],
            "search_queries": [],
            "search_results": [],
            "research_notes": [],
            "report": "",
            "is_finished": False,
            "iteration": 0
        }
        
        try:
            # Stream events from the graph
            for event in agent_app.stream(initial_state):
                # event is a dict like {'node_name': {state_updates}}
                for node_name, state_update in event.items():
                    # Send detailed messages based on node
                    if node_name == "planner":
                        queries = state_update.get("search_queries", [])
                        for query in queries:
                            data = {
                                "type": "update",
                                "node": node_name,
                                "message": f"Searching for: {query}"
                            }
                            yield f"data: {json.dumps(data)}\n\n"
                            await asyncio.sleep(0)  # Allow other tasks to run
                    
                    elif node_name == "search":
                        data = {
                            "type": "update",
                            "node": node_name,
                            "message": "Searching..."
                        }
                        yield f"data: {json.dumps(data)}\n\n"
                    
                    elif node_name == "scrape":
                        # Send scraped URLs to frontend
                        scraped_urls = state_update.get("scraped_urls", [])
                        for item in scraped_urls:
                            data = {
                                "type": "update",
                                "node": node_name,
                                "message": f"Scraping: {item['url']}"
                            }
                            yield f"data: {json.dumps(data)}\n\n"
                            await asyncio.sleep(0)
                        
                        # Send general message if no URLs
                        if not scraped_urls:
                            data = {
                                "type": "update",
                                "node": node_name,
                                "message": "Reading sources..."
                            }
                            yield f"data: {json.dumps(data)}\n\n"
                    
                    elif "analyze" in node_name:
                        data = {
                            "type": "update",
                            "node": node_name,
                            "message": "ANALYZING"
                        }
                        yield f"data: {json.dumps(data)}\n\n"
                    
                    elif node_name == "synthesize_parallel":
                        data = {
                            "type": "update",
                            "node": node_name,
                            "message": "SYNTHESIZING"
                        }
                        yield f"data: {json.dumps(data)}\n\n"
                    
                    elif node_name == "writer":
                        data = {
                            "type": "update",
                            "node": node_name,
                            "message": "WRITING"
                        }
                        yield f"data: {json.dumps(data)}\n\n"
                    
                    else:
                        # Generic update for other nodes
                        data = {
                            "type": "update",
                            "node": node_name,
                            "message": f"✓ Completed: {node_name.replace('_', ' ').title()}"
                        }
                        yield f"data: {json.dumps(data)}\n\n"
                    
                    # If we have a report, send it specifically
                    if "report" in state_update and state_update["report"]:
                        data = {
                            "type": "complete",
                            "report": state_update["report"]
                        }
                        yield f"data: {json.dumps(data)}\n\n"
                        
        except Exception as e:
            print(f"Error in research agent: {str(e)}")
            print(traceback.format_exc())
            error_data = {
                "type": "error", 
                "message": f"Research error: {str(e)}"
            }
            yield f"data: {json.dumps(error_data)}\n\n"

    return StreamingResponse(
        event_generator(), 
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        }
    )

@app.get("/health")
def health_check():
    """Health check endpoint"""
    return {
        "status": "ok",
        "service": "Deep Research Agent API",
        "version": "2.0.0"
    }

@app.get("/")
def root():
    """Root endpoint with API information"""
    return {
        "message": "Deep Research Agent API",
        "version": "2.0.0",
        "endpoints": {
            "health": "/health",
            "research": "/research (POST)",
            "docs": "/docs"
        }
    }
