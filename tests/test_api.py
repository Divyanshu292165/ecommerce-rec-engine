import pytest
from httpx import ASGITransport, AsyncClient
from api.main import app

@pytest.mark.asyncio
async def test_health():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        response = await ac.get("/health")
    assert response.status_code == 200
    assert "status" in response.json()
    assert response.json()["status"] == "ok"

@pytest.mark.asyncio
async def test_ping():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        response = await ac.get("/ping")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"

@pytest.mark.asyncio
async def test_recommend():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        response = await ac.post("/recommend", json={"limit": 5})
    
    assert response.status_code == 200
    data = response.json()
    assert "results" in data
    assert isinstance(data["results"], list)
    assert len(data["results"]) == 5

@pytest.mark.asyncio
async def test_search():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        response = await ac.post("/search", json={"query": "wireless earbuds", "limit": 3})
    
    assert response.status_code == 200
    data = response.json()
    assert data["query"] == "wireless earbuds"
    assert "results" in data
    assert len(data["results"]) == 3
