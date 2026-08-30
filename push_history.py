#!/usr/bin/env python3
"""
Reads history.json written by scraper (full merged history),
keeps last 20 daily snapshots, pushes to repo via API.
"""
import urllib.request, json, base64, os, sys, time

token = os.environ.get('GH_TOKEN')
repo  = os.environ.get('GITHUB_REPOSITORY', 'CHRISEVO24/wpb-tracker')

if not token:
    print("No GH_TOKEN - skipping")
    sys.exit(0)

# Read history from disk (written by scraper with full history + new snapshot)
with open('history.json', 'rb') as f:
    history = json.loads(f.read())

print(f"History from scraper: {len(history)} snapshots")

# Keep last 20 daily snapshots (1 per day, latest run wins)
all_keys = sorted(history.keys())
by_day = {}
for k in all_keys:
    day = k[:10]
    if day not in by_day or k > by_day[day]:
        by_day[day] = k
daily_keys = sorted(by_day.values())[-20:]
slim = {k: history[k] for k in daily_keys}
slim_raw = json.dumps(slim).encode()

print(f"Pushing {len(slim)} snapshots ({len(slim_raw)/1024/1024:.1f}MB)")
print(f"Latest: {sorted(slim.keys())[-1]}")

# Push with retry on conflict
for attempt in range(3):
    try:
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
            headers={'Authorization': f'token {token}', 'Content-Type': 'application/json', 'Accept': 'application/vnd.github.v3+json'}
        )
        with urllib.request.urlopen(req2) as r:
            result = json.loads(r.read())

        if 'content' in result:
            print(f"SUCCESS: pushed sha={result['content']['sha'][:8]}")
            sys.exit(0)
        else:
            print(f"Attempt {attempt+1}: {result.get('message')}")
            time.sleep(5)
    except Exception as e:
        print(f"Attempt {attempt+1} error: {e}")
        time.sleep(5)

print("All attempts failed")
sys.exit(1)
