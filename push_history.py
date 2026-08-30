#!/usr/bin/env python3
"""
Runs after each scrape. Merges today scrape (history.json on disk)
with existing repo history, keeps last 20 daily snapshots, pushes via API.
"""
import urllib.request, json, base64, os, sys

token = os.environ.get('GH_TOKEN')
repo  = os.environ.get('GITHUB_REPOSITORY', 'CHRISEVO24/wpb-tracker')

if not token:
    print("No GH_TOKEN - skipping push")
    sys.exit(0)

# 1. Load today's scrape from disk
with open('history.json', 'rb') as f:
    today_history = json.loads(f.read())
print(f"Today scrape: {len(today_history)} snapshot(s) — {list(today_history.keys())}")

# 2. Download existing history from repo via raw URL with auth (bypasses CDN)
existing = {}
try:
    req = urllib.request.Request(
        f'https://raw.githubusercontent.com/{repo}/main/history.json',
        headers={
            'Authorization': f'token {token}',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
        }
    )
    with urllib.request.urlopen(req) as r:
        existing = json.loads(r.read())
    print(f"Existing repo history: {len(existing)} snapshots")
except Exception as e:
    print(f"Could not load existing history (will start fresh): {e}")

# 3. Merge: existing + today (today overwrites same-timestamp keys)
merged = {**existing, **today_history}

# 4. Keep 1 snapshot per day (last run of the day), max 20 days
all_keys = sorted(merged.keys())
by_day = {}
for k in all_keys:
    day = k[:10]
    if day not in by_day or k > by_day[day]:
        by_day[day] = k
daily_keys = sorted(by_day.values())[-20:]
slim = {k: merged[k] for k in daily_keys}
slim_raw = json.dumps(slim).encode()

print(f"Pushing {len(slim)} snapshots ({len(slim_raw)/1024/1024:.1f}MB):")
for k in sorted(slim.keys()):
    print(f"  {k}: {len(slim[k])} items")

# 5. Get current SHA
req2 = urllib.request.Request(
    f'https://api.github.com/repos/{repo}/contents/history.json',
    headers={'Authorization': f'token {token}', 'Accept': 'application/vnd.github.v3+json'}
)
with urllib.request.urlopen(req2) as r:
    file_sha = json.loads(r.read()).get('sha', '')

# 6. Push via API
body = json.dumps({
    'message': 'Auto update history.json [skip ci]',
    'content': base64.b64encode(slim_raw).decode(),
    'sha': file_sha
}).encode()

req3 = urllib.request.Request(
    f'https://api.github.com/repos/{repo}/contents/history.json',
    data=body, method='PUT',
    headers={
        'Authorization': f'token {token}',
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.github.v3+json'
    }
)
with urllib.request.urlopen(req3) as r:
    result = json.loads(r.read())
    if 'content' in result:
        print(f"SUCCESS: {len(slim)} snapshots in repo")
    else:
        print(f"FAILED: {result.get('message')}")
        sys.exit(1)
