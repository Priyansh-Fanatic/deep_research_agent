import os
from langchain_openai import ChatOpenAI
from dotenv import load_dotenv

load_dotenv()

def get_llm(model_name="llama-3.3-70b-versatile", max_tokens=2000):
    """
    Returns a configured ChatOpenAI instance pointing to either Groq or OpenRouter
    based on the model selected, with fallback logic if API keys are missing.
    """
    groq_key = os.getenv("GROQ_API_KEY")
    openrouter_key = os.getenv("OPENROUTER_API_KEY")

    # 1. Normalize legacy/incomplete model names to their fully qualified OpenRouter paths
    normalized_name = model_name.strip().lower() if model_name else ""
    if "gpt-4o-mini" in normalized_name and "/" not in normalized_name:
        model_name = "openai/gpt-4o-mini"
    elif "claude-3.5-sonnet" in normalized_name and "/" not in normalized_name:
        model_name = "anthropic/claude-3.5-sonnet"
    elif "deepseek-r1" in normalized_name and "/" not in normalized_name:
        model_name = "deepseek/deepseek-r1:free"

    # 2. Determine routing target
    is_openrouter = "/" in model_name

    # 3. Apply fallback logic if keys are missing
    if is_openrouter and not openrouter_key:
        print(f"Warning: Selected OpenRouter model '{model_name}' but OPENROUTER_API_KEY is missing.")
        if groq_key:
            print("Falling back to Groq: llama-3.3-70b-versatile.")
            model_name = "llama-3.3-70b-versatile"
            is_openrouter = False
        else:
            print("Error: Neither OPENROUTER_API_KEY nor GROQ_API_KEY is available.")

    elif not is_openrouter and not groq_key:
        print(f"Warning: Selected Groq model '{model_name}' but GROQ_API_KEY is missing.")
        if openrouter_key:
            print("Falling back to OpenRouter: deepseek/deepseek-r1:free.")
            model_name = "deepseek/deepseek-r1:free"
            is_openrouter = True
        else:
            print("Error: Neither GROQ_API_KEY nor OPENROUTER_API_KEY is available.")

    # 4. Initialize client based on routing decision
    if is_openrouter:
        return ChatOpenAI(
            model=model_name,
            temperature=0.3,
            api_key=openrouter_key,
            base_url="https://openrouter.ai/api/v1",
            max_tokens=max_tokens,
            default_headers={
                "HTTP-Referer": "http://localhost:8000",
                "X-Title": "Deep Research Agent"
            }
        )
    else:
        return ChatOpenAI(
            model=model_name,
            temperature=0.3,
            api_key=groq_key,
            base_url="https://api.groq.com/openai/v1",
            max_tokens=max_tokens
        )
