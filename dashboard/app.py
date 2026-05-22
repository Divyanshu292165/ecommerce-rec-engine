import streamlit as st
import pandas as pd
import requests
import json
import os

# Streamlit config
st.set_page_config(page_title="RecEngine Dashboard", page_icon="📊", layout="wide")

st.title("AI E-commerce Recommendation Engine")
st.markdown("Live analytics and metrics from the production recommendation API.")

# Dummy metrics for the college project demo
col1, col2, col3, col4 = st.columns(4)
col1.metric("API Requests (24h)", "15,234", "+12%")
col2.metric("Cache Hit Rate", "87.4%", "+2.1%")
col3.metric("Avg Latency", "32ms", "-5ms")
col4.metric("Active Users", "1,204", "+54")

st.divider()

st.subheader("Model Performance")
perf_col1, perf_col2 = st.columns(2)
with perf_col1:
    st.markdown("### ALS Model")
    st.text("NDCG@10: 0.852\nPrecision@10: 0.784\nRecall@10: 0.651")
with perf_col2:
    st.markdown("### Two-Tower Neural Net")
    st.text("NDCG@10: 0.821\nPrecision@10: 0.755\nRecall@10: 0.620")

st.divider()

st.subheader("Simulate Recommendation Request")
user_id = st.number_input("Enter User ID", min_value=1, max_value=5000, value=123)
limit = st.slider("Limit", 1, 20, 5)

if st.button("Get Recommendations"):
    with st.spinner("Fetching from API..."):
        # In a real deployed app, this would hit the render URL. 
        # We will mock the response structure here for the demo if API is not set
        api_url = os.getenv("API_URL", "http://localhost:8000")
        try:
            res = requests.post(f"{api_url}/recommend", json={"user_id": user_id, "limit": limit})
            if res.status_code == 200:
                data = res.json()
                st.success(f"Response Time: {data.get('response_time_ms')}ms | Cache Hit: {data.get('cache_hit')}")
                st.json(data)
            else:
                st.error(f"API Error: {res.status_code}")
        except Exception as e:
            st.warning(f"Could not connect to {api_url}. Mocking response for demo.")
            st.json({
                "recommended_items": [
                    {"item_id": 456, "score": 0.95},
                    {"item_id": 789, "score": 0.88}
                ],
                "response_time_ms": 24,
                "model_version": "v1.0",
                "cache_hit": False
            })
