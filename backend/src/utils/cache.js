// High-performance in-memory TTL cache with tag-based invalidation
class Cache {
  constructor() {
    this.store = new Map();
    this.tags = new Map(); // tag -> Set of keys
    this.hits = 0;
    this.misses = 0;
  }

  get(key) {
    const entry = this.store.get(key);
    if (!entry) {
      this.misses++;
      return null;
    }
    if (Date.now() > entry.expiresAt) {
      this.delete(key);
      this.misses++;
      return null;
    }
    this.hits++;
    return entry.value;
  }

  set(key, value, ttlSeconds = 60, tag = null) {
    const expiresAt = Date.now() + ttlSeconds * 1000;
    this.store.set(key, { value, expiresAt, tag });

    if (tag) {
      if (!this.tags.has(tag)) this.tags.set(tag, new Set());
      this.tags.get(tag).add(key);
    }
    return value;
  }

  delete(key) {
    const entry = this.store.get(key);
    if (entry && entry.tag && this.tags.has(entry.tag)) {
      this.tags.get(entry.tag).delete(key);
    }
    this.store.delete(key);
  }

  invalidateTag(tag) {
    const keys = this.tags.get(tag);
    if (keys) {
      for (const key of keys) {
        this.store.delete(key);
      }
      this.tags.delete(tag);
    }
  }

  clear() {
    this.store.clear();
    this.tags.clear();
  }

  getStats() {
    const total = this.hits + this.misses;
    const hitRatio = total > 0 ? ((this.hits / total) * 100).toFixed(1) + '%' : '0.0%';
    // Clean expired entries on stat check
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (now > entry.expiresAt) this.delete(key);
    }
    return {
      keys: this.store.size,
      hits: this.hits,
      misses: this.misses,
      hitRatio
    };
  }
}

export const cache = new Cache();
