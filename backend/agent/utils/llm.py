import os
import time
import logging
from langchain_openai import ChatOpenAI
from langchain_google_genai import ChatGoogleGenerativeAI
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

# ──────────────────────────────────────────────
# Rate-limit / transient error detection
# ──────────────────────────────────────────────
RATE_LIMIT_EXCEPTIONS = (Exception,)  # langchain wraps everything in Exception

def _is_rate_limit(exc: Exception) -> bool:
    """Return True if the exception looks like a rate-limit (429) error."""
    msg = str(exc).lower()
    return "429" in msg or "rate limit" in msg or "rate_limit" in msg or "quota" in msg


# ──────────────────────────────────────────────
# Helper: build a ChatOpenAI pointing at Groq
# ──────────────────────────────────────────────
def _groq_llm(model: str, api_key: str, max_tokens: int) -> ChatOpenAI:
    return ChatOpenAI(
        model=model,
        temperature=0.3,
        api_key=api_key,
        base_url="https://api.groq.com/openai/v1",
        max_tokens=max_tokens,
    )


# ──────────────────────────────────────────────
# Helper: build a ChatOpenAI pointing at OpenRouter
# ──────────────────────────────────────────────
def _openrouter_llm(model: str, api_key: str, max_tokens: int) -> ChatOpenAI:
    return ChatOpenAI(
        model=model,
        temperature=0.3,
        api_key=api_key,
        base_url="https://openrouter.ai/api/v1",
        max_tokens=max_tokens,
        default_headers={
            "HTTP-Referer": "http://localhost:8000",
            "X-Title": "Deep Research Agent",
        },
    )


# ──────────────────────────────────────────────
# Helper: build a ChatGoogleGenerativeAI for Gemini
# ──────────────────────────────────────────────
def _gemini_llm(model: str, api_key: str, max_tokens: int) -> ChatGoogleGenerativeAI:
    return ChatGoogleGenerativeAI(
        model=model,
        temperature=0.3,
        google_api_key=api_key,
        max_output_tokens=max_tokens,
    )


# ──────────────────────────────────────────────
# Public API
# ──────────────────────────────────────────────
def get_llm(model_name: str = "llama-3.3-70b-versatile", max_tokens: int = 2000):
    """
    Returns a configured LLM instance pointing to Groq, OpenRouter, or Gemini.

    Fallback order logic:
      - If Gemini: try flash/pro alternative, fallback to Groq, then OpenRouter
      - If Groq: try lighter Groq, fallback to Gemini, then OpenRouter
      - If OpenRouter: try Groq, fallback to Gemini, then other OpenRouter models
    """
    groq_key = os.getenv("GROQ_API_KEY")
    openrouter_key = os.getenv("OPENROUTER_API_KEY")
    gemini_key = os.getenv("GEMINI_API_KEY")

    # 1. Normalize model names
    normalized = (model_name or "").strip().lower()
    if "gpt-4o-mini" in normalized and "/" not in normalized:
        model_name = "openai/gpt-4o-mini"
    elif "claude-3.5-sonnet" in normalized and "/" not in normalized:
        model_name = "anthropic/claude-3.5-sonnet"
    elif "deepseek-r1" in normalized and "/" not in normalized:
        model_name = "deepseek/deepseek-r1:free"

    is_gemini = "gemini" in normalized
    is_openrouter = "/" in model_name

    # 2. Fallback configuration verification
    if is_gemini and not gemini_key:
        logger.warning(
            "Gemini model '%s' requested but GEMINI_API_KEY is missing. "
            "Falling back to Groq llama-3.3-70b-versatile.",
            model_name,
        )
        if groq_key:
            model_name = "llama-3.3-70b-versatile"
            is_gemini = False
            is_openrouter = False
        elif openrouter_key:
            model_name = "openai/gpt-4o-mini"
            is_gemini = False
            is_openrouter = True
        else:
            logger.error("No API keys (Gemini, Groq, OpenRouter) are available.")

    elif is_openrouter and not openrouter_key:
        logger.warning(
            "OpenRouter model '%s' requested but OPENROUTER_API_KEY is missing. "
            "Falling back to Groq llama-3.3-70b-versatile.",
            model_name,
        )
        if groq_key:
            model_name = "llama-3.3-70b-versatile"
            is_openrouter = False
        elif gemini_key:
            model_name = "gemini-2.5-flash"
            is_gemini = True
            is_openrouter = False
        else:
            logger.error("No API keys available.")

    elif not is_gemini and not is_openrouter and not groq_key:
        logger.warning(
            "Groq model '%s' requested but GROQ_API_KEY is missing. "
            "Falling back to Gemini gemini-2.5-flash.",
            model_name,
        )
        if gemini_key:
            model_name = "gemini-2.5-flash"
            is_gemini = True
        elif openrouter_key:
            model_name = "openai/gpt-4o-mini"
            is_openrouter = True
        else:
            logger.error("No API keys available.")

    # 3. Build primary LLM
    if is_gemini:
        primary = _gemini_llm(model_name, gemini_key, max_tokens)
    elif is_openrouter:
        primary = _openrouter_llm(model_name, openrouter_key, max_tokens)
    else:
        primary = _groq_llm(model_name, groq_key, max_tokens)

    # 4. Build the fallback chain
    fallbacks = []

    if is_gemini:
        # Primary is Gemini -> try other Gemini model, then Groq, then OpenRouter
        if gemini_key:
            other_gemini = "gemini-2.5-pro" if "flash" in model_name else "gemini-2.5-flash"
            fallbacks.append(_gemini_llm(other_gemini, gemini_key, max_tokens))
        if groq_key:
            fallbacks.append(_groq_llm("llama-3.3-70b-versatile", groq_key, max_tokens))
        if openrouter_key:
            fallbacks.append(_openrouter_llm("openai/gpt-4o-mini", openrouter_key, max_tokens))
    elif not is_openrouter:
        # Primary is Groq -> try lighter Groq, then Gemini, then OpenRouter
        if groq_key and model_name != "llama-3.1-8b-instant":
            fallbacks.append(_groq_llm("llama-3.1-8b-instant", groq_key, max_tokens))
        if gemini_key:
            fallbacks.append(_gemini_llm("gemini-2.5-flash", gemini_key, max_tokens))
        if openrouter_key:
            fallbacks.append(_openrouter_llm("openai/gpt-4o-mini", openrouter_key, max_tokens))
            fallbacks.append(_openrouter_llm("meta-llama/llama-3.3-70b-instruct:free", openrouter_key, max_tokens))
    else:
        # Primary is OpenRouter -> try Groq, then Gemini, then other OpenRouter models
        if groq_key:
            fallbacks.append(_groq_llm("llama-3.3-70b-versatile", groq_key, max_tokens))
            fallbacks.append(_groq_llm("llama-3.1-8b-instant", groq_key, max_tokens))
        if gemini_key:
            fallbacks.append(_gemini_llm("gemini-2.5-flash", gemini_key, max_tokens))
        if openrouter_key:
            if model_name != "openai/gpt-4o-mini":
                fallbacks.append(_openrouter_llm("openai/gpt-4o-mini", openrouter_key, max_tokens))
            if model_name != "meta-llama/llama-3.3-70b-instruct:free":
                fallbacks.append(_openrouter_llm("meta-llama/llama-3.3-70b-instruct:free", openrouter_key, max_tokens))

    if fallbacks:
        logger.info(
            "LLM chain: primary=%s | %d fallback(s) configured",
            model_name,
            len(fallbacks),
        )
        return primary.with_fallbacks(
            fallbacks,
            exceptions_to_handle=RATE_LIMIT_EXCEPTIONS,
        )

    return primary

