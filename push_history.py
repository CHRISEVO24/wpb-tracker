#!/usr/bin/env python3
import urllib.request, json, base64, os, sys, time

token = os.environ.get('GH_TOKEN')
repo  = os.environ.get('GITHUB_REPOSITORY', 'CHRISEVO24/wpb-tracker')

if not token:
    print("ERROR: No GH_TOKEN")
    sys.exit(1)

# Read history.json written by scraper
with open('history.json', 'rb') as f:
    raw = f.read()
history = json.loads(raw)
all_keys = sorted(history.keys())
print(f"Disk file: {len(all_keys)} snapshots")
for k in all_keys[-5:]:
    print(f"  {k}")

# Keep last 20 daily snapshots - LATEST per day wins
by_day = {}
for k in all_keys:
    day = k[:10]
    if day not in by_day or k > by_day[day]:
        by_day[day] = k
daily_keys = sorted(by_day.values())[-20:]
slim = {k: history[k] for k in daily_keys}
slim_raw = json.dumps(slim).encode()

print(f"After dedup: {len(slim)} snapshots, latest={sorted(slim.keys())[-1]}")
print(f"Size: {len(slim_raw)/1024/1024:.2f}MB")

# Get current file SHA and content hash to detect if push needed
req = urllib.request.Request(
    f'https://api.github.com/repos/{repo}/contents/history.json',
    headers={'Authorization': f'token {token}', 'Accept': 'application/vnd.github.v3+json'}
)
with urllib.request.urlopen(req) as r:
    meta = json.loads(r.read())
file_sha = meta.get('sha', '')
print(f"Current repo SHA: {file_sha[:8]}")

# Push
body = json.dumps({
    'message': 'Auto update history.json [skip ci]',
    'content': base64.b64encode(slim_raw).decode(),
    'sha': file_sha
}).encode()

for attempt in range(3):
    try:
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
            new_sha = result['content']['sha'][:8]
            if new_sha == file_sha[:8]:
                print(f"WARNING: SHA unchanged after push - content was identical")
            else:
                print(f"SUCCESS: new SHA={new_sha}, latest={sorted(slim.keys())[-1]}")
            sys.exit(0)
        else:
            print(f"Attempt {attempt+1} FAILED: {result.get('message','unknown')}")
            if attempt < 2:
                # Get fresh SHA and retry
                req3 = urllib.request.Request(
                    f'https://api.github.com/repos/{repo}/contents/history.json',
                    headers={'Authorization': f'token {token}', 'Accept': 'application/vnd.github.v3+json'}
                )
                with urllib.request.urlopen(req3) as r:
                    meta2 = json.loads(r.read())
                file_sha = meta2.get('sha', '')
                body = json.dumps({
                    'message': 'Auto update history.json [skip ci]',
                    'content': base64.b64encode(slim_raw).decode(),
                    'sha': file_sha
                }).encode()
                time.sleep(5)
    except Exception as e:
        print(f"Attempt {attempt+1} ERROR: {e}")
        time.sleep(5)

print("All attempts failed")
sys.exit(1)
