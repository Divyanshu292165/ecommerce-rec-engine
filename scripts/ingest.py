import os
import json
import numpy as np
import psycopg2
from sentence_transformers import SentenceTransformer
import faiss
from tqdm import tqdm

# Environment variables
DATABASE_URL = os.getenv("DATABASE_URL")
if DATABASE_URL and "sslmode" not in DATABASE_URL:
    DATABASE_URL += "&sslmode=require" if "?" in DATABASE_URL else "?sslmode=require"

# Constants
CHUNK_SIZE = 200  # characters per chunk
EMBEDDING_MODEL = "all-MiniLM-L6-v2"


def create_table_if_missing(conn):
    with conn.cursor() as cur:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS product_rag_chunks (
                id SERIAL PRIMARY KEY,
                product_id INTEGER NOT NULL,
                chunk_text TEXT NOT NULL,
                metadata JSONB
            );
        """)
        conn.commit()


def fetch_or_generate_products(conn):
    # For demo purposes, generate synthetic product descriptions if table is empty
    with conn.cursor() as cur:
        cur.execute("SELECT COUNT(*) FROM product_rag_chunks;")
        count = cur.fetchone()[0]
    if count == 0:
        # Generate synthetic products (100 items)
        products = []
        for pid in range(1, 101):
            desc = f"Product {pid} is a high-quality item with features like durability, style, and performance. "
            desc += "It is suitable for a variety of use cases, including home, office, and outdoor environments. "
            desc += "Key specifications: dimensions, weight, material, warranty, and price."
            products.append((pid, desc))
        return products
    else:
        # In a real project you would fetch existing product data from your DB
        # Here we just return empty list to avoid re‑generating
        return []


def chunk_text(text, size=CHUNK_SIZE):
    return [text[i:i+size] for i in range(0, len(text), size)]


def main():
    print("Starting daily RAG ingestion pipeline...")
    if not DATABASE_URL:
        print("DATABASE_URL not set – aborting.")
        return
    try:
        conn = psycopg2.connect(DATABASE_URL)
    except Exception as e:
        print(f"Failed to connect to Supabase: {e}")
        return

    create_table_if_missing(conn)
    products = fetch_or_generate_products(conn)

    # Load embedding model
    print("Loading sentence‑transformer model...")
    embedder = SentenceTransformer(EMBEDDING_MODEL)

    all_embeddings = []
    # Clear previous chunks to stay within storage limit
    with conn.cursor() as cur:
        cur.execute("DELETE FROM product_rag_chunks;")
        conn.commit()

    # Insert new chunks and collect embeddings
    with conn.cursor() as cur:
        for pid, desc in tqdm(products, desc="Processing products"):
            chunks = chunk_text(desc)
            embeddings = embedder.encode(chunks, show_progress_bar=False, convert_to_numpy=True)
            for chunk, vec in zip(chunks, embeddings):
                # Insert text chunk
                cur.execute(
                    "INSERT INTO product_rag_chunks (product_id, chunk_text, metadata) VALUES (%s, %s, %s) RETURNING id;",
                    (pid, chunk, json.dumps({"product_id": pid}) )
                )
                row_id = cur.fetchone()[0]
                all_embeddings.append(vec)
        conn.commit()

    # Build FAISS index (IP similarity)
    if not all_embeddings:
        print("No embeddings generated – nothing to index.")
        return
    embeddings_np = np.vstack(all_embeddings).astype("float32")
    dim = embeddings_np.shape[1]
    rag_index = faiss.IndexFlatIP(dim)
    rag_index.add(embeddings_np)

    # Save to /tmp/models
    os.makedirs("/tmp/models", exist_ok=True)
    faiss.write_index(rag_index, "/tmp/models/rag_index.faiss")
    np.save("/tmp/models/product_rag_chunks.npy", embeddings_np)
    print(f"Saved rag_index.faiss and product_rag_chunks.npy (size: {embeddings_np.shape[0]} vectors).")

    conn.close()
    print("Ingestion pipeline completed.")

if __name__ == "__main__":
    main()
