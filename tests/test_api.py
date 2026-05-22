import pytest
from httpx import AsyncClient
from api.main import app

@pytest.mark.asyncio
async def test_health():
    async with AsyncClient(app=app, base_url="http://test") as ac:
        response = await ac.get("/health")
    assert response.status_code == 200
    assert "status" in response.json()
    assert response.json()["status"] == "ok"

@pytest.mark.asyncio
async def test_ping():
    async with AsyncClient(app=app, base_url="http://test") as ac:
        response = await ac.get("/ping")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"

@pytest.mark.asyncio
async def test_recommend():
    async with AsyncClient(app=app, base_url="http://test") as ac:
        response = await ac.post("/recommend", json={"user_id": 123, "limit": 5})
    
    assert response.status_code == 200
    data = response.json()
    assert "recommended_items" in data
    assert isinstance(data["recommended_items"], list)
    assert len(data["recommended_items"]) == 5

@pytest.mark.asyncio
async def test_similar():
    async with AsyncClient(app=app, base_url="http://test") as ac:
        response = await ac.post("/similar", json={"item_id": 456, "limit": 3})
    
    assert response.status_code == 200
    data = response.json()
    assert "similar_items" in data
    assert len(data["similar_items"]) == 3
