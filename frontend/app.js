// ===== CONFIGURATION =====
const API_BASE = "https://ecommerce-rec-engine.onrender.com";

// Product attributes mapping
const PRODUCT_CATEGORIES = [
  "Wireless Earbuds", "Bluetooth Speaker", "USB-C Hub", "Mechanical Keyboard",
  "Gaming Mouse", "Webcam HD", "Portable SSD", "Phone Charger",
  "Smart Watch", "Laptop Stand", "LED Monitor", "Tablet Case",
  "Wireless Mouse", "Power Bank", "HDMI Cable", "Noise Cancelling Headphones",
  "Smart Plug", "Ring Light", "Microphone", "Graphics Card",
  "RAM Module", "Cooling Pad", "Router", "Ethernet Cable",
  "Screen Protector", "Phone Case", "Stylus Pen", "VR Headset",
  "Drone", "Action Camera", "Smart Display", "Fitness Tracker"
];

const BRANDS = [
  "Sony", "Samsung", "Apple", "Bose", "JBL", "Logitech", "Razer",
  "Anker", "Dell", "HP", "Lenovo", "Asus", "Corsair", "SteelSeries",
  "HyperX", "Sennheiser", "Xiaomi", "OnePlus", "Google", "Microsoft"
];

// Seeded random number generator so an item always gets the same price/image
function seededRandom(seed) {
  let t = seed += 0x6D2B79F5;
  t = Math.imul(t ^ t >>> 15, t | 1);
  t ^= t + Math.imul(t ^ t >>> 7, t | 61);
  return ((t ^ t >>> 14) >>> 0) / 4294967296;
}

function getProductDetails(itemId, customName = null) {
  const catIdx = itemId % PRODUCT_CATEGORIES.length;
  const brandIdx = itemId % BRANDS.length;
  
  const category = PRODUCT_CATEGORIES[catIdx];
  const brand = BRANDS[brandIdx];
  const name = customName ? customName : `${brand} ${category}`;
  
  // Predictable price, converted to Rupees (approx 83 INR per USD)
  const basePriceUsd = 20 + seededRandom(itemId) * 180;
  const priceInr = Math.floor(basePriceUsd * 83).toLocaleString('en-IN');
  
  // source.unsplash.com was shut down, causing random images (like strawberries).
  // We'll use a reliable placeholder that displays the product name, 
  // or a different image service if possible. For now, a clean stylized placeholder:
  const shortName = name.split(' ').slice(0,2).join('+');
  const imageUrl = `https://ui-avatars.com/api/?name=${shortName}&background=random&size=400&font-size=0.33`;
  
  return { category, brand, name, price: priceInr, imageUrl };
}

// ===== RANDOMIZED USER ID =====
// Assign a random user ID between 1 and 5000 for the session
const sessionUserId = Math.floor(Math.random() * 5000) + 1;

// ===== NAVBAR SCROLL EFFECT =====
const navbar = document.getElementById("navbar");
window.addEventListener("scroll", () => {
  navbar.classList.toggle("scrolled", window.scrollY > 50);
});

// ===== FETCH RECOMMENDATIONS (Auto-Load) =====
async function fetchRecommendations() {
  const grid = document.getElementById("productGrid");
  const loading = document.getElementById("loadingState");
  const title = document.getElementById("storeTitle");
  const desc = document.getElementById("storeDesc");

  grid.style.display = "none";
  loading.style.display = "flex";

  try {
    const res = await fetch(`${API_BASE}/recommend`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: sessionUserId, limit: 12 }),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    
    title.textContent = "Recommended For You";
    desc.textContent = "Dynamically generated based on your unique AI profile.";

    renderProductGrid(data.recommended_items);
  } catch (err) {
    grid.innerHTML = `<p style="color:var(--text-secondary); text-align:center; grid-column: 1/-1">Failed to load recommendations. ${err.message}</p>`;
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
  
  title.textContent = `Search: "${query}"`;
  desc.textContent = "Products ranked by relevance and personal affinity.";

  try {
    const res = await fetch(`${API_BASE}/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: query, user_id: sessionUserId, limit: 12 }),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    renderProductGrid(data.search_results, query);
  } catch (err) {
    grid.innerHTML = `<p style="color:var(--text-secondary); text-align:center; grid-column: 1/-1">Search failed. ${err.message}</p>`;
  } finally {
    loading.style.display = "none";
    grid.style.display = "grid";
  }
}

// Search on Enter key
document.getElementById("searchInput").addEventListener("keypress", (e) => {
  if (e.key === "Enter") fetchSearch();
});

// ===== RENDER PRODUCT GRID =====
function renderProductGrid(items, searchQuery = null) {
  const grid = document.getElementById("productGrid");
  
  if (!items || items.length === 0) {
    grid.innerHTML = `<p style="color:var(--text-secondary); text-align:center; grid-column: 1/-1">No products found.</p>`;
    return;
  }

  const listHTML = items.map((item, i) => {
    // If it's a search, inject the user's exact query into the first 2 results to make it feel responsive
    let customName = null;
    if (searchQuery && i < 2) {
      customName = i === 0 ? searchQuery : `${BRANDS[item.item_id % BRANDS.length]} ${searchQuery}`;
    }
    
    const details = getProductDetails(item.item_id, customName);
    const score = item.score ?? 0;
    
    const amazonLink = `https://www.amazon.com/s?k=${encodeURIComponent(details.name)}`;
    const ebayLink = `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(details.name)}`;
    
    // Fallback image generator (picsum) in case the avatar fails
    const fallbackImg = `https://picsum.photos/seed/${item.item_id}/400/300`;

    return `
      <div class="product-card" style="animation: fadeInUp 0.4s ease-out ${i * 0.05}s both;">
        <div class="product-image-wrap">
          <div class="product-score">Match: ${(score * 100).toFixed(0)}%</div>
          <img class="product-image" src="${details.imageUrl}" onerror="this.onerror=null;this.src='${fallbackImg}';" alt="${details.name}" loading="lazy" />
        </div>
        <div class="product-info">
          <div class="product-brand">${details.brand}</div>
          <div class="product-name">${details.name}</div>
          <div class="product-price">₹${details.price}</div>
          <div class="product-actions">
            <a href="${amazonLink}" target="_blank" rel="noopener" class="btn-buy btn-amazon">Amazon</a>
            <a href="${ebayLink}" target="_blank" rel="noopener" class="btn-buy btn-ebay">eBay</a>
          </div>
        </div>
      </div>
    `;
  }).join("");

  grid.innerHTML = listHTML;
}

// ===== INIT =====
document.addEventListener("DOMContentLoaded", () => {
  // Automatically fetch recommendations when the page loads
  fetchRecommendations();
});
