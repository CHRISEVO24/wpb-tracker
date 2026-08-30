#!/usr/bin/env python3
"""Pushes history.json to GitHub repo via API after each scrape."""
import urllib.request, json, base64, os, sys

token = os.environ.get('GH_TOKEN')
repo  = os.environ.get('GITHUB_REPOSITORY', 'CHRISEVO24/wpb-tracker')

if not token:
    print("No GH_TOKEN - skipping push")
    sys.exit(0)

with open('history.json', 'rb') as f:
    raw = f.read()

history = json.loads(raw)
all_keys = sorted(history.keys())

# Keep last 20 daily snapshots (1 per day)
by_day = {}
for k in all_keys:
    by_day[k[:10]] = k
daily_keys = sorted(by_day.values())[-20:]
slim = {k: history[k] for k in daily_keys}
slim_raw = json.dumps(slim).encode()
print(f"Pushing {len(slim)} snapshots ({len(slim_raw)/1024/1024:.1f}MB)...")

# Get current SHA
req = urllib.request.Request(
    f'https://api.github.com/repos/{repo}/contents/history.json',
    headers={'Authorization': f'token {token}', 'Accept': 'application/vnd.github.v3+json'}
)
with urllib.request.urlopen(req) as r:
    file_sha = json.loads(r.read()).get('sha', '')

body = json.dumps({
    'message': 'Auto update history.json [skip ci]',
    'content': base64.b64encode(slim_raw).decode(),
    'sha': file_sha
}).encode()

req2 = urllib.request.Request(
    f'https://api.github.com/repos/{repo}/contents/history.json',
    data=body, method='PUT',
    headers={
        'Authorization': f'token {token}',
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.github.v3+json'
    }
)
with urllib.request.urlopen(req2) as r:
    result = json.loads(r.read())
    if 'content' in result:
        print(f"SUCCESS: {len(slim)} snapshots pushed to repo")
    else:
        print(f"FAILED: {result.get('message')}")
        sys.exit(1)
