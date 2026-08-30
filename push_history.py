#!/usr/bin/env python3
import urllib.request, json, base64, os, sys, time

token = os.environ.get('GH_TOKEN')
repo  = os.environ.get('GITHUB_REPOSITORY', 'CHRISEVO24/wpb-tracker')

if not token:
    print("No GH_TOKEN - skipping")
    sys.exit(0)

# Read history.json from disk (written by scraper with full history + new snapshot)
with open('history.json', 'rb') as f:
    history = json.loads(f.read())
all_keys = sorted(history.keys())
print(f"Disk: {len(all_keys)} snapshots, latest={all_keys[-1]}")

# Keep last 20 daily snapshots - latest per day wins
by_day = {}
for k in all_keys:
    day = k[:10]
    if day not in by_day or k > by_day[day]:
        by_day[day] = k
daily_keys = sorted(by_day.values())[-20:]
slim = {k: history[k] for k in daily_keys}
slim_raw = json.dumps(slim).encode()
slim_b64 = base64.b64encode(slim_raw).decode()
print(f"Pushing {len(slim)} snapshots, latest={sorted(slim.keys())[-1]}, {len(slim_raw)/1024/1024:.2f}MB")

# Push with up to 5 retries, always fetch fresh SHA
for attempt in range(5):
    try:
        # Always get fresh SHA
        req = urllib.request.Request(
            f'https://api.github.com/repos/{repo}/contents/history.json',
            headers={'Authorization': f'token {token}', 'Accept': 'application/vnd.github.v3+json'}
        )
        with urllib.request.urlopen(req) as r:
            meta = json.loads(r.read())
        file_sha = meta.get('sha', '')
        print(f"Attempt {attempt+1}: current SHA={file_sha[:8]}")

        body = json.dumps({
            'message': 'Auto update history.json [skip ci]',
            'content': slim_b64,
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
            new_sha = result['content']['sha']
            if new_sha == file_sha:
                print(f"Content identical - no change needed")
            else:
                print(f"SUCCESS: SHA {file_sha[:8]} -> {new_sha[:8]}, latest={sorted(slim.keys())[-1]}")
            sys.exit(0)
        else:
            msg = result.get('message','unknown')
            print(f"Attempt {attempt+1} failed: {msg}")
            time.sleep(3)
    except urllib.error.HTTPError as e:
        body_err = e.read().decode()
        print(f"Attempt {attempt+1} HTTP {e.code}: {body_err[:100]}")
        time.sleep(3)
    except Exception as e:
        print(f"Attempt {attempt+1} error: {e}")
        time.sleep(3)

print("All attempts done - exiting 0 to not fail the run")
sys.exit(0)
