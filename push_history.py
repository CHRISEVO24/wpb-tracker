#!/usr/bin/env python3
"""
Runs after each scrape. Merges today scrape with repo history, pushes via API.
Retries on SHA conflict.
"""
import urllib.request, json, base64, os, sys, time

token = os.environ.get('GH_TOKEN')
repo  = os.environ.get('GITHUB_REPOSITORY', 'CHRISEVO24/wpb-tracker')

if not token:
    print("No GH_TOKEN - skipping push")
    sys.exit(0)

def api_req(url, method='GET', data=None, extra_headers=None):
    headers = {
        'Authorization': f'token {token}',
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'WPBTracker'
    }
    if extra_headers:
        headers.update(extra_headers)
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read()), r.status

# 1. Load today scrape from disk
with open('history.json', 'rb') as f:
    today_history = json.loads(f.read())
today_keys = list(today_history.keys())
print(f"Today scrape: {today_keys}")

# 2. Download existing repo history via raw URL with auth
existing = {}
try:
    req = urllib.request.Request(
        f'https://raw.githubusercontent.com/{repo}/main/history.json',
        headers={'Authorization': f'token {token}', 'Cache-Control': 'no-cache', 'Pragma': 'no-cache'}
    )
    with urllib.request.urlopen(req) as r:
        existing = json.loads(r.read())
    print(f"Existing: {len(existing)} snapshots, latest: {sorted(existing.keys())[-1]}")
except Exception as e:
    print(f"Could not load existing: {e}")

# 3. Merge and deduplicate
merged = {**existing, **today_history}
all_keys = sorted(merged.keys())
by_day = {}
for k in all_keys:
    day = k[:10]
    if day not in by_day or k > by_day[day]:
        by_day[day] = k
daily_keys = sorted(by_day.values())[-20:]
slim = {k: merged[k] for k in daily_keys}
slim_raw = json.dumps(slim).encode()

print(f"Pushing {len(slim)} snapshots, latest: {sorted(slim.keys())[-1]}")

# 4. Push with retry on SHA conflict
for attempt in range(3):
    try:
        # Get fresh SHA each attempt
        meta, _ = api_req(f'https://api.github.com/repos/{repo}/contents/history.json')
        file_sha = meta.get('sha', '')

        body = json.dumps({
            'message': 'Auto update history.json [skip ci]',
            'content': base64.b64encode(slim_raw).decode(),
            'sha': file_sha
        }).encode()

        result, status = api_req(
            f'https://api.github.com/repos/{repo}/contents/history.json',
            method='PUT',
            data=body,
            extra_headers={'Content-Type': 'application/json'}
        )
        if 'content' in result:
            new_sha = result['content']['sha'][:8]
            print(f"SUCCESS: {len(slim)} snapshots pushed (sha={new_sha})")
            sys.exit(0)
        else:
            print(f"Attempt {attempt+1} failed: {result.get('message')}")
            time.sleep(5)
    except Exception as e:
        print(f"Attempt {attempt+1} error: {e}")
        time.sleep(5)

print("All attempts failed")
sys.exit(1)
