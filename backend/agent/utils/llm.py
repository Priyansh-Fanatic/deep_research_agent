import os
from langchain_openai import ChatOpenAI
from dotenv import load_dotenv

load_dotenv()

def get_llm(model_name="openai/gpt-4o-mini", max_tokens=2000):
    """
    Returns a configured ChatOpenAI instance.
    Defaults to openai/gpt-4o-mini for cost efficiency, but can be configured.
    """
    api_key = os.getenv("OPENROUTER_API_KEY")
    if not api_key:
        print("Warning: OPENROUTER_API_KEY not found in environment variables.")
    
    return ChatOpenAI(
        model=model_name,
        temperature=0.3,
        api_key=api_key,
        base_url="https://openrouter.ai/api/v1",
        max_tokens=max_tokens,
        default_headers={
            "HTTP-Referer": "http://localhost:8000",
            "X-Title": "Deep Research Agent"
        }
    )
