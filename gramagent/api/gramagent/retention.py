"""Explicit maintenance command. Preview by default; --apply removes old transient staged imports and sessions only."""
import argparse
from datetime import datetime,timedelta,timezone
from .config import settings
from .store import store

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--apply',action='store_true');args=parser.parse_args()
    cutoff=(datetime.now(timezone.utc)-timedelta(days=settings.retention_days)).isoformat()
    for collection in ['import_reviews','login_sessions']:
        candidates=[d for d in store.all(collection) if d['created_at']<cutoff]
        print(collection,len(candidates),'records eligible')
        if args.apply:
            for d in candidates:store.delete(collection,d['id'])
    print('Baseline evidence, decisions and audit logs are retained; their deletion requires an agreed archival policy.')
if __name__=='__main__':main()
