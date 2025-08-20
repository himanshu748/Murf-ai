from __future__ import annotations

import logging
from typing import AsyncIterator, Dict, List, Optional

from openai import AsyncOpenAI

from config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


def _get_async_client() -> AsyncOpenAI:
    """Initialize AsyncOpenAI client for Perplexity (OpenAI compatible).

    Uses PERPLEXITY_API_KEY and points base_url to Perplexity API.
    """
    if not settings.PERPLEXITY_API_KEY:
        raise RuntimeError("PERPLEXITY_API_KEY not configured")

    return AsyncOpenAI(
        api_key=settings.PERPLEXITY_API_KEY,
        base_url="https://api.perplexity.ai",
    )


async def stream_chat(
    prompt: str,
    history: Optional[List[Dict[str, str]]] = None,
    model: Optional[str] = None,
    temperature: float = 0.3,
) -> AsyncIterator[str]:
    """Stream chat completion tokens for a given prompt and history.

    Yields incremental token strings as they arrive from the model.
    """
    history = history or []
    model_name = model or settings.PERPLEXITY_MODEL

    # Build base sequence from history plus current prompt if needed
    base_messages: List[Dict[str, str]] = [*history]
    if not (history and history[-1].get("role") == "user"):
        base_messages.append({"role": "user", "content": prompt})

    # Normalize to guarantee alternation by merging consecutive messages of the
    # same role and prepending a simple system prompt if none exists.
    def normalize(messages: List[Dict[str, str]]) -> List[Dict[str, str]]:
        if not messages:
            return [{"role": "system", "content": "You are a helpful assistant."}]
        out: List[Dict[str, str]] = []
        # Prepend system if first is not system
        if messages[0].get("role") != "system":
            out.append({"role": "system", "content": "You are a helpful assistant."})
        for m in messages:
            role = m.get("role")
            content = m.get("content", "")
            if not out:
                out.append({"role": role, "content": content})
            else:
                last = out[-1]
                if last.get("role") == role:
                    last["content"] = (last.get("content", "") + "\n" + content).strip()
                else:
                    out.append({"role": role, "content": content})
        return out

    messages: List[Dict[str, str]] = normalize(base_messages)

    # Safe debug log (truncate to avoid huge logs)
    try:
        logger.debug("LLM payload roles=%s", [m.get("role") for m in messages])
    except Exception:
        pass

    client = _get_async_client()

    logger.info("Starting LLM streaming with model=%s, temp=%.2f", model_name, temperature)

    stream = await client.chat.completions.create(
        model=model_name,
        messages=messages,
        temperature=temperature,
        stream=True,
    )

    async for chunk in stream:
        try:
            choice = chunk.choices[0]
            delta = getattr(choice, "delta", None)
            token = getattr(delta, "content", None)
            if token:
                yield token
        except Exception:  # pragma: no cover - guard against unexpected SDK payloads
            logger.exception("Error parsing streaming chunk from LLM")
            continue


async def complete(
    prompt: str,
    history: Optional[List[Dict[str, str]]] = None,
    model: Optional[str] = None,
    temperature: float = 0.3,
) -> str:
    """Non-streaming completion helper (fallback)."""
    history = history or []
    model_name = model or settings.PERPLEXITY_MODEL

    client = _get_async_client()

    # Reuse normalization logic from stream path
    base_messages: List[Dict[str, str]] = [*(history or [])]
    if not (base_messages and base_messages[-1].get("role") == "user"):
        base_messages.append({"role": "user", "content": prompt})

    # Inline normalize (duplicate to avoid factoring a shared helper with async iterator signature)
    normalized: List[Dict[str, str]] = []
    if base_messages and base_messages[0].get("role") != "system":
        normalized.append({"role": "system", "content": "You are a helpful assistant."})
    elif base_messages and base_messages[0].get("role") == "system":
        # Keep the provided system as-is
        pass
    for m in base_messages:
        role = m.get("role")
        content = m.get("content", "")
        if not normalized:
            normalized.append({"role": role, "content": content})
        else:
            last = normalized[-1]
            if last.get("role") == role:
                last["content"] = (last.get("content", "") + "\n" + content).strip()
            else:
                normalized.append({"role": role, "content": content})

    resp = await client.chat.completions.create(
        model=model_name,
        messages=normalized,
        temperature=temperature,
        stream=False,
    )
    return resp.choices[0].message.content or ""
