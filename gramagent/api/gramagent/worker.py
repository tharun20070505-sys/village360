"""Durable queue with atomic claims and renewable leases; multiple worker processes supported."""
import time
import uuid
from datetime import datetime,timedelta,timezone
from threading import Event,Thread
from .store import store,now
from .workflow import execute

def deadline():return (datetime.now(timezone.utc)+timedelta(minutes=3)).isoformat()

def recover_expired():
    for run in store.all('runs',status='running'):
        if run.get('lease_until','')<now():
            store.claim('runs',run['id'],'running',{'status':'queued','worker_id':None},conditions={'lease_until':run.get('lease_until')})

def main():
    worker_id=str(uuid.uuid4())
    while True:
        recover_expired()
        runs=store.all('runs',status='queued')
        if not runs:time.sleep(1);continue
        for run in reversed(runs):
            claimed=store.claim('runs',run['id'],'queued',{'status':'running','worker_id':worker_id,'lease_until':deadline()})
            if not claimed:continue
            stop=Event()
            def renew():
                while not stop.wait(20):
                    if not store.claim('runs',run['id'],'running',{'lease_until':deadline()},conditions={'worker_id':worker_id}):return
            thread=Thread(target=renew,daemon=True);thread.start()
            try:execute(claimed)
            finally:stop.set();thread.join(timeout=1)

if __name__=='__main__':main()
