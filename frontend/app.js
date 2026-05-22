// ===== CONFIGURATION =====
const API_BASE = "https://ecommerce-rec-engine.onrender.com";
// Dummy user_id for backward compat with old Render build (ignored by new backend)
const DUMMY_USER_ID = Math.floor(Math.random() * 5000) + 1;

// ===== NAVBAR SCROLL EFFECT =====
const navbar = document.getElementById("navbar");
window.addEventListener("scroll", () => {
  navbar.classList.toggle("scrolled", window.scrollY > 50);
});

// ===== DEAL BADGE HELPER =====
function getDealBadgeHTML(deal) {
  if (!deal) return "";
  const badgeClass = `deal-badge deal-badge--${deal.badge}`;
  return `
    <div class="${badgeClass}">
      <span class="deal-label">${deal.recommendation}</span>
      <span class="deal-reason">${deal.reason}</span>
      ${deal.savings_inr ? `<span class="deal-savings">Save ${deal.savings_inr}</span>` : ""}
    </div>
  `;
}

// ===== RENDER PRODUCT GRID =====
function renderProductGrid(products) {
  const grid = document.getElementById("productGrid");

  if (!products || products.length === 0) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1">
        <div class="empty-icon">🔍</div>
        <p>No products found. Try a different search term.</p>
      </div>`;
    return;
  }

  const listHTML = products.map((p, i) => {
    const title = p.title || "Unknown Product";
    const brand = p.brand || "";
    const price = p.price || "Price not available";
    const originalPrice = p.original_price && p.original_price !== p.price
      ? `<span class="product-original-price">${p.original_price}</span>` : "";
    const image = p.image || `https://ui-avatars.com/api/?name=${encodeURIComponent(title.slice(0, 20))}&background=1a1a2e&color=a78bfa&size=400&font-size=0.2`;
    const url = p.url || `https://www.amazon.in/s?k=${encodeURIComponent(title)}`;
    const rating = p.rating ? `<span class="product-rating">⭐ ${p.rating}</span>` : "";
    const numRatings = p.num_ratings ? `<span class="product-num-ratings">(${Number(p.num_ratings).toLocaleString()})</span>` : "";
    const primeBadge = p.is_prime ? `<span class="prime-badge">prime</span>` : "";
    const dealHTML = getDealBadgeHTML(p.deal);

    return `
      <div class="product-card" style="animation: fadeInUp 0.4s ease-out ${i * 0.06}s both;">
        <div class="product-image-wrap">
          ${dealHTML}
          ${primeBadge}
          <img
            class="product-image"
            src="${image}"
            onerror="this.onerror=null; this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(title.slice(0,15))}&background=1a1a2e&color=a78bfa&size=400&font-size=0.2';"
            alt="${title}"
            loading="lazy"
          />
        </div>
        <div class="product-info">
          ${brand ? `<div class="product-brand">${brand}</div>` : ""}
          <div class="product-name" title="${title}">${title}</div>
          <div class="product-price-row">
            <div class="product-price">${price}</div>
            ${originalPrice}
          </div>
          ${rating || numRatings ? `<div class="product-meta">${rating} ${numRatings}</div>` : ""}
          <div class="product-actions">
            <a href="${url}" target="_blank" rel="noopener" class="btn-buy btn-amazon">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M20.9 14.5c-.1-.1-1.4-1.1-2.9-.6-1 .3-1.5.9-1.5.9s-.6-1.2-1.8-1.6c-1-.3-2.2 0-3.3.9-1.2.9-1.7 2.3-1.5 3.8.3 1.5 1.2 2.7 2.6 3.3 1.4.6 3.1.4 4.3-.5 1.2-.9 1.7-2.4 1.4-3.8h.1s.7.5 1.5.4c.8-.1 1.5-.6 1.7-1.4.1-.4-.1-.9-.6-1.4zm-6.3 4.8c-.5.4-1.3.6-2 .3-.7-.3-1.1-.9-1.3-1.6-.2-.7 0-1.5.5-2 .5-.5 1.2-.7 1.9-.5.7.2 1.2.7 1.4 1.4.2.7 0 1.5-.5 2.1v.3z"/></svg>
              Buy on Amazon
            </a>
          </div>
        </div>
      </div>
    `;
  }).join("");

  grid.innerHTML = listHTML;
}

// ===== SHOW ERROR =====
function showError(message) {
  const grid = document.getElementById("productGrid");
  grid.innerHTML = `
    <div class="error-state" style="grid-column:1/-1; text-align:center; padding:60px 20px;">
      <div style="font-size:3rem; margin-bottom:16px;">⚠️</div>
      <p style="color:#f87171; font-size:16px; margin-bottom:8px; font-weight:600">Something went wrong</p>
      <p style="color:#94a3b8; font-size:14px; margin-bottom:24px;">${message}</p>
      <button onclick="fetchRecommendations()" class="btn btn-primary" style="margin-top:0.5rem">Try Again</button>
    </div>`;
}

// ===== SAFE ERROR MESSAGE EXTRACTOR =====
async function getErrorMessage(res) {
  try {
    const data = await res.json();
    if (data && typeof data.detail === 'string') return data.detail;
    if (data && data.detail) return JSON.stringify(data.detail);
    return `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

// ===== FETCH RECOMMENDATIONS (Auto-Load) =====
async function fetchRecommendations() {
  const grid = document.getElementById("productGrid");
  const loading = document.getElementById("loadingState");
  const title = document.getElementById("storeTitle");
  const desc = document.getElementById("storeDesc");

  grid.style.display = "none";
  loading.style.display = "flex";

  title.textContent = "Trending Electronics";
  desc.textContent = "Live deals & top picks from Amazon — updated in real-time.";

  try {
    const res = await fetch(`${API_BASE}/recommend`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ limit: 12, category: "trending electronics India 2024", user_id: DUMMY_USER_ID }),
    });

    if (!res.ok) {
      const msg = await getErrorMessage(res);
      throw new Error(msg);
    }

    const data = await res.json();
    renderProductGrid(data.results);
  } catch (err) {
    const msg = err instanceof TypeError
      ? 'Network error — check your internet connection or the API may be down.'
      : (err.message || 'Unknown error');
    showError(msg);
  } finally {
    loading.style.display = "none";
    grid.style.display = "grid";
  }
}

// ===== FETCH SEARCH =====
async function fetchSearch() {
  const grid = document.getElementById("productGrid");
  const loading = document.getElementById("loadingState");
  const query = document.getElementById("searchInput").value.trim();
  const title = document.getElementById("storeTitle");
  const desc = document.getElementById("storeDesc");

  if (!query) {
    fetchRecommendations();
    return;
  }

  grid.style.display = "none";
  loading.style.display = "flex";

  title.textContent = `Results for "${query}"`;
  desc.textContent = "Live search results from Amazon with deal analysis.";

  try {
    const res = await fetch(`${API_BASE}/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: query, limit: 12, user_id: DUMMY_USER_ID }),
    });

    if (!res.ok) {
      const msg = await getErrorMessage(res);
      throw new Error(msg);
    }

    const data = await res.json();
    renderProductGrid(data.results);
  } catch (err) {
    const msg = err instanceof TypeError
      ? 'Network error — check your internet connection or the API may be down.'
      : (err.message || 'Unknown error');
    showError(msg);
  } finally {
    loading.style.display = "none";
    grid.style.display = "grid";
  }
}

// ===== SEARCH ON ENTER =====
document.getElementById("searchInput").addEventListener("keypress", (e) => {
  if (e.key === "Enter") fetchSearch();
});

// ===== CATEGORY QUICK SEARCH =====
function searchCategory(cat) {
  document.getElementById("searchInput").value = cat;
  fetchSearch();
}

// ===== INIT =====
document.addEventListener("DOMContentLoaded", () => {
  fetchRecommendations();
});
