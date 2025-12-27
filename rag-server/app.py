from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import requests

from sentence_transformers import SentenceTransformer
import faiss
import numpy as np

# ----------------------------
# App
# ----------------------------
app = FastAPI(title="Page Summarizer RAG Server")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # dev only
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ----------------------------
# Models
# ----------------------------
class Chunk(BaseModel):
    id: str
    text: str
    section: str
    selector: Optional[str] = None
    url: str

class QueryRequest(BaseModel):
    query: str
    url: Optional[str] = None
    top_k: int = 5

# ----------------------------
# Embeddings & Vector Store
# ----------------------------
embedder = SentenceTransformer("all-MiniLM-L6-v2")
DIM = 384

index = faiss.IndexFlatL2(DIM)
METADATA: List[dict] = []

# ----------------------------
# Helpers
# ----------------------------
def embed_texts(texts: List[str]) -> np.ndarray:
    return embedder.encode(texts).astype("float32")

def ollama_generate(prompt: str) -> str:
    r = requests.post(
        "http://localhost:11434/api/generate",
        json={
            "model": "mistral",
            "prompt": prompt,
            "stream": False
        },
        timeout=120
    )
    r.raise_for_status()
    return r.json()["response"]

# ----------------------------
# Routes
# ----------------------------
@app.get("/")
def root():
    return {"status": "RAG server running"}

# ----------------------------
# Embed
# ----------------------------
@app.post("/embed")
def embed_chunks(chunks: List[Chunk]):
    texts = [c.text for c in chunks]
    vectors = embed_texts(texts)

    index.add(vectors)

    for c in chunks:
        METADATA.append(c.dict())

    return {
        "status": "ok",
        "chunks_added": len(chunks),
        "total_chunks": len(METADATA)
    }

# ----------------------------
# Check if content exists (IMPORTANT)
# ----------------------------
@app.post("/has_content")
def has_content(req: QueryRequest):
    if index.ntotal == 0 or not req.url:
        return {"ready": False}

    for meta in METADATA:
        if meta["url"] == req.url:
            return {"ready": True}

    return {"ready": False}

# ----------------------------
# Summarize (RAG + LLM)
# ----------------------------
@app.post("/summarize")
def summarize(req: QueryRequest):
    if index.ntotal == 0:
        return {"summary": "No data embedded yet."}

    q_vec = embed_texts([req.query])
    distances, indices = index.search(q_vec, req.top_k * 3)

    context_blocks = []

    for idx in indices[0]:
        if idx < 0 or idx >= len(METADATA):
            continue

        meta = METADATA[idx]
        if req.url is None or meta["url"] == req.url:
            context_blocks.append(meta["text"])

        if len(context_blocks) >= req.top_k:
            break

    if not context_blocks:
        return {"summary": "No relevant content found."}

    context = "\n\n".join(context_blocks)

    prompt = f"""
You are summarizing an article.

STRICT RULES:
- Use ONLY the provided context
- Do NOT add external knowledge
- Be faithful to the author

Before finalizing, internally verify:
- Problem
- Main claim
- Key idea / method
- Why it works
- Results / impact
- Why it matters
- Author’s conclusion

Then produce a structured bullet-point summary covering ALL of these.

Context:
{context}

Task:
{req.query}
"""

    summary = ollama_generate(prompt)

    return {
        "summary": summary,
        "chunks_used": len(context_blocks)
    }
