# Generic VLM and LLM loader functions.
# ════════════════════════════════════════════════════════════════════════════════
# ██████████████████████████████████████████████████████████████████████████████
# ██                                                                          ██
# ██              ──── MODEL INJECTION POINT ────                             ██
# ██                                                                          ██
# ██  The actual model checkpoints are NOT loaded yet.                        ██
# ██  When you decide which model to use, do the following:                   ██
# ██                                                                          ██
# ██  1. Set VLM_MODEL_NAME in your .env file.                               ██
# ██     Example:  VLM_MODEL_NAME=Salesforce/blip2-opt-2.7b                  ██
# ██               VLM_MODEL_NAME=llava-hf/llava-1.5-7b-hf                  ██
# ██                                                                          ██
# ██  2. Set OPENAI_API_KEY (for GPT-4o orchestrator) in .env.               ██
# ██                                                                          ██
# ██  3. The load_vlm() and get_llm() functions below will automatically      ██
# ██     pick up your settings and load the correct model.                   ██
# ██                                                                          ██
# ██████████████████████████████████████████████████████████████████████████████
# ════════════════════════════════════════════════════════════════════════════════
from __future__ import annotations

from functools import lru_cache
from typing import Any

from app.core.config import get_settings
from app.core.logger import get_logger

settings = get_settings()
logger = get_logger("model_provider")


# ── VLM LOADER ────────────────────────────────────────────────────────────────
@lru_cache(maxsize=1)
def load_vlm() -> tuple[Any, Any]:
    """
    Loads the Vision-Language Model (VLM) processor and model.

    Returns:
        (processor, model) — ready for inference.

    ── DATASET / MODEL INJECTION POINT ─────────────────────────────────────────
    Set VLM_MODEL_NAME in .env to the HuggingFace checkpoint you choose.
    Expected: a causal VLM compatible with AutoModelForVision2Seq or AutoProcessor.
    Model weights are cached to: data/weights/<model_name>/
    Drop any custom local weights at that path instead of using HuggingFace Hub.
    ─────────────────────────────────────────────────────────────────────────────
    """
    model_name = settings.vlm_model_name

    if model_name == "PLACEHOLDER_SET_WHEN_MODEL_IS_CHOSEN":
        logger.warning(
            "vlm_not_configured",
            message="VLM_MODEL_NAME is not set. Returning stub. Set it in .env before running inference.",
        )
        return _stub_processor(), _stub_model()

    logger.info("loading_vlm", model=model_name, device=settings.vlm_device)

    # Lazy import to avoid ImportError when running without GPU/torch at startup
    from transformers import AutoModelForVision2Seq, AutoProcessor

    processor = AutoProcessor.from_pretrained(model_name)
    model = AutoModelForVision2Seq.from_pretrained(
        model_name,
        torch_dtype="auto",
        device_map=settings.vlm_device,
    )
    model.eval()
    logger.info("vlm_loaded", model=model_name)
    return processor, model


# ── LLM LOADER (ORCHESTRATOR) ─────────────────────────────────────────────────
@lru_cache(maxsize=1)
def get_llm() -> Any:
    """
    Returns the LLM used by the LangGraph orchestrator planner.
    Default: GPT-4o (best production results for agentic tasks).

    ── LLM INJECTION POINT ─────────────────────────────────────────────────────
    Set LLM_PROVIDER and the corresponding API key in .env.
    Supported providers: openai (default), gemini, ollama
    ─────────────────────────────────────────────────────────────────────────────
    """
    provider = settings.llm_provider
    model = settings.llm_model
    logger.info("loading_llm", provider=provider, model=model)

    if provider == "openai":
        if settings.openai_api_key == "PLACEHOLDER_API_KEY_TO_BE_PROVIDED":
            logger.warning("llm_api_key_missing", provider="openai")
            return _stub_llm()
        from langchain_openai import ChatOpenAI
        return ChatOpenAI(model=model, api_key=settings.openai_api_key, temperature=0)

    elif provider == "gemini":
        if not settings.google_api_key:
            logger.warning("llm_api_key_missing", provider="gemini")
            return _stub_llm()
        from langchain_google_genai import ChatGoogleGenerativeAI
        return ChatGoogleGenerativeAI(model=model, google_api_key=settings.google_api_key, temperature=0)

    elif provider == "ollama":
        from langchain_ollama import ChatOllama
        return ChatOllama(model=model, base_url=settings.ollama_base_url, temperature=0)

    raise ValueError(f"Unsupported LLM_PROVIDER: {provider}. Choose: openai | gemini | ollama")


# ── STUBS ──────────────────────────────────────────────────────────────────────

class _StubProcessor:
    """Stub processor returned when VLM_MODEL_NAME is not configured."""
    def __call__(self, *args, **kwargs) -> dict:
        return {}


class _StubModel:
    """Stub model returned when VLM_MODEL_NAME is not configured."""
    def generate(self, *args, **kwargs) -> list:
        return []


class _StubLLM:
    """Stub LLM returned when API key is not yet provided."""
    def invoke(self, *args, **kwargs) -> str:
        return "[LLM stub — set API key in .env to enable real inference]"


def _stub_processor() -> _StubProcessor:
    return _StubProcessor()

def _stub_model() -> _StubModel:
    return _StubModel()

def _stub_llm() -> _StubLLM:
    return _StubLLM()
