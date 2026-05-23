# -*- coding: utf-8 -*-
import os
import time
import json
import hashlib
import asyncio
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from contextlib import asynccontextmanager
import httpx

# ─── Environment Variables ─────────────────────────────────────────────────────
RAPIDAPI_KEY = os.getenv("RAPIDAPI_KEY", "")
UPSTASH_REDIS_REST_URL = os.getenv("UPSTASH_REDIS_REST_URL")
UPSTASH_REDIS_REST_TOKEN = os.getenv("UPSTASH_REDIS_REST_TOKEN")

# ─── Optional Redis for caching ───────────────────────────────────────────────
redis = None
if UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN:
    try:
        from upstash_redis.asyncio import Redis
        redis = Redis(url=UPSTASH_REDIS_REST_URL, token=UPSTASH_REDIS_REST_TOKEN)
    except Exception as e:
        print(f"Warning: Redis init failed: {e}")

# ─── Optional rate limiter ─────────────────────────────────────────────────────
try:
    from slowapi import Limiter, _rate_limit_exceeded_handler
    from slowapi.util import get_remote_address
    from slowapi.errors import RateLimitExceeded
    limiter = Limiter(key_func=get_remote_address)
    SLOWAPI_AVAILABLE = True
except Exception:
    limiter = None
    SLOWAPI_AVAILABLE = False

# ─── RapidAPI Amazon Data Config ──────────────────────────────────────────────
RAPIDAPI_HOST = "real-time-amazon-data.p.rapidapi.com"
RAPIDAPI_BASE = f"https://{RAPIDAPI_HOST}"

# USD → INR conversion rate (approximate)
USD_TO_INR = 83.5

# Trending electronics categories to fetch on homepage
TRENDING_QUERIES = [
    "trending smartphones 2024",
    "best laptops 2024",
    "wireless earbuds",
    "gaming accessories",
    "smart home devices",
]

DEMO_PRODUCTS = [
    {
        "asin": "DEMO-LAPTOP-1",
        "product_title": "Lenovo IdeaPad Slim 3 Intel Core i5 Laptop",
        "product_brand": "Lenovo",
        "product_price": "\u20b952,990",
        "product_original_price": "\u20b970,990",
        "product_photo": "https://m.media-amazon.com/images/I/61Dw5Z8LzJL._AC_UY327_FMwebp_QL65_.jpg",
        "product_url": "https://www.amazon.in/s?k=lenovo+ideapad+slim+3+i5",
        "product_star_rating": "4.2",
        "product_num_ratings": 1824,
        "is_prime": True,
        "product_badge": None,
    },
    {
        "asin": "DEMO-PHONE-1",
        "product_title": "Samsung Galaxy M Series 5G Smartphone",
        "product_brand": "Samsung",
        "product_price": "\u20b916,499",
        "product_original_price": "\u20b922,999",
        "product_photo": "https://m.media-amazon.com/images/I/81ZSn2rk9WL._AC_UY327_FMwebp_QL65_.jpg",
        "product_url": "https://www.amazon.in/s?k=samsung+galaxy+m+series+5g",
        "product_star_rating": "4.1",
        "product_num_ratings": 12643,
        "is_prime": True,
        "product_badge": None,
    },
    {
        "asin": "DEMO-EARBUDS-1",
        "product_title": "boAt Airdopes Wireless Earbuds with Fast Charging",
        "product_brand": "boAt",
        "product_price": "\u20b91,299",
        "product_original_price": "\u20b94,990",
        "product_photo": "https://m.media-amazon.com/images/I/61KNJav3S9L._AC_UY327_FMwebp_QL65_.jpg",
        "product_url": "https://www.amazon.in/s?k=boat+airdopes+wireless+earbuds",
        "product_star_rating": "4.0",
        "product_num_ratings": 85421,
        "is_prime": True,
        "product_badge": None,
    },
    {
        "asin": "DEMO-MOUSE-1",
        "product_title": "Logitech Wireless Mouse for Work and Gaming",
        "product_brand": "Logitech",
        "product_price": "\u20b9799",
        "product_original_price": "\u20b91,299",
        "product_photo": "https://m.media-amazon.com/images/I/61LtuGzXeaL._AC_UY327_FMwebp_QL65_.jpg",
        "product_url": "https://www.amazon.in/s?k=logitech+wireless+mouse",
        "product_star_rating": "4.4",
        "product_num_ratings": 31908,
        "is_prime": True,
        "product_badge": None,
    },
]


def get_demo_products(limit: int = 12) -> list:
    """Return demo products so the UI remains usable without RapidAPI credentials."""
    products = []
    while len(products) < limit:
        products.extend(DEMO_PRODUCTS)
    return [map_product(product) for product in products[:limit]]


def parse_price_to_inr(price_str: str) -> str:
    """Parse Amazon India price string — already in INR format like '₹14,999'."""
    if not price_str:
        return None
    return price_str.strip()


def _strip_inr(price_str: str) -> float:
    """Extract numeric value from an INR price string like '₹14,999' or '₹1,11,990'."""
    if not price_str:
        return 0.0
    cleaned = price_str.replace("\u20b9", "").replace("Rs", "").replace(",", "").strip()
    try:
        return float(cleaned)
    except Exception:
        return 0.0


def analyze_deal(product: dict) -> dict:

    """
    Analyze whether to Buy Now or Wait based on discount data.
    Returns a dict with: recommendation, badge, reason.
    Amazon India returns prices already in INR.
    """
    original_str = product.get("product_original_price") or ""
    current_str = product.get("product_price") or ""
    stars = product.get("product_star_rating")
    num_ratings = product.get("product_num_ratings") or 0

    orig_inr = _strip_inr(original_str)
    curr_inr = _strip_inr(current_str)

    discount_pct = 0
    savings = 0
    if orig_inr > 0 and curr_inr > 0 and orig_inr > curr_inr:
        discount_pct = round((orig_inr - curr_inr) / orig_inr * 100)
        savings = int(orig_inr - curr_inr)

    try:
        rating = float(stars) if stars else 0
    except Exception:
        rating = 0

    # Deal scoring logic
    if discount_pct >= 30:
        return {
            "recommendation": "\U0001f525 BUY NOW",
            "badge": "hot-deal",
            "reason": f"{discount_pct}% off \u2014 exceptional deal",
            "savings_inr": f"\u20b9{savings:,}" if savings > 0 else None,
        }
    elif discount_pct >= 15:
        return {
            "recommendation": "\u2705 GOOD DEAL",
            "badge": "good-deal",
            "reason": f"{discount_pct}% off \u2014 solid savings",
            "savings_inr": f"\u20b9{savings:,}" if savings > 0 else None,
        }
    elif discount_pct > 0 and discount_pct < 15:
        return {
            "recommendation": "\u23f3 WAIT",
            "badge": "wait",
            "reason": f"Only {discount_pct}% off \u2014 price may drop more",
            "savings_inr": None,
        }
    elif rating >= 4.5 and num_ratings > 1000:
        return {
            "recommendation": "\u2b50 TOP RATED",
            "badge": "top-rated",
            "reason": f"{rating}★ from {num_ratings:,} reviews",
            "savings_inr": None,
        }
    else:
        return {
            "recommendation": "🛒 CHECK PRICE",
            "badge": "neutral",
            "reason": "Compare prices before buying",
            "savings_inr": None,
        }


def map_product(p: dict) -> dict:
    """Map a RapidAPI Amazon product to our frontend schema."""
    price_inr = parse_price_to_inr(p.get("product_price"))
    original_inr = parse_price_to_inr(p.get("product_original_price"))
    deal = analyze_deal(p)

    return {
        "asin": p.get("asin") or "",
        "title": p.get("product_title", "Unknown Product"),
        "brand": p.get("product_brand") or "",
        "price": price_inr,
        "original_price": original_inr,
        "image": p.get("product_photo") or p.get("thumbnail"),
        "url": p.get("product_url") or p.get("product_link"),
        "rating": p.get("product_star_rating"),
        "num_ratings": p.get("product_num_ratings"),
        "deal": deal,
        "is_prime": p.get("is_prime", False),
        "badge": p.get("product_badge"),
    }


async def fetch_amazon_search(query: str, limit: int = 12) -> list:
    """Fetch products from RapidAPI Amazon search endpoint."""
    if not RAPIDAPI_KEY:
        return get_demo_products(limit)

    headers = {
        "X-RapidAPI-Key": RAPIDAPI_KEY,
        "X-RapidAPI-Host": RAPIDAPI_HOST,
    }
    params = {
        "query": query,
        "page": "1",
        "country": "IN",  # India — prices in INR natively
        "sort_by": "RELEVANCE",
        "product_condition": "ALL",
        "is_prime": "false",
    }

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(
                f"{RAPIDAPI_BASE}/search",
                headers=headers,
                params=params,
            )
            resp.raise_for_status()
            data = resp.json()
            products = data.get("data", {}).get("products", [])
            return [map_product(p) for p in products[:limit]]
    except Exception as e:
        print(f"RapidAPI search error for '{query}': {e}")
        return get_demo_products(limit)


# ─── Lifespan ─────────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    print("NeuralShop API starting up...")
    app.state.start_time = time.time()
    yield
    print("NeuralShop API shutting down.")


# ─── App Setup ────────────────────────────────────────────────────────────────
app = FastAPI(title="NeuralShop RecEngine API", version="2.0.0", lifespan=lifespan)

if SLOWAPI_AVAILABLE and limiter:
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

if os.path.isdir("frontend"):
    app.mount("/static", StaticFiles(directory="frontend", html=True))

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Optional Prometheus metrics
try:
    from prometheus_fastapi_instrumentator import Instrumentator
    Instrumentator().instrument(app).expose(app)
except Exception:
    pass


# ─── Pydantic Models ──────────────────────────────────────────────────────────
class SearchRequest(BaseModel):
    query: str
    limit: int = Field(default=12, ge=1, le=50)

class TrackProductRequest(BaseModel):
    asin: str
    title: str
    price: str | None = None
    original_price: str | None = None
    image: str | None = None
    url: str | None = None
    rating: str | None = None
    num_ratings: int | None = None


class RecommendRequest(BaseModel):
    limit: int = Field(default=12, ge=1, le=50)
    category: str = Field(default="trending electronics")


# ─── Endpoints ────────────────────────────────────────────────────────────────
@app.get("/ping")
async def ping():
    return {"status": "ok"}


@app.get("/", include_in_schema=False)
async def root():
    return RedirectResponse(url="/static/")


@app.get("/health")
async def health():
    uptime = time.time() - getattr(app.state, "start_time", time.time())
    return {
        "status": "ok",
        "version": "2.0.0",
        "rapidapi_configured": bool(RAPIDAPI_KEY),
        "uptime_seconds": int(uptime),
    }


@app.post("/search")
async def search(request: Request, req: SearchRequest):
    """Search Amazon for products matching the query."""
    start_ts = time.time()
    cache_key = f"search_v2:{hashlib.sha256(req.query.encode()).hexdigest()[:16]}"

    # Try Redis cache first
    if redis:
        try:
            cached = await redis.get(cache_key)
            if cached:
                return {
                    "results": json.loads(cached),
                    "query": req.query,
                    "response_time_ms": int((time.time() - start_ts) * 1000),
                    "source": "cache",
                }
        except Exception as e:
            print(f"Redis GET error: {e}")

    products = await fetch_amazon_search(req.query, req.limit)

    # Cache for 10 minutes
    if redis:
        try:
            await redis.set(cache_key, json.dumps(products), ex=600)
        except Exception as e:
            print(f"Redis SET error: {e}")

    return {
        "results": products,
        "query": req.query,
        "response_time_ms": int((time.time() - start_ts) * 1000),
        "source": "amazon",
    }


@app.post("/recommend")
async def recommend(request: Request, req: RecommendRequest):
    """Fetch trending/popular electronics from Amazon as homepage recommendations."""
    start_ts = time.time()
    cache_key = f"recommend_v2:{req.category[:30]}"

    if redis:
        try:
            cached = await redis.get(cache_key)
            if cached:
                return {
                    "results": json.loads(cached),
                    "response_time_ms": int((time.time() - start_ts) * 1000),
                    "source": "cache",
                }
        except Exception as e:
            print(f"Redis GET error: {e}")

    products = await fetch_amazon_search(req.category, req.limit)

    # Cache trending for 30 minutes
    if redis:
        try:
            await redis.set(cache_key, json.dumps(products), ex=1800)
        except Exception as e:
            print(f"Redis SET error: {e}")

    return {
        "results": products,
        "response_time_ms": int((time.time() - start_ts) * 1000),
        "source": "amazon",
    }


@app.post("/favorites/{user_id}")
async def add_favorite(user_id: str, product: TrackProductRequest):
    """Save a product to the user's favorites list in Redis."""
    if not redis:
        raise HTTPException(status_code=500, detail="Redis is not configured")
    
    key = f"favorites:{user_id}"
    try:
        await redis.hset(key, product.asin, product.model_dump_json())
        return {"status": "ok", "message": "Product saved"}
    except Exception as e:
        print(f"Redis error: {e}")
        raise HTTPException(status_code=500, detail="Failed to save product")


@app.get("/favorites/{user_id}")
async def get_favorites(user_id: str):
    """Get all saved products for a user."""
    if not redis:
        return {"results": []}
    
    key = f"favorites:{user_id}"
    try:
        favorites = await redis.hgetall(key)
        results = []
        for asin, prod_json in favorites.items():
            results.append(json.loads(prod_json))
        return {"results": results}
    except Exception as e:
        print(f"Redis error: {e}")
        return {"results": []}


@app.delete("/favorites/{user_id}/{asin}")
async def delete_favorite(user_id: str, asin: str):
    """Remove a saved product."""
    if not redis:
        raise HTTPException(status_code=500, detail="Redis is not configured")
    
    key = f"favorites:{user_id}"
    try:
        await redis.hdel(key, asin)
        return {"status": "ok"}
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to delete product")


@app.post("/favorites/{user_id}/refresh")
async def refresh_favorites(user_id: str):
    """Fetch live prices for tracked items and check for drops."""
    if not redis:
        raise HTTPException(status_code=500, detail="Redis not configured")
    
    key = f"favorites:{user_id}"
    favorites = await redis.hgetall(key)
    if not favorites:
        return {"results": [], "alerts": []}
    
    headers = {
        "X-RapidAPI-Key": RAPIDAPI_KEY,
        "X-RapidAPI-Host": RAPIDAPI_HOST,
    }
    
    updated_results = []
    alerts = []
    
    async with httpx.AsyncClient(timeout=15.0) as client:
        for asin, prod_json in favorites.items():
            prod = json.loads(prod_json)
            params = {"asin": asin, "country": "IN"}
            try:
                resp = await client.get(f"{RAPIDAPI_BASE}/product-details", headers=headers, params=params)
                if resp.status_code == 200:
                    data = resp.json().get("data", {})
                    new_price_str = data.get("product_price")
                    if new_price_str:
                        new_inr = parse_price_to_inr(new_price_str)
                        old_inr = prod.get("price")
                        
                        old_val = int("".join(filter(str.isdigit, str(old_inr)))) if old_inr else 0
                        new_val = int("".join(filter(str.isdigit, str(new_inr)))) if new_inr else 0
                        
                        if new_val > 0 and old_val > 0 and new_val < old_val:
                            alerts.append({
                                "asin": asin,
                                "title": prod.get("title"),
                                "old_price": old_inr,
                                "new_price": new_inr,
                                "drop": old_val - new_val
                            })
                            
                        prod["price"] = new_inr
                        await redis.hset(key, asin, json.dumps(prod))
                        
            except Exception as e:
                print(f"Error refreshing {asin}: {e}")
                
            updated_results.append(prod)
            await asyncio.sleep(0.5)
            
    return {"results": updated_results, "alerts": alerts}
