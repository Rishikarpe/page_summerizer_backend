from pydantic import BaseModel
from typing import List

class Chunk(BaseModel):
    id: str
    text: str
    section: str
    selector: str
    url: str

class QueryRequest(BaseModel):
    query: str
    url: str
    top_k: int = 5
