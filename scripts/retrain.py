import os
import pickle
import json
import numpy as np
import scipy.sparse as sparse
import implicit
import psycopg2

DATABASE_URL = os.getenv("DATABASE_URL")
if DATABASE_URL and "sslmode" not in DATABASE_URL:
    # Append sslmode=require for postgresql connections
    DATABASE_URL += "&sslmode=require" if "?" in DATABASE_URL else "?sslmode=require"

def main():
    print("Starting model retraining...")
    num_users = 5000
    num_items = 2000
    
    # 1. Connect to Supabase to fetch interactions
    interactions = []
    if DATABASE_URL:
        try:
            print("Connecting to Supabase PostgreSQL database...")
            conn = psycopg2.connect(DATABASE_URL)
            cur = conn.cursor()
            # Try to create interactions table if it does not exist (robustness)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS interactions (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER NOT NULL,
                    item_id INTEGER NOT NULL,
                    interaction_type VARCHAR(50),
                    weight INTEGER DEFAULT 1,
                    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            """)
            conn.commit()
            
            cur.execute("SELECT user_id, item_id, weight FROM interactions LIMIT 200000;")
            interactions = cur.fetchall()
            cur.close()
            conn.close()
            print(f"Loaded {len(interactions)} interactions from database.")
        except Exception as e:
            print(f"Could not load database interactions: {e}. Falling back to synthetic generation...")
            
    # Fallback if no database or empty database
    if not interactions:
        print("Generating synthetic interactions for training...")
        num_interactions = 100000
        user_ids = np.random.randint(1, num_users + 1, num_interactions)
        item_ids = np.random.randint(1, num_items + 1, num_interactions)
        weights = np.random.choice([1, 3, 10, 40], p=[0.7, 0.15, 0.1, 0.05], size=num_interactions)
        interactions = list(zip(user_ids, item_ids, weights))
    else:
        user_ids = [i[0] for i in interactions]
        item_ids = [i[1] for i in interactions]
        weights = [i[2] for i in interactions]
        num_users = max(user_ids) if user_ids else 5000
        num_items = max(item_ids) if item_ids else 2000

    # 2. Train ALS Model
    print("Training ALS model...")
    # Add buffer padding to handle shape matching
    item_user_data = sparse.csr_matrix((weights, (item_ids, user_ids)), shape=(num_items+5, num_users+5))
    model = implicit.als.AlternatingLeastSquares(factors=64, regularization=0.01, iterations=15)
    model.fit(item_user_data)
    print("ALS Training Complete.")
    
    # Save outputs to /tmp/models
    os.makedirs("/tmp/models", exist_ok=True)
    np.save("/tmp/models/user_factors.npy", model.user_factors)
    np.save("/tmp/models/item_factors.npy", model.item_factors)
    with open("/tmp/models/als_model.pkl", "wb") as f:
        pickle.dump(model, f)
        
    item_id_map = {int(i): int(i) for i in range(1, num_items+5)}
    user_id_map = {int(i): int(i) for i in range(1, num_users+5)}
    
    with open("/tmp/models/item_id_map.json", "w") as f:
        json.dump(item_id_map, f)
    with open("/tmp/models/user_id_map.json", "w") as f:
        json.dump(user_id_map, f)
        
    print("ALS models saved to /tmp/models.")

if __name__ == "__main__":
    main()
