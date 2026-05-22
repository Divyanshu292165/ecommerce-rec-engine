import os
from huggingface_hub import HfApi

def main():
    repo_id = os.getenv("HF_REPO_ID")
    hf_token = os.getenv("HF_TOKEN")
    
    if not repo_id:
        print("Error: HF_REPO_ID environment variable is not set.")
        return
    if not hf_token:
        print("Warning: HF_TOKEN is not set. Attempting upload with local git credentials...")
        
    print(f"Uploading trained artifacts to Hugging Face Hub repository: {repo_id}...")
    api = HfApi()
    
    files = [
        "rec_index.faiss",
        "rag_index.faiss",
        "product_rag_chunks.npy",
        "als_model.pkl",
        "item_factors.npy",
        "user_factors.npy",
        "item_id_map.json",
        "user_id_map.json"
    ]
    
    for filename in files:
        file_path = f"/tmp/models/{filename}"
        if not os.path.exists(file_path):
            print(f"File not found: {file_path}. Skipping.")
            continue
            
        try:
            print(f"Uploading {filename}...")
            api.upload_file(
                path_or_fileobj=file_path,
                path_in_repo=filename,
                repo_id=repo_id,
                token=hf_token
            )
            print(f"Uploaded {filename} successfully.")
        except Exception as e:
            print(f"Failed to upload {filename}: {e}")

if __name__ == "__main__":
    main()
