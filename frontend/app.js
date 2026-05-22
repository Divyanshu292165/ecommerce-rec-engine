// ===== CONFIGURATION =====
// ⚠️ IMPORTANT: Replace this with your actual Render URL after deployment!
const API_BASE = "https://ecommerce-rec-engine.onrender.com";

// Product names for demo display
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

function getProductName(itemId) {
  const catIdx = itemId % PRODUCT_CATEGORIES.length;
  const brandIdx = itemId % BRANDS.length;
  return `${BRANDS[brandIdx]} ${PRODUCT_CATEGORIES[catIdx]}`;
}

// ===== NAVBAR SCROLL EFFECT =====
const navbar = document.getElementById("navbar");
window.addEventListener("scroll", () => {
  navbar.classList.toggle("scrolled", window.scrollY > 50);
});

// ===== API STATUS CHECK =====
async function checkApiStatus() {
  const dot = document.querySelector(".status-dot");
  const text = document.querySelector(".status-text");

  try {
    const res = await fetch(`${API_BASE}/ping`, { signal: AbortSignal.timeout(10000) });
    if (res.ok) {
      dot.classList.add("online");
      dot.classList.remove("offline");
      text.textContent = "API Online";
    } else {
      throw new Error("Not OK");
    }
  } catch {
    dot.classList.add("offline");
    dot.classList.remove("online");
    text.textContent = "API Offline";
  }
}

// ===== FETCH RECOMMENDATIONS =====
async function fetchRecommendations() {
  const btn = document.getElementById("btnRecommend");
  const results = document.getElementById("recResults");
  const userId = parseInt(document.getElementById("recUserId").value);
  const limit = parseInt(document.getElementById("recLimit").value);

  btn.classList.add("loading");

  try {
    const res = await fetch(`${API_BASE}/recommend`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, limit: limit }),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    results.innerHTML = buildResultsHTML(
      data.recommended_items,
      `${data.response_time_ms}ms`,
      data.model_version,
      data.cache_hit ? "HIT" : "MISS"
    );
  } catch (err) {
    results.innerHTML = buildErrorHTML(err.message);
  }

  btn.classList.remove("loading");
}

// ===== FETCH SIMILAR =====
async function fetchSimilar() {
  const btn = document.getElementById("btnSimilar");
  const results = document.getElementById("simResults");
  const itemId = parseInt(document.getElementById("simItemId").value);
  const limit = parseInt(document.getElementById("simLimit").value);

  btn.classList.add("loading");

  try {
    const res = await fetch(`${API_BASE}/similar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item_id: itemId, limit: limit }),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    results.innerHTML = buildResultsHTML(
      data.similar_items,
      `${data.response_time_ms}ms`,
      null,
      null
    );
  } catch (err) {
    results.innerHTML = buildErrorHTML(err.message);
  }

  btn.classList.remove("loading");
}

// ===== FETCH SEARCH =====
async function fetchSearch() {
  const btn = document.getElementById("btnSearch");
  const results = document.getElementById("searchResults");
  const query = document.getElementById("searchQuery").value;
  const userId = parseInt(document.getElementById("searchUserId").value);

  btn.classList.add("loading");

  try {
    const res = await fetch(`${API_BASE}/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: query, user_id: userId, limit: 20 }),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    results.innerHTML = buildResultsHTML(
      data.search_results,
      `${data.response_time_ms}ms`,
      null,
      null
    );
  } catch (err) {
    results.innerHTML = buildErrorHTML(err.message);
  }

  btn.classList.remove("loading");
}

// ===== FETCH HEALTH =====
async function fetchHealth() {
  try {
    const res = await fetch(`${API_BASE}/health`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    document.getElementById("healthStatus").textContent = data.status?.toUpperCase() || "OK";
    document.getElementById("healthModel").textContent = data.model_version || "—";
    document.getElementById("healthFaiss").textContent = data.faiss_index_size?.toLocaleString() || "—";
    document.getElementById("healthCache").textContent =
      data.cache_hit_rate ? `${(data.cache_hit_rate * 100).toFixed(1)}%` : "—";
    document.getElementById("healthUptime").textContent =
      data.uptime_seconds ? formatUptime(data.uptime_seconds) : "—";
    document.getElementById("healthEndpoint").textContent = API_BASE;
  } catch (err) {
    document.getElementById("healthStatus").textContent = "OFFLINE";
    document.getElementById("healthStatus").style.color = "var(--error)";
    document.getElementById("healthEndpoint").textContent = API_BASE;
  }
}

// ===== HELPER: Build Results HTML =====
function buildResultsHTML(items, latency, modelVersion, cacheStatus) {
  let metaHTML = `<span>Latency: <span>${latency}</span></span>`;
  if (modelVersion) metaHTML += ` · <span>Model: <span>${modelVersion}</span></span>`;
  if (cacheStatus) metaHTML += ` · <span>Cache: <span>${cacheStatus}</span></span>`;

  const headerHTML = `
    <div class="result-header">
      <div class="result-meta">${items.length} results returned</div>
      <div class="result-meta">${metaHTML}</div>
    </div>
  `;

  const listHTML = items
    .map((item, i) => {
      const score = item.score ?? 0;
      const pct = Math.max(5, Math.round(score * 100));
      const name = getProductName(item.item_id);
      return `
        <li class="result-item" style="animation: fadeInUp 0.3s ease-out ${i * 0.05}s both;">
          <div class="result-rank">${i + 1}</div>
          <div class="result-info">
            <div class="result-name">${name}</div>
            <div class="result-id">Item #${item.item_id}</div>
          </div>
          <div class="result-score-bar">
            <div class="result-score-value">${score.toFixed(4)}</div>
            <div class="score-track">
              <div class="score-fill" style="width: ${pct}%;"></div>
            </div>
          </div>
        </li>
      `;
    })
    .join("");

  return `${headerHTML}<ul class="result-list">${listHTML}</ul>`;
}

// ===== HELPER: Build Error HTML =====
function buildErrorHTML(message) {
  return `
    <div class="result-error">
      <span style="font-size: 32px;">⚠️</span>
      <strong>Could not reach the API</strong>
      <p>${message}. The Render free tier may be waking up — try again in 30 seconds.</p>
    </div>
  `;
}

// ===== HELPER: Format Uptime =====
function formatUptime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

// ===== INIT =====
document.addEventListener("DOMContentLoaded", () => {
  checkApiStatus();
  fetchHealth();

  // Update Swagger link
  const swaggerLink = document.getElementById("swaggerLink");
  if (swaggerLink) swaggerLink.href = `${API_BASE}/docs`;

  // Smooth scroll for anchor links
  document.querySelectorAll('a[href^="#"]').forEach((a) => {
    a.addEventListener("click", (e) => {
      const target = document.querySelector(a.getAttribute("href"));
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  });
});
