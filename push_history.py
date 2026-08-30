#!/usr/bin/env python3
"""Merges today's scrape into repo history.json and pushes via API."""
import urllib.request, json, base64, os, sys

token = os.environ.get('GH_TOKEN')
repo  = os.environ.get('GITHUB_REPOSITORY', 'CHRISEVO24/wpb-tracker')

if not token:
    print("No GH_TOKEN - skipping push")
    sys.exit(0)

# Step 1: Load today's scrape from disk
with open('history.json', 'rb') as f:
    today_raw = f.read()
today_history = json.loads(today_raw)
print(f"Today scrape has {len(today_history)} snapshot(s): {list(today_history.keys())}")

# Step 2: Download existing history from repo (authoritative, not CDN cached)
existing_history = {}
try:
    req = urllib.request.Request(
        f'https://raw.githubusercontent.com/{repo}/main/history.json',
        headers={'Authorization': f'token {token}', 'Cache-Control': 'no-cache', 'Pragma': 'no-cache'}
    )
    with urllib.request.urlopen(req) as r:
        existing_history = json.loads(r.read())
    print(f"Existing repo history has {len(existing_history)} snapshots")
except Exception as e:
    print(f"Could not load existing history: {e}")

# Step 3: Merge - existing + today
merged = {**existing_history, **today_history}

# Step 4: Keep last 20 daily snapshots (1 per day, latest run wins)
all_keys = sorted(merged.keys())
by_day = {}
for k in all_keys:
    day = k[:10]
    if day not in by_day or k > by_day[day]:
        by_day[day] = k
daily_keys = sorted(by_day.values())[-20:]
slim = {k: merged[k] for k in daily_keys}
slim_raw = json.dumps(slim).encode()
print(f"Pushing {len(slim)} snapshots ({len(slim_raw)/1024/1024:.1f}MB)...")
for k in sorted(slim.keys()):
    print(f"  {k}")

# Step 5: Get current SHA
req2 = urllib.request.Request(
    f'https://api.github.com/repos/{repo}/contents/history.json',
    headers={'Authorization': f'token {token}', 'Accept': 'application/vnd.github.v3+json'}
)
with urllib.request.urlopen(req2) as r:
    file_sha = json.loads(r.read()).get('sha', '')

# Step 6: Push
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
        print(f"SUCCESS: {len(slim)} snapshots pushed to repo")
    else:
        print(f"FAILED: {result.get('message')}")
        sys.exit(1)
