import redis.asyncio as redis
from app.core.config import settings

class MockRedis:
    def __init__(self):
        self.store = {}
        self.hashes = {}
        self.sets = {}

    async def set(self, key, value, nx=False, ex=None):
        if nx and key in self.store:
            return False
        self.store[key] = value
        return True

    async def get(self, key):
        return self.store.get(key)

    async def delete(self, key):
        existed = key in self.store or key in self.hashes or key in self.sets
        self.store.pop(key, None)
        self.hashes.pop(key, None)
        self.sets.pop(key, None)
        return 1 if existed else 0

    async def hincrby(self, key, field, amount=1):
        h = self.hashes.setdefault(key, {})
        h[field] = h.get(field, 0) + amount
        return h[field]

    async def hgetall(self, key):
        return dict(self.hashes.get(key, {}))

    async def sadd(self, key, member):
        s = self.sets.setdefault(key, set())
        before = len(s)
        s.add(member)
        return 1 if len(s) > before else 0

    async def sismember(self, key, member):
        return member in self.sets.get(key, set())

try:
    redis_client = redis.from_url(settings.REDIS_URL, decode_responses=True)
except Exception:
    redis_client = MockRedis()