import redis.asyncio as redis
from app.config import get_settings

settings = get_settings()

class RedisClient:
    _instance = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance.client = None
        return cls._instance
    
    async def connect(self):
        if self.client is None:
            self.client = redis.from_url(settings.redis_url, encoding="utf-8", decode_responses=True)
    
    async def disconnect(self):
        if self.client:
            await self.client.close()
            self.client = None
    
    async def get_client(self):
        if self.client is None:
            await self.connect()
        return self.client

redis_client = RedisClient()

async def get_redis():
    await redis_client.connect()
    return redis_client.client
