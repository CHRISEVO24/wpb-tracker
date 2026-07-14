[SETUP.md](https://github.com/user-attachments/files/30027349/SETUP.md)
# WPB Inventory Tracker — Complete Setup Guide
## iPhone + Mac, fully automatic, no manual steps after setup

---

## What you'll need
- A free GitHub account
- Your existing Netlify site
- About 30 minutes

---

## STEP 1 — Create a GitHub Account
1. Go to **github.com**
2. Click **Sign up** (top right)
3. Enter your email, create a password, choose a username
4. Verify your email address

---

## STEP 2 — Create a Private Repository
1. Once logged in, click the **+** button (top right) → **New repository**
2. Repository name: `wpb-tracker`
3. Set to **Private**
4. Leave everything else unchecked
5. Click **Create repository**

---

## STEP 3 — Upload Your Files to GitHub
1. On the repo page, click **uploading an existing file**
2. From your iCloud `wpb-tracker` folder, drag these files into the GitHub upload area:
   - `scrape.js` ← use the NEW one from this ZIP
   - `package.json`
   - `attribute-cache.json`
   - `dashboard.html` ← use the NEW one from this ZIP
   - `fetch-history.js` ← NEW file from this ZIP
   - `netlify.toml` ← NEW file from this ZIP
   - `.gitignore` ← NEW file from this ZIP

   ⚠️ Do NOT upload `history.json` — it's excluded by `.gitignore`

3. Scroll down, click **Commit changes**

---

## STEP 4 — Upload the .github Folder (Workflow File)
GitHub's web uploader doesn't show hidden folders well. Do this instead:

1. On your repo page, click **Add file** → **Create new file**
2. In the filename box type exactly:
   `.github/workflows/daily-scrape.yml`
3. Open the `daily-scrape.yml` file from this ZIP in TextEdit
4. Copy everything and paste it into the GitHub editor
5. Click **Commit new file**

---

## STEP 5 — Create a GitHub Personal Access Token
This lets Netlify and the workflow authenticate with GitHub.

1. Go to **github.com** → click your profile photo (top right) → **Settings**
2. Scroll all the way down → click **Developer settings** (bottom left)
3. Click **Personal access tokens** → **Tokens (classic)**
4. Click **Generate new token** → **Generate new token (classic)**
5. Note: `WPB Tracker`
6. Expiration: **No expiration**
7. Check these boxes:
   - ✅ `repo` (top level — checks all sub-boxes automatically)
8. Click **Generate token**
9. **Copy the token immediately** — you won't see it again
   (looks like: `ghp_xxxxxxxxxxxxxxxxxxxx`)

---

## STEP 6 — Add Secrets to GitHub
1. Go to your `wpb-tracker` repo on GitHub
2. Click **Settings** (top menu) → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Add this secret:
   - Name: `GITHUB_TOKEN` is automatic — no need to add it
   - (GitHub provides GITHUB_TOKEN automatically to all workflows)

---

## STEP 7 — Connect Netlify to GitHub
1. Go to **netlify.com** → Log in
2. Click **Add new site** → **Import an existing project**
3. Click **GitHub** → authorize Netlify to access your account
4. Select your `wpb-tracker` repository
5. Build settings:
   - Build command: `node fetch-history.js`  ← Netlify fills this from netlify.toml
   - Publish directory: `.`  ← also from netlify.toml
6. Click **Deploy site**
7. Wait about 60 seconds — Netlify deploys your dashboard

You'll get a URL like `https://wpb-tracker-abc123.netlify.app`

---

## STEP 8 — Add Environment Variables to Netlify
These let `fetch-history.js` download `history.json` from GitHub Releases.

1. In Netlify → your site → **Site configuration** → **Environment variables**
2. Click **Add a variable** and add these two:

   | Key | Value |
   |-----|-------|
   | `GITHUB_TOKEN` | the token you copied in Step 5 |
   | `GITHUB_REPO` | `YOUR_GITHUB_USERNAME/wpb-tracker` |

   (Replace `YOUR_GITHUB_USERNAME` with your actual GitHub username)

3. Click **Save**
4. Go to **Deploys** → click **Trigger deploy** → **Deploy site**
   (This redeploys with the new environment variables)

---

## STEP 9 — Get the Netlify Build Hook
This lets GitHub Actions trigger a Netlify redeploy after each scrape.

1. In Netlify → your site → **Site configuration** → **Build & deploy**
2. Scroll down to **Build hooks**
3. Click **Add build hook**
4. Name: `GitHub Actions`
5. Branch: `main`
6. Click **Save**
7. Copy the hook URL (looks like: `https://api.netlify.com/build_hooks/xxxxxxxxxx`)

---

## STEP 10 — Add Netlify Hook to GitHub Secrets
1. Go to your `wpb-tracker` repo on GitHub
2. **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Name: `NETLIFY_BUILD_HOOK`
5. Value: paste the hook URL from Step 9
6. Click **Add secret**

---

## STEP 11 — Run the First Scrape Manually
1. Go to your `wpb-tracker` repo on GitHub
2. Click the **Actions** tab
3. Click **WPB Daily Inventory Scrape** (left sidebar)
4. Click **Run workflow** → **Run workflow** (green button)
5. Watch it run — takes 3–5 minutes on first run
6. When it shows a green ✅ checkmark, the scrape is done

---

## STEP 12 — Open on Your iPhone
1. Open **Safari** on your iPhone
2. Go to your Netlify URL (e.g. `https://wpb-tracker-abc123.netlify.app`)
3. The dashboard loads with your full inventory automatically
4. Tap the **Share button** → **Add to Home Screen** → **Add**

It now lives on your iPhone home screen like an app.

---

## How it works every day after setup

```
5:00 AM & 9:00 AM EST (automatic)
         ↓
GitHub Actions runs scrape.js
         ↓
Downloads latest history.json from GitHub Releases
         ↓
Runs the scraper, adds new snapshot
         ↓
Uploads updated history.json to GitHub Releases
         ↓
Triggers Netlify to redeploy
         ↓
Netlify runs fetch-history.js → downloads latest history.json
         ↓
Dashboard at your Netlify URL shows fresh data
         ↓
Open on iPhone, Mac, iPad — always current
```

**You do nothing. It just works.**

---

## Manual scrape anytime
GitHub repo → **Actions** tab → **WPB Daily Inventory Scrape** → **Run workflow**

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| GitHub Actions fails | Actions tab → click the failed run → read the error |
| Netlify shows old data | Netlify → Deploys → Trigger deploy manually |
| Dashboard shows loading spinner forever | Check Netlify env variables are set (Step 8) |
| attribute-cache.json not updating | Check GitHub Actions completed successfully |
