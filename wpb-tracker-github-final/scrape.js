#!/usr/bin/env node
/**
 * WPB Watch Co — Inventory Scraper v11
 *
 * Attributes are built with Elementor (not a WooCommerce table).
 * Structure per field:
 *   <h3 class="elementor-heading-title">Reference Number:</h3>
 *   ... (sibling container) ...
 *   <span class="elementor-post-info__item--type-custom"> 126710BLRO </span>
 *
 * First run : scrapes every product page (slow, one-time)
 * Future runs: only scrapes NEW products — everything else from cache
 *
 * Usage:  node scrape.js
 */

const https = require("https");
const fs    = require("fs");
const path  = require("path");

const HISTORY_FILE = path.join(__dirname, "history.json");
const CACHE_FILE   = path.join(__dirname, "attribute-cache.json");
const SITE_URL     = "https://wpbwatchco.com";
const CONCURRENCY  = 5;
const DELAY_MS     = 150;

// ── HTTP ──────────────────────────────────────────────────────────────────────

function fetchRaw(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { "User-Agent": "WPBTracker/1.0" } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location)
        return fetchRaw(res.headers.location).then(resolve).catch(reject);
      // Collect raw binary chunks then decode as UTF-8
      const chunks = [];
      res.on("data", c => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
      res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    });
    req.on("error", reject);
    req.setTimeout(20000, () => { req.destroy(); reject(new Error("Timeout: " + url)); });
  });
}

function fetchJsonWithHeaders(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { "User-Agent": "WPBTracker/1.0" } }, (res) => {
      let d = ""; res.on("data", c => d += c);
      res.on("end", () => {
        try { resolve({ json: JSON.parse(d), headers: res.headers }); }
        catch (e) { reject(new Error(`Parse error: ${e.message}`)); }
      });
    });
    req.on("error", reject);
    req.setTimeout(20000, () => { req.destroy(); reject(new Error("Timeout")); });
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Attribute parser — Elementor layout ──────────────────────────────────────
//
// Each spec row in Elementor looks like this:
//
//   <h3 class="elementor-heading-title ...">Reference Number:</h3>
//   </div></div></div>                          ← label container closes
//   <div ...>                                   ← value container opens
//     <span class="...elementor-post-info__item--type-custom">
//       126710BLRO
//     </span>
//
// Strategy: find every elementor-heading-title that ends with ":",
// then grab the next elementor-post-info__item--type-custom span after it.

function parseElementorAttributes(html) {
  const attrs = {};

  const labelRegex = /class="elementor-heading-title[^"]*">([^<]+):<\/h3>/g;
  let labelMatch;
  while ((labelMatch = labelRegex.exec(html)) !== null) {
    const label   = labelMatch[1].trim();
    const labelEnd = labelMatch.index + labelMatch[0].length;
    const chunk   = html.slice(labelEnd, labelEnd + 2000);
    const valueMatch = chunk.match(
      /class="[^"]*elementor-post-info__item--type-custom[^"]*">\s*([\s\S]*?)\s*<\/span>/
    );
    if (valueMatch) {
      const value = stripHtml(valueMatch[1]).trim();
      if (value) attrs[label] = value;
    }
  }
  return attrs;
}

// ── Full description extractor ────────────────────────────────────────────────
// Tries three sources in order of preference:
//   1. og:description meta tag (always present, full text)
//   2. WooCommerce .woocommerce-product-details__short-description div
//   3. .entry-content / .elementor-widget-text-editor div
//   4. Falls back to API short_description / description

function parseFullDescription(html) {
  // PRIMARY: Elementor WooCommerce product content widget
  // This contains the full description as multiple <p> tags
  // Structure: <div class="...elementor-widget-woocommerce-product-content...">
  //              <div class="elementor-widget-container">
  //                <p>First paragraph...</p>
  //                <p>Second paragraph...</p>
  //              </div>
  //            </div>
  const wooContentMatch = html.match(
    /elementor-widget-woocommerce-product-content[^>]*>[\s\S]*?<div[^>]*elementor-widget-container[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/i
  );
  if (wooContentMatch) {
    // Extract all <p> blocks and join them with newlines
    const inner = wooContentMatch[1];
    const paragraphs = [];
    const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
    let pm;
    while ((pm = pRegex.exec(inner)) !== null) {
      const text = decodeHtmlEntities(stripHtml(pm[1])).trim();
      if (text.length > 0) paragraphs.push(text);
    }
    if (paragraphs.length > 0) {
      return paragraphs.join("\n\n");
    }
  }

  // FALLBACK 1: Collect all meaningful <p> tags from the page
  // (excludes nav/footer junk by filtering for length 80-2000)
  const allP = [...html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
    .map(m => decodeHtmlEntities(stripHtml(m[1])).trim())
    .filter(t => t.length >= 80 && t.length <= 2000
      && !t.includes("Shopping Cart")
      && !t.includes("561-220-9107")
      && !t.includes("Subscribe Email")
    );
  if (allP.length > 0) {
    return allP.join("\n\n");
  }

  // FALLBACK 2: og:description (short tagline — last resort)
  const ogMatch = html.match(/property=["']og:description["'][^>]*content=["]([\s\S]*?)["]\s*\/?>/i)
    || html.match(/content=["]([\s\S]*?)["]\s+property=["']og:description["']/i);
  if (ogMatch && ogMatch[1]) {
    return decodeHtmlEntities(ogMatch[1].trim());
  }

  return "";
}

function decodeHtmlEntities(str) {
  return str
    .replace(/&#039;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#8220;|&ldquo;/g, "\u201c")
    .replace(/&#8221;|&rdquo;/g, "\u201d")
    .replace(/&#8216;|&lsquo;/g, "\u2018")
    .replace(/&#8217;|&rsquo;/g, "\u2019")
    .replace(/&#8211;|&ndash;/g, "\u2013")
    .replace(/&#8212;|&mdash;/g, "\u2014")
    .replace(/&nbsp;/g, " ")
    .replace(/&#[0-9]+;/g, "")
    .replace(/&[a-zA-Z]+;/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function stripHtml(html = "") {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&").replace(/&nbsp;/g, " ")
    .replace(/&#8220;/g, "\u201c").replace(/&#8221;/g, "\u201d")
    .replace(/&#[0-9]+;/g, "").replace(/&[a-zA-Z]+;/g, "")
    .replace(/\s+/g, " ").trim();
}

// ── Price ─────────────────────────────────────────────────────────────────────
// currency_minor_unit=0 on this site — price is already whole dollars

function formatPrice(prices) {
  if (!prices?.price) return "N/A";
  const minorUnit = typeof prices.currency_minor_unit === "number" ? prices.currency_minor_unit : 0;
  const raw = parseInt(prices.price, 10);
  if (isNaN(raw)) return "N/A";
  const dollars = raw / Math.pow(10, minorUnit);
  return "$" + dollars.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

// ── Build product record ──────────────────────────────────────────────────────

function buildProduct(api, attrs) {
  // history.json stores LEAN fields only — just what's needed for dashboard display,
  // comparison, price tracking, and filtering. This keeps history.json small.
  // Full description, movement, case etc. stay in attribute-cache.json only.
  return {
    id:              api.id,
    name:            stripHtml(api.name),
    price:           formatPrice(api.prices),
    url:             api.permalink || `${SITE_URL}/?p=${api.id}`,
    categories:      (api.categories || []).map(c => c.name).join(", "),
    inStock:         !!api.is_in_stock,
    referenceNumber: attrs["Reference Number"] || "",
    productCode:     attrs["Product Code"]     || "",
    stockStatus:     attrs["Stock Status"]     || (api.is_in_stock ? "In Stock" : "Out of Stock"),
    brand:           attrs["Brand"]            || (api.attributes || []).find(a => a.name === "Brand")?.terms?.[0]?.name || "",
    year:            attrs["Year"]             || "",
    box:             attrs["Box"]              || "",
    papers:          attrs["Papers"]           || "",
    // Short description only (first 120 chars) — full version is in attribute-cache.json
    description:     (attrs._fullDescription || stripHtml(api.short_description || api.description || "")).slice(0, 120),
  };
}

// Full product record for FB export — reads rich data from cache
function buildFullProduct(api, attrs) {
  return {
    ...buildProduct(api, attrs),
    description:  attrs._fullDescription || stripHtml(api.short_description || api.description || ""),
    model:        attrs["Model"]     || "",
    caseMat:      attrs["Case"]      || "",
    bracelet:     attrs["Bracelet"]  || "",
    dial:         attrs["Dial"]      || "",
    bezel:        attrs["Bezel"]     || "",
    movement:     attrs["Movement"]  || "",
  };
}

// ── Store API ─────────────────────────────────────────────────────────────────

async function fetchAllProducts() {
  const all = [];
  let page = 1, totalPages = 1;
  process.stdout.write("  Fetching product list");
  while (page <= totalPages) {
    const { json, headers } = await fetchJsonWithHeaders(
      `${SITE_URL}/wp-json/wc/store/v1/products?per_page=100&page=${page}`
    );
    if (!Array.isArray(json)) throw new Error("Unexpected API response");
    all.push(...json);
    totalPages = parseInt(headers["x-wp-totalpages"] || "1", 10);
    process.stdout.write(" .");
    page++;
  }
  console.log(` done (${all.length} products)\n`);
  return all;
}

// ── Batch runner ──────────────────────────────────────────────────────────────

async function processInBatches(items, size, fn) {
  const results = [];
  for (let i = 0; i < items.length; i += size) {
    const batch = items.slice(i, i + size);
    results.push(...await Promise.all(batch.map(fn)));
    if (i + size < items.length) await sleep(DELAY_MS);
  }
  return results;
}

// ── Cache & History I/O ───────────────────────────────────────────────────────

function loadCache()   { try { return JSON.parse(fs.readFileSync(CACHE_FILE,   "utf8")); } catch { return {}; } }
function loadHistory() { try { return JSON.parse(fs.readFileSync(HISTORY_FILE, "utf8")); } catch { return {}; } }
function saveCache(c)  { fs.writeFileSync(CACHE_FILE,   JSON.stringify(c, null, 2)); }
function saveHistory(h){ fs.writeFileSync(HISTORY_FILE, JSON.stringify(h)); } // no pretty-print = ~40% smaller

// ── Keep only last 30 days of snapshots ───────────────────────────────────────
function trimHistory(history) {
  const cutoff    = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  const cutoffStr = cutoff.toISOString().slice(0, 10); // "YYYY-MM-DD"
  const before    = Object.keys(history).length;
  const trimmed   = {};

  for (const key of Object.keys(history)) {
    // Keys are "YYYY-MM-DD HH:MM" — first 10 chars are the date
    if (key.slice(0, 10) >= cutoffStr) {
      trimmed[key] = history[key];
    }
  }

  const removed = before - Object.keys(trimmed).length;
  if (removed > 0) {
    console.log(`  🗑️  Trimmed ${removed} snapshot${removed > 1 ? "s" : ""} older than 30 days`);
  }
  return trimmed;
}

function nowKey() {
  return new Date().toLocaleString("sv-SE", {
    timeZone: "America/New_York",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  }).replace("T", " ").slice(0, 16);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const key     = nowKey();
  const cache   = loadCache();
  const history = loadHistory();
  const cached  = Object.keys(cache).length;

  console.log(`\nWPB Watch Co — Inventory Snapshot`);
  console.log(`Timestamp : ${key} ET`);
  console.log(`Cache     : ${cached} products already stored\n`);

  // Step 1 — product list
  let apiProducts;
  try { apiProducts = await fetchAllProducts(); }
  catch (e) { console.error("❌ API failed:", e.message); process.exit(1); }

  const inStock   = apiProducts.filter(p => p.is_in_stock);
  // A product needs scraping if: not in cache, OR cached but description is missing/short
  const needsScraping = inStock.filter(p =>
    cache[p.id] === undefined ||
    !cache[p.id]._fullDescription ||
    cache[p.id]._fullDescription.length < 80
  );
  const fromCache = inStock.filter(p =>
    cache[p.id] !== undefined &&
    cache[p.id]._fullDescription &&
    cache[p.id]._fullDescription.length >= 80
  );

  console.log(`  In-stock total         : ${inStock.length}`);
  console.log(`  From cache (fast)      : ${fromCache.length}`);
  console.log(`  Need scraping (new/fix): ${needsScraping.length}`);

  if (needsScraping.length > 0) {
    const estSecs = Math.ceil((needsScraping.length / CONCURRENCY) * (DELAY_MS / 1000 + 0.4));
    console.log(`  Est. time for scraping : ~${estSecs}s\n`);

    let done = 0;
    process.stdout.write(`  Scraping pages [0/${needsScraping.length}]`);

    await processInBatches(needsScraping, CONCURRENCY, async (p) => {
      try {
        const html   = await fetchRaw(p.permalink);
        const attrs  = parseElementorAttributes(html);
        attrs._fullDescription = parseFullDescription(html);
        cache[p.id]  = attrs;
      } catch {
        cache[p.id] = cache[p.id] || {};
      }
      done++;
      process.stdout.write(`\r  Scraping pages [${done}/${needsScraping.length}]`);
    });

    console.log(`\n`);
    saveCache(cache);
    console.log(`  Cache saved: ${Object.keys(cache).length} total products\n`);
  } else {
    console.log(`\n  ✅ All products cached with full descriptions — snapshot is instant!\n`);
  }

  // Step 2 — build snapshot
  const snapshot = {};
  for (const p of inStock) {
    snapshot[p.id] = buildProduct(p, cache[p.id] || {});
  }

  history[key] = snapshot;
  const trimmed = trimHistory(history); // remove snapshots older than 30 days
  saveHistory(trimmed);

  // Summary
  const vals    = Object.values(snapshot);
  const withRef  = vals.filter(p => p.referenceNumber).length;
  const withCode = vals.filter(p => p.productCode).length;

  console.log(`✅ Snapshot saved — ${key} ET`);
  console.log(`   Products : ${vals.length}`);
  console.log(`   Snapshots on file : ${Object.keys(trimmed).length} (last 30 days)`);
  console.log(`\n   Attribute capture:`);
  console.log(`   Reference Number : ${withRef}/${vals.length}`);
  console.log(`   Product Code     : ${withCode}/${vals.length}`);
  console.log(`\n   Sample (first 3):`);
  vals.slice(0, 3).forEach(p => {
    console.log(`   ┌ ${p.name.slice(0, 55)}`);
    console.log(`   │ Reference Number : ${p.referenceNumber || "(blank on site)"}`);
    console.log(`   │ Product Code     : ${p.productCode    || "(blank on site)"}`);
    console.log(`   └ Stock Status     : ${p.stockStatus}`);
  });

  console.log(`\n→ Open dashboard.html and load history.json to explore.\n`);
}

main().catch(e => { console.error("\nFatal:", e.message); process.exit(1); });
