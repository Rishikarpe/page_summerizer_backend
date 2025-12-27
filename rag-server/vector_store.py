from sentence_transformers import SentenceTransformer
import faiss
import numpy as np

class VectorStore:
    def __init__(self):
        self.model = SentenceTransformer("all-MiniLM-L6-v2")
        self.index = faiss.IndexFlatL2(384)
        self.metadata = []

    def add_texts(self, texts, metadatas):
        if not texts:
            return

        embeddings = self.model.encode(texts, convert_to_numpy=True)
        self.index.add(embeddings)
        self.metadata.extend(metadatas)

        print(f"✅ Stored {len(texts)} vectors")

    def search(self, query, top_k=5):
        if self.index.ntotal == 0:
            raise ValueError("Vector store is empty. Embed data first.")

        q_emb = self.model.encode([query], convert_to_numpy=True)
        distances, indices = self.index.search(q_emb, top_k)

        results = []
        for idx in indices[0]:
            if idx < len(self.metadata):
                results.append(self.metadata[idx])

        return results
