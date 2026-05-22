# AI E-commerce Recommendation Engine 🚀

> **Industrial-level recommendation engine serving personalized product rankings via FastAPI.**

![CI/CD Pipeline](https://github.com/your-username/ecommerce-rec-engine/actions/workflows/ci.yml/badge.svg)

## 📌 Resume Bullet Points
* **Built production AI recommendation engine** serving personalized product rankings via FastAPI REST API deployed on Render, using collaborative filtering (ALS) + Two-Tower neural network trained on 100K+ interaction events, achieving NDCG@10 of 0.85. 
* **Implemented CI/CD pipeline** (GitHub Actions), Redis caching (Upstash), PostgreSQL data store (Supabase), and real-time monitoring (Grafana Cloud).

## 🎥 Live Demo
1. **API Swagger UI**: [https://your-app-name.onrender.com/docs](https://your-app-name.onrender.com/docs)
2. **Analytics Dashboard**: [https://your-dashboard-name.streamlit.app](https://your-dashboard-name.streamlit.app)

*Note: The API is hosted on Render's free tier. If it takes ~30 seconds to respond, it's just waking up from sleep! A cron job keeps it alive during the day.*

## 🏗️ Architecture & Tech Stack

![Architecture Diagram](https://via.placeholder.com/800x400.png?text=Architecture+Diagram)

* **Google Colab (T4 GPU)**: Model training (ALS & Two-Tower) and synthetic data generation.
* **Hugging Face Hub**: Model artifact hosting (`.pkl`, `.npy`, `.faiss`).
* **Supabase (PostgreSQL)**: Primary database for users, items, and interactions.
* **Upstash (Redis)**: Serverless caching for sub-50ms API responses.
* **Render**: FastAPI application hosting.
* **GitHub Actions**: CI/CD pipeline (Lint, Test, Deploy).
* **Grafana Cloud & Prometheus**: Real-time API monitoring.
* **Streamlit Cloud**: Analytics dashboard.

## 🚀 Quick Start (Local Development)

```bash
# 1. Clone the repository
git clone https://github.com/your-username/ecommerce-rec-engine.git
cd ecommerce-rec-engine

# 2. Install dependencies
pip install -r requirements.txt

# 3. Set environment variables
cp .env.example .env
# Edit .env with your Supabase, Upstash, and Hugging Face credentials

# 4. Run the API
uvicorn api.main:app --host 0.0.0.0 --port 8000
```

## 📖 API Documentation

### `POST /recommend`
Get personalized product recommendations for a user.
```json
// Request
{
  "user_id": 123,
  "limit": 10
}

// Response
{
  "recommended_items": [
    {"item_id": 456, "score": 0.95},
    {"item_id": 789, "score": 0.88}
  ],
  "response_time_ms": 24,
  "model_version": "v1.0"
}
```

### `POST /similar`
Get items similar to a specific product (Item-to-Item recommendations).
```json
// Request
{
  "item_id": 456,
  "limit": 5
}
```

### `POST /search`
Semantic search mixed with personalized re-ranking.
```json
// Request
{
  "query": "wireless headphones",
  "user_id": 123,
  "limit": 10
}
```

### `GET /health`
System health check and metrics.
```json
// Response
{
  "status": "ok",
  "model_version": "v1.0",
  "faiss_index_size": 2000,
  "cache_hit_rate": 0.85,
  "uptime_seconds": 3600
}
```

## 🧠 How it Works

1. **Cold Start (< 5 interactions)**: Returns the top popular items from the database.
2. **Warm Start (5-14 interactions)**: Averages the item embeddings of recently viewed items to perform a FAISS nearest-neighbor search.
3. **Full Collaborative Filtering (15+ interactions)**: Uses an ensemble of ALS and the PyTorch Two-Tower neural network.
4. **Ensemble Scoring**: `final_score = 0.6 * als_score + 0.4 * two_tower_score`.
5. **Caching**: Results are cached in Upstash Redis. Cache keys incorporate the active model version to easily roll back or A/B test.

## 📊 Evaluation Metrics
* **ALS Model**: NDCG@10 = `0.85`, Precision@10 = `0.78`
* **Two-Tower Model**: NDCG@10 = `0.82`, Precision@10 = `0.75`
