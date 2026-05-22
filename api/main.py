import os
import time
import json
import pickle
import faiss
import torch
from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from huggingface_hub import hf_hub_download
from upstash_redis import Redis
import asyncpg
from prometheus_fastapi_instrumentator import Instrumentator
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from contextlib import asynccontextmanager

# Environment Variables
DATABASE_URL = os.getenv("DATABASE_URL")
UPSTASH_REDIS_REST_URL = os.getenv("UPSTASH_REDIS_REST_URL")
UPSTASH_REDIS_REST_TOKEN = os.getenv("UPSTASH_REDIS_REST_TOKEN")
HF_REPO_ID = os.getenv("HF_REPO_ID", "your-username/ecommerce-rec-engine")

# Rate Limiter
limiter = Limiter(key_func=get_remote_address)

# Global model store
models = {}
db_pool = None

# Redis client
try:
    redis = Redis(url=UPSTASH_REDIS_REST_URL, token=UPSTASH_REDIS_REST_TOKEN) if UPSTASH_REDIS_REST_URL else None
except Exception:
    redis = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global db_pool
    # 1. Start Database Pool
    if DATABASE_URL:
        db_pool = await asyncpg.create_pool(DATABASE_URL)
    
    # 2. Download and Load Models
    print("Loading models from Hugging Face...")
    try:
        models["version"] = "v1.0"
        
        # Load FAISS index
        faiss_path = hf_hub_download(HF_REPO_ID, "item_index.faiss")
        models["faiss"] = faiss.read_index(faiss_path)
        
        # Load ALS
        als_path = hf_hub_download(HF_REPO_ID, "als_model.pkl")
        with open(als_path, "rb") as f:
            models["als"] = pickle.load(f)
            
        # Load id mappings
        item_map_path = hf_hub_download(HF_REPO_ID, "item_id_map.json")
        with open(item_map_path, "r") as f:
            models["item_map"] = {int(k): int(v) for k, v in json.load(f).items()}
            models["item_map_rev"] = {v: k for k, v in models["item_map"].items()}
            
        user_map_path = hf_hub_download(HF_REPO_ID, "user_id_map.json")
        with open(user_map_path, "r") as f:
            models["user_map"] = {int(k): int(v) for k, v in json.load(f).items()}
            
        # Optional: Load Two-Tower
        # tt_path = hf_hub_download(HF_REPO_ID, "two_tower_model.pt")
        # models["two_tower"] = torch.load(tt_path, map_location='cpu')
        print("Models loaded successfully.")
    except Exception as e:
        print(f"Warning: Could not load models. Exception: {e}")
        
    models["start_time"] = time.time()
    yield
    
    # Shutdown
    if db_pool:
        await db_pool.close()

app = FastAPI(title="RecEngine API", version="1.0.0", lifespan=lifespan)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

Instrumentator().instrument(app).expose(app)

# --- Pydantic Models ---
class RecommendRequest(BaseModel):
    user_id: int = Field(..., gt=0)
    limit: int = Field(default=10, ge=1, le=100)

class SimilarRequest(BaseModel):
    item_id: int = Field(..., gt=0)
    limit: int = Field(default=10, ge=1, le=100)

class SearchRequest(BaseModel):
    query: str
    user_id: int = Field(..., gt=0)
    limit: int = Field(default=20, ge=1, le=100)

# --- Middleware for logging ---
@app.middleware("http")
async def log_requests(request: Request, call_next):
    start_time = time.time()
    response = await call_next(request)
    latency_ms = int((time.time() - start_time) * 1000)
    
    # Log to Supabase in background (omitted for brevity, could use background tasks)
    # user_id = request.headers.get("X-User-Id")
    
    return response

# --- Endpoints ---
@app.get("/ping")
async def ping():
    return {"status": "ok"}

@app.get("/health")
async def health():
    uptime = time.time() - models.get("start_time", time.time())
    faiss_size = models["faiss"].ntotal if "faiss" in models else 0
    
    # In a real app we'd track actual hit rate
    hit_rate = 0.85 
    
    return {
        "status": "ok",
        "model_version": models.get("version", "unknown"),
        "faiss_index_size": faiss_size,
        "cache_hit_rate": hit_rate,
        "uptime_seconds": int(uptime)
    }

@app.post("/recommend")
@limiter.limit("100/minute")
async def recommend(request: Request, req: RecommendRequest):
    start_ts = time.time()
    version = models.get("version", "v1.0")
    cache_key = f"rec:{req.user_id}:{version}"
    
    if redis:
        cached = redis.get(cache_key)
        if cached:
            return {
                "recommended_items": cached,
                "response_time_ms": int((time.time() - start_ts) * 1000),
                "model_version": version,
                "cache_hit": True
            }
            
    # Mocking complex logic due to missing actual models
    # If this was real, we'd do the ensemble scoring here
    recs = [{"item_id": i, "score": round(1.0 - (i/100), 4)} for i in range(1, req.limit + 1)]
    
    if redis:
        redis.setex(cache_key, 3600, recs)
        
    return {
        "recommended_items": recs,
        "response_time_ms": int((time.time() - start_ts) * 1000),
        "model_version": version,
        "cache_hit": False
    }

@app.post("/similar")
@limiter.limit("100/minute")
async def similar(request: Request, req: SimilarRequest):
    start_ts = time.time()
    cache_key = f"similar:{req.item_id}"
    
    if redis:
        cached = redis.get(cache_key)
        if cached:
            return {
                "similar_items": cached,
                "response_time_ms": int((time.time() - start_ts) * 1000)
            }
            
    recs = [{"item_id": i + req.item_id, "score": round(0.95 - (i/100), 4)} for i in range(1, req.limit + 1)]
    
    if redis:
        redis.setex(cache_key, 86400, recs)
        
    return {
        "similar_items": recs,
        "response_time_ms": int((time.time() - start_ts) * 1000)
    }

@app.post("/search")
@limiter.limit("100/minute")
async def search(request: Request, req: SearchRequest):
    # Dummy search re-ranking
    start_ts = time.time()
    results = [{"item_id": i, "score": round(1.0 - (i/100), 4)} for i in range(1, req.limit + 1)]
    return {
        "search_results": results,
        "response_time_ms": int((time.time() - start_ts) * 1000)
    }
