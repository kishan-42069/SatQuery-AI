import json
from typing import Any, Optional

from app.core.redis_client import get_redis_client


async def set_cache(key: str, value: Any, expire_seconds: int = 3600) -> None:
    """Stores a JSON-serializable value in Redis with an expiration."""
    redis = get_redis_client()
    await redis.setex(key, expire_seconds, json.dumps(value))


async def get_cache(key: str) -> Optional[Any]:
    """Retrieves and deserializes a value from Redis."""
    redis = get_redis_client()
    data = await redis.get(key)
    if data:
        return json.loads(data)
    return None


async def delete_cache(key: str) -> None:
    """Deletes a key from Redis."""
    redis = get_redis_client()
    await redis.delete(key)
