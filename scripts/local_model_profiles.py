"""Small, explicit LM Studio runtime profiles used by Folio evaluations.

The values keep model loading reproducible on a 48 GB Apple-silicon
machine and use each model family's published/default sampling shape.  They
are deliberately limited to knobs that LM Studio's OpenAI-compatible API and
``lms load`` expose consistently.
"""
from __future__ import annotations

from typing import Any


LOAD_PROFILE: dict[str, Any] = {
    "context_length": 65536,
    "gpu": "max",
    "parallel": 1,
    "ttl_s": 600,
}

_LOAD_OVERRIDES: dict[str, dict[str, Any]] = {
    # LFM2-24B-A2B publishes a 32k context window.  The other candidates in
    # Folio's current comparison can keep the shared 64k evaluation profile.
    "lfm2-24b-a2b": {"context_length": 32768},
}

_HERMES_CANDIDATE_LIMITS: dict[str, int] = {
    # LFM2's published 32K window works for bounded domain pools, but Hermes'
    # compression path requires an auxiliary model with at least 64K context.
    # Keep it in the comparison for small/medium pools and fail before model
    # work when the complete index would cross that known harness boundary.
    "lfm2-24b-a2b": 120,
}

_DEFAULT = {
    "temperature": 0.7,
    "top_p": 0.8,
    "top_k": 20,
    "reasoning_effort": "none",
}

_PROFILES = {
    "qwen3.6-35b-a3b-ud-mlx": _DEFAULT,
    "qwen3.8-27b-mlx": {
        "temperature": 1.0,
        "top_p": 0.95,
        "top_k": 20,
        "reasoning_effort": "none",
    },
    "google/gemma-4-31b-qat": {
        "temperature": 1.0,
        "top_p": 0.95,
        "top_k": 64,
        "reasoning_effort": "none",
    },
    "gemma-4-26b-a4b-it-mlx": {
        "temperature": 1.0,
        "top_p": 0.95,
        "top_k": 64,
        "reasoning_effort": "none",
    },
    "qwen3-30b-a3b-thinking-2507": {
        "temperature": 0.6,
        "top_p": 0.95,
        "top_k": 20,
        "reasoning_effort": "low",
    },
    "ministral-3-14b-instruct-2512": {
        "temperature": 0.1,
        "top_p": 1.0,
        "top_k": 20,
        "reasoning_effort": "none",
    },
    "nvidia-nemotron-3-nano-30b-a3b": {
        "temperature": 0.6,
        "top_p": 0.95,
        "top_k": 20,
        "reasoning_effort": "low",
    },
    "lfm2-24b-a2b": {
        "temperature": 0.1,
        "top_p": 1.0,
        "top_k": 50,
        "reasoning_effort": "none",
    },
    "ibm/granite-4.1-8b": {
        "temperature": 0.2,
        "top_p": 1.0,
        "top_k": 20,
        "reasoning_effort": "none",
    },
    "zai-org/glm-4.7-flash": {
        "temperature": 1.0,
        "top_p": 0.95,
        "top_k": 20,
        "reasoning_effort": "low",
    },
    "phi-4-mini-instruct": {
        "temperature": 0.0,
        "top_p": 1.0,
        "top_k": 20,
        "reasoning_effort": "none",
    },
}

_CLASSIFICATION_TEMPLATE_KWARGS: dict[str, dict[str, Any]] = {
    # Qwen/GLM-family templates expose a boolean turn-level switch.  Keep
    # thinking available in their general profiles, but disable it for the
    # tiny, schema-constrained mail decision.
    "qwen3.6-35b-a3b-ud-mlx": {"enable_thinking": False},
    "qwen3.8-27b-mlx": {"enable_thinking": False},
    "qwen3-30b-a3b-thinking-2507": {"enable_thinking": False},
    "zai-org/glm-4.7-flash": {"enable_thinking": False},
}

# Nemotron Nano currently collides with LM Studio's strict grammar when its
# chat template emits the reserved ``</tool_call>`` token.  Folio still applies
# the same exact local schema validation after generation; only the engine-side
# grammar is omitted for this model family.
_PROMPT_ONLY_STRUCTURED_OUTPUT = {
    "nvidia-nemotron-3-nano-30b-a3b",
}


def load_profile_for(model_id: str) -> dict[str, Any]:
    """Return the common load shape with narrow, documented exceptions."""
    return {**LOAD_PROFILE, **_LOAD_OVERRIDES.get(model_id, {})}


def hermes_candidate_limit_for(model_id: str) -> int | None:
    """Return the largest pool this model may inspect through Hermes."""
    return _HERMES_CANDIDATE_LIMITS.get(model_id)


def profile_for(model_id: str) -> dict[str, Any]:
    """Return a copy so callers cannot mutate the shared catalog."""
    return dict(_PROFILES.get(model_id, _DEFAULT))


def api_fields(model_id: str, *, max_tokens: int) -> dict[str, Any]:
    """Fields for LM Studio's OpenAI-compatible chat endpoint."""
    profile = profile_for(model_id)
    return {
        "temperature": profile["temperature"],
        "top_p": profile["top_p"],
        "top_k": profile["top_k"],
        "reasoning_effort": profile["reasoning_effort"],
        "max_tokens": max_tokens,
    }


def classification_api_fields(model_id: str, *, max_tokens: int) -> dict[str, Any]:
    """Deterministic, bounded fields for small structured classifications.

    The general profiles above remain model-native because they are also used
    for generative and agentic work.  Mail triage is a different workload: the
    schema is tiny, deliberation is not part of the returned evidence, and long
    hidden reasoning only increases latency and the chance of exhausting the
    completion budget before the JSON answer is emitted.
    """
    fields = api_fields(model_id, max_tokens=max_tokens)
    fields.update({
        "temperature": 0.1,
        "top_p": 1.0,
        "top_k": 20,
        "reasoning_effort": "none",
    })
    template_kwargs = _CLASSIFICATION_TEMPLATE_KWARGS.get(model_id)
    if template_kwargs:
        fields["chat_template_kwargs"] = dict(template_kwargs)
    return fields


def supports_engine_structured_output(model_id: str) -> bool:
    """Whether LM Studio's grammar layer is compatible with this model."""
    return model_id not in _PROMPT_ONLY_STRUCTURED_OUTPUT


def hermes_agent_fields(model_id: str) -> dict[str, Any]:
    """Equivalent sampling fields in Hermes' AIAgent vocabulary."""
    profile = profile_for(model_id)
    effort = profile["reasoning_effort"]
    reasoning_config = (
        {"enabled": False}
        if effort == "none"
        else {"enabled": True, "effort": effort}
    )
    return {
        "reasoning_config": reasoning_config,
        "request_overrides": {
            "temperature": profile["temperature"],
            "top_p": profile["top_p"],
            "extra_body": {"top_k": profile["top_k"]},
        },
    }
