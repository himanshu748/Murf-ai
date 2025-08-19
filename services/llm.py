# services/llm.py

import os
import requests
from typing import List, Dict, Any, Tuple

PERPLEXITY_API_KEY = os.getenv("PERPLEXITY_API_KEY")

def get_llm_response(user_query: str, history: List[Dict[str, Any]]) -> Tuple[str, List[Dict[str, Any]]]:
    """Gets a response from the Perplexity AI LLM and updates chat history."""
    
    if not PERPLEXITY_API_KEY:
        raise Exception("PERPLEXITY_API_KEY not configured.")
    
    # Convert history to Perplexity format
    messages = []
    for entry in history:
        if entry.get("role") == "user":
            messages.append({"role": "user", "content": entry.get("parts", [{"text": ""}])[0].get("text", "")})
        elif entry.get("role") == "model":
            messages.append({"role": "assistant", "content": entry.get("parts", [{"text": ""}])[0].get("text", "")})
    
    # Add current user query
    messages.append({"role": "user", "content": user_query})
    
    # Call Perplexity API
    headers = {
        "Authorization": f"Bearer {PERPLEXITY_API_KEY}",
        "Content-Type": "application/json"
    }
    
    payload = {
        "model": "sonar",
        "messages": messages,
        "temperature": 0.7,
        "max_tokens": 1000
    }
    
    response = requests.post(
        "https://api.perplexity.ai/chat/completions",
        json=payload,
        headers=headers
    )
    
    response.raise_for_status()
    result = response.json()
    
    assistant_response = result["choices"][0]["message"]["content"]
    
    # Update history in Gemini-compatible format
    updated_history = history.copy()
    updated_history.append({
        "role": "user", 
        "parts": [{"text": user_query}]
    })
    updated_history.append({
        "role": "model", 
        "parts": [{"text": assistant_response}]
    })
    
    return assistant_response, updated_history
