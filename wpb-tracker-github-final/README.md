# WPB Watch Co — Inventory Tracker (GitHub + Netlify)

## How it works

1. GitHub Actions runs `scrape.js` every day at 5am EST
2. The updated `history.json` is committed back to this repo automatically
3. Netlify detects the change and redeploys the dashboard within ~30 seconds
4. Open your Netlify URL on any device — always live, always current

---

## One-time setup

### Connect Netlify to GitHub (do this once)

1. Go to **netlify.com** → Log in → **Add new site** → **Import from Git**
2. Connect your GitHub account → select this repo (`wpb-tracker`)
3. Build settings: leave everything blank (no build command needed)
4. Publish directory: leave blank (serves from root)
5. Click **Deploy site**

Netlify gives you a URL like `https://wpb-tracker.netlify.app`.
Every time GitHub Actions commits a new `history.json`, Netlify redeploys automatically.

---

## Manual scrape trigger

Go to your GitHub repo → **Actions** tab → **WPB Daily Inventory Scrape** → **Run workflow**

---

## Files

| File | Purpose |
|------|---------|
| `dashboard.html` | The live dashboard (auto-loads history.json) |
| `scrape.js` | Inventory scraper |
| `package.json` | Node.js config |
| `attribute-cache.json` | Cached product attributes (speeds up scraping) |
| `history.json` | Auto-updated daily by GitHub Actions |
| `.github/workflows/daily-scrape.yml` | The scheduler |
| `netlify.toml` | Netlify routing config |
