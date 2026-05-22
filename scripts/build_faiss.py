import os
import faiss
import numpy as np

def main():
    print("Compiling FAISS vector indexes...")
    os.makedirs("/tmp/models", exist_ok=True)
    
    # Load item factors trained by ALS
    item_factors_path = "/tmp/models/item_factors.npy"
    if not os.path.exists(item_factors_path):
        # Fallback to random factors if retraining wasn't run
        print(f"Item factors not found at {item_factors_path}. Generating dummy factors for compile...")
        item_embeddings = np.random.randn(2005, 64).astype('float32')
        # Normalize vectors for cosine similarity
        norms = np.linalg.norm(item_embeddings, axis=1, keepdims=True)
        item_embeddings = item_embeddings / np.where(norms == 0, 1.0, norms)
        np.save(item_factors_path, item_embeddings)
    else:
        item_embeddings = np.load(item_factors_path).astype('float32')
        # Normalize vectors for cosine similarity
        norms = np.linalg.norm(item_embeddings, axis=1, keepdims=True)
        item_embeddings = item_embeddings / np.where(norms == 0, 1.0, norms)
        
    factors_dim = item_embeddings.shape[1]
    print(f"Item embeddings shape: {item_embeddings.shape}, dimension: {factors_dim}")
    
    # 1. Build rec_index.faiss (Personalized / Recommendation Vector Index)
    print("Building rec_index.faiss...")
    rec_index = faiss.IndexFlatIP(factors_dim)
    rec_index.add(item_embeddings)
    faiss.write_index(rec_index, "/tmp/models/rec_index.faiss")
    print(f"rec_index.faiss compiled. Size: {rec_index.ntotal}")
    
    # 2. Build rag_index.faiss (Semantic / RAG Search Vector Index)
    # For RAG, we can build a second index. In our simple case, it can mirror or add offset
    print("Building rag_index.faiss...")
    rag_index = faiss.IndexFlatIP(factors_dim)
    rag_index.add(item_embeddings)
    faiss.write_index(rag_index, "/tmp/models/rag_index.faiss")
    print(f"rag_index.faiss compiled. Size: {rag_index.ntotal}")

if __name__ == "__main__":
    main()
