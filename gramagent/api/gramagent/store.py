import json
import sqlite3
import uuid
from datetime import datetime, timezone
from threading import RLock
from .config import settings

def now():
    return datetime.now(timezone.utc).isoformat()

class Store:
    def __init__(self):
        self.lock = RLock()
        self.client = None
        if settings.mongo_uri:
            from pymongo import MongoClient
            self.client = MongoClient(settings.mongo_uri, serverSelectionTimeoutMS=5000)
            self.db = self.client[settings.mongo_database]
        else:
            self.conn = sqlite3.connect(settings.data_dir / 'records.sqlite', check_same_thread=False)
            self.conn.execute('PRAGMA journal_mode=WAL')
            self.conn.execute('CREATE TABLE IF NOT EXISTS docs (collection TEXT, id TEXT, body TEXT, PRIMARY KEY(collection,id))')
            self.conn.commit()

    def put(self, collection, doc):
        doc = {**doc}
        doc.setdefault('id', str(uuid.uuid4()))
        doc.setdefault('created_at', now())
        doc['updated_at'] = now()
        with self.lock:
            if self.client:
                self.db[collection].replace_one({'_id': doc['id']}, {**doc, '_id': doc['id']}, upsert=True)
            else:
                self.conn.execute('INSERT OR REPLACE INTO docs VALUES(?,?,?)', (collection, doc['id'], json.dumps(doc)))
                self.conn.commit()
        return doc

    def get(self, collection, identifier):
        with self.lock:
            if self.client:
                return self.db[collection].find_one({'_id': identifier}, {'_id': 0})
            row = self.conn.execute('SELECT body FROM docs WHERE collection=? AND id=?', (collection, identifier)).fetchone()
        return json.loads(row[0]) if row else None

    def all(self, collection, **filters):
        with self.lock:
            if self.client:
                return list(self.db[collection].find(filters, {'_id': 0}).sort('created_at', -1).limit(10000))
            rows = self.conn.execute('SELECT body FROM docs WHERE collection=?', (collection,)).fetchall()
        docs = [json.loads(r[0]) for r in rows]
        return sorted([d for d in docs if all(d.get(k) == v for k,v in filters.items())], key=lambda d:d.get('created_at',''), reverse=True)

    def claim(self, collection, identifier, expected_status, changes, conditions=None):
        with self.lock:
            if self.client:
                from pymongo import ReturnDocument
                return self.db[collection].find_one_and_update({'_id':identifier, 'status':expected_status, **(conditions or {})}, {'$set':{**changes,'updated_at':now()}}, return_document=ReturnDocument.AFTER, projection={'_id':0})
            self.conn.execute('BEGIN IMMEDIATE')
            try:
                row = self.conn.execute('SELECT body FROM docs WHERE collection=? AND id=?',(collection,identifier)).fetchone()
                doc = json.loads(row[0]) if row else None
                if not doc or doc.get('status') != expected_status or any(doc.get(k)!=v for k,v in (conditions or {}).items()):
                    self.conn.rollback(); return None
                doc.update(changes); doc['updated_at'] = now()
                self.conn.execute('UPDATE docs SET body=? WHERE collection=? AND id=?',(json.dumps(doc),collection,identifier))
                self.conn.commit(); return doc
            except Exception:
                self.conn.rollback(); raise

    def delete(self, collection, identifier):
        with self.lock:
            if self.client: self.db[collection].delete_one({'_id':identifier})
            else:
                self.conn.execute('DELETE FROM docs WHERE collection=? AND id=?',(collection,identifier)); self.conn.commit()

store = Store()

def audit(actor, action, resource, **details):
    return store.put('audit', {'actor':actor['id'], 'organisation_id':actor['organisation_id'], 'action':action, 'resource':resource, 'details':details})
