import requests

OLLAMA_URL = "http://localhost:11434/api/generate"
MODEL = "mistral"

def generate_summary(context: str, instruction: str):
    prompt = f"""
You are a precise assistant.
Only use the information provided in the CONTEXT.
Do NOT add external knowledge.

TASK:
{instruction}

CONTEXT:
{context}

SUMMARY:
"""

    response = requests.post(
        OLLAMA_URL,
        json={
            "model": MODEL,
            "prompt": prompt,
            "stream": False
        },
        timeout=120
    )

    response.raise_for_status()
    return response.json()["response"].strip()
