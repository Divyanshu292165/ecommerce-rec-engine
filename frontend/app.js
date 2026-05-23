// ===== CONFIGURATION =====
const API_BASE = window.location.origin.startsWith("http")
  ? (window.location.hostname.endsWith("vercel.app")
      ? "https://ecommerce-rec-engine.onrender.com"
      : window.location.origin)
  : "http://localhost:8000";
const DUMMY_USER_ID = Math.floor(Math.random() * 5000) + 1;

// ===== USER PROFILE =====
let USER_ID = localStorage.getItem("neuralshop_user_id");
if (!USER_ID) {
  USER_ID = "user_" + Math.random().toString(36).substr(2, 9);
  localStorage.setItem("neuralshop_user_id", USER_ID);
}

let favorites = {}; // asin -> product mapping
let currentProducts = []; // Array of products currently displayed in main store

// ===== NAVBAR SCROLL EFFECT =====
const navbar = document.getElementById("navbar");
window.addEventListener("scroll", () => {
  navbar.classList.toggle("scrolled", window.scrollY > 50);
});

// ===== NAVIGATION LOGIC =====
document.getElementById("navDiscover").addEventListener("click", (e) => {
  e.preventDefault();
  document.querySelectorAll(".nav-link").forEach(l => l.classList.remove("active"));
  e.currentTarget.classList.add("active");
  
  document.getElementById("hero").style.display = "flex";
  document.getElementById("store").style.display = "block";
  document.getElementById("favorites").style.display = "none";
});

document.getElementById("navStore").addEventListener("click", (e) => {
  e.preventDefault();
  document.querySelectorAll(".nav-link").forEach(l => l.classList.remove("active"));
  e.currentTarget.classList.add("active");
  
  document.getElementById("hero").style.display = "none";
  document.getElementById("store").style.display = "block";
  document.getElementById("favorites").style.display = "none";
});

document.getElementById("navFavorites").addEventListener("click", (e) => {
  e.preventDefault();
  document.querySelectorAll(".nav-link").forEach(l => l.classList.remove("active"));
  e.currentTarget.classList.add("active");
  
  document.getElementById("hero").style.display = "none";
  document.getElementById("store").style.display = "none";
  document.getElementById("favorites").style.display = "block";
  
  renderFavorites();
});

// ===== FAVORITES LOGIC =====
async function loadFavorites() {
  try {
    const res = await fetch(`${API_BASE}/favorites/${USER_ID}`);
    if (res.ok) {
      const data = await res.json();
      favorites = {};
      data.results.forEach(p => { 
        if(p.asin) favorites[p.asin] = p; 
      });
      updateFavCount();
    }
  } catch (err) {
    console.error("Failed to load favorites", err);
  }
}

function updateFavCount() {
  document.getElementById("favCount").textContent = Object.keys(favorites).length;
}

async function toggleFavorite(e, index, isFromFavPage = false) {
  e.preventDefault();
  e.stopPropagation();
  
  const btn = e.currentTarget;
  // If from favorites page, we pass the ASIN directly as index string
  let p = null;
  if (isFromFavPage) {
    p = favorites[index];
  } else {
    p = currentProducts[index];
  }
  
  if (!p) return;
  if (!p.asin) p.asin = btoa(p.title).slice(0, 15).replace(/[^a-zA-Z0-9]/g, ''); // Fallback ASIN

  const isTracked = !!favorites[p.asin];
  
  if (isTracked) {
    // Remove
    btn.classList.remove("tracked");
    btn.querySelector("svg").setAttribute("fill", "none");
    delete favorites[p.asin];
    updateFavCount();
    
    if (isFromFavPage) renderFavorites(); // Re-render if we removed it from fav page
    else renderProductGrid(currentProducts, false); // Re-render main grid lightly
    
    fetch(`${API_BASE}/favorites/${USER_ID}/${p.asin}`, { method: "DELETE" });
  } else {
    // Add
    btn.classList.add("tracked");
    btn.querySelector("svg").setAttribute("fill", "currentColor");
    favorites[p.asin] = p;
    updateFavCount();
    
    fetch(`${API_BASE}/favorites/${USER_ID}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        asin: p.asin,
        title: p.title,
        price: p.price || "",
        original_price: p.original_price || "",
        image: p.image || "",
        url: p.url || "",
        rating: String(p.rating || ""),
        num_ratings: p.num_ratings ? Number(p.num_ratings) : 0
      })
    });
  }
}

function renderFavorites() {
  const grid = document.getElementById("favoritesGrid");
  const products = Object.values(favorites);
  
  if (products.length === 0) {
    grid.innerHTML = `
      <div style="grid-column:1/-1; text-align:center; padding:40px; color:#94a3b8;">
        <h3 style="color:#f1f5f9; margin-bottom:8px;">No tracked items</h3>
        <p>Click the ❤️ icon on any product to track its price!</p>
      </div>`;
    return;
  }
  
  grid.innerHTML = products.map((p, i) => generateProductCardHTML(p, i, true)).join("");
}

async function refreshPrices() {
  const btn = document.getElementById("btnRefreshPrices");
  const alertsContainer = document.getElementById("alertsContainer");
  const loadingState = document.getElementById("favLoadingState");
  const grid = document.getElementById("favoritesGrid");
  
  btn.disabled = true;
  btn.innerHTML = `<div class="spinner" style="width:16px; height:16px; border-width:2px; margin-right:8px; border-top-color:#fff;"></div> Checking...`;
  grid.style.display = "none";
  loadingState.style.display = "flex";
  alertsContainer.innerHTML = "";
  
  try {
    const res = await fetch(`${API_BASE}/favorites/${USER_ID}/refresh`, { method: "POST" });
    if (res.ok) {
      const data = await res.json();
      
      // Update local favorites state
      data.results.forEach(p => {
        if(p.asin) favorites[p.asin] = p;
      });
      
      // Render alerts
      if (data.alerts && data.alerts.length > 0) {
        alertsContainer.innerHTML = data.alerts.map(a => `
          <div class="price-alert">
            <div class="price-alert-text">
              <strong>Price Drop Alert!</strong> 
              <br/>${a.title.slice(0, 60)}... dropped by <strong>₹${a.drop.toLocaleString()}</strong>!
            </div>
            <div style="text-align:right;">
              <span style="text-decoration:line-through; font-size:0.8rem; color:#94a3b8;">${a.old_price}</span>
              <br/>
              <strong style="color:#22c55e; font-size:1.2rem;">${a.new_price}</strong>
            </div>
          </div>
        `).join("");
      } else {
        alertsContainer.innerHTML = `
          <div style="padding:12px; background:rgba(255,255,255,0.05); border-radius:8px; color:#94a3b8; text-align:center;">
            No price drops detected at this time.
          </div>`;
      }
    }
  } catch (err) {
    console.error("Refresh failed", err);
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:8px;"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.92-10.26l3.08 2.69"/></svg> Refresh Prices`;
    loadingState.style.display = "none";
    grid.style.display = "grid";
    renderFavorites();
  }
}


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

// ===== CARD GENERATOR =====
function generateProductCardHTML(p, index, isFromFavPage = false) {
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
  
  const pAsin = p.asin || btoa(p.title).slice(0,15).replace(/[^a-zA-Z0-9]/g, '');
  const isTracked = !!favorites[pAsin];
  
  // Use ASIN string if fav page, else array index
  const trackArg = isFromFavPage ? `'${pAsin}'` : index;
  
  const trackBtn = `
    <button class="track-btn ${isTracked ? 'tracked' : ''}" onclick="toggleFavorite(event, ${trackArg}, ${isFromFavPage})" title="Track Price">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="${isTracked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
    </button>`;

  return `
    <div class="product-card" style="animation: fadeInUp 0.4s ease-out ${index * 0.06}s both;">
      <div class="product-image-wrap">
        ${trackBtn}
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
}

// ===== RENDER PRODUCT GRID =====
function renderProductGrid(products, saveToCurrent = true) {
  if (saveToCurrent) currentProducts = products;
  const grid = document.getElementById("productGrid");
  grid.innerHTML = "";

  if (!products || products.length === 0) {
    grid.innerHTML = `
      <div style="grid-column:1/-1; text-align:center; padding:40px; color:#94a3b8;">
        <h3 style="color:#f1f5f9; margin-bottom:8px;">No products found</h3>
        <p>Try searching for a different term.</p>
      </div>`;
    return;
  }

  grid.innerHTML = products.map((p, i) => generateProductCardHTML(p, i, false)).join("");
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
      body: JSON.stringify({ limit: 12, category: "trending electronics", user_id: DUMMY_USER_ID }),
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
  // Start product load immediately — don't wait for favorites
  fetchRecommendations();
  // Load favorites in background (doesn't block the main spinner)
  loadFavorites().catch(err => console.warn("Favorites load failed:", err));
});
