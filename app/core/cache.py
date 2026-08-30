import json
from typing import Any, Optional

from fastapi.encoders import jsonable_encoder
from tenacity import retry, stop_after_attempt, wait_exponential

from app.core.redis_client import get_redis_client


@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=1, max=10))
async def set_cache(key: str, value: Any, expire_seconds: int = 3600) -> None:
    """Stores a JSON-serializable value in Redis with an expiration."""
    redis = get_redis_client()
    safe_value = jsonable_encoder(value)
    await redis.setex(key, expire_seconds, json.dumps(safe_value))


@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=1, max=10))
async def get_cache(key: str) -> Optional[Any]:
    """Retrieves and deserializes a value from Redis."""
    redis = get_redis_client()
    data = await redis.get(key)
    if data:
        return json.loads(data)
    return None


@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=1, max=10))
async def delete_cache(key: str) -> None:
    """Deletes a key from Redis."""
    redis = get_redis_client()
    await redis.delete(key)


@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=1, max=10))
async def set_persistent_cache(key: str, value: Any) -> None:
    """Stores a JSON-serializable value persistently in Redis without expiration."""
    redis = get_redis_client()
    safe_value = jsonable_encoder(value)
    await redis.set(key, json.dumps(safe_value))


@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=1, max=10))
async def hset_cache(name: str, key: str, value: Any) -> None:
    """Sets a field in a Redis hash."""
    redis = get_redis_client()
    safe_value = jsonable_encoder(value)
    await redis.hset(name, key, json.dumps(safe_value))


@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=1, max=10))
async def hget_cache(name: str, key: str) -> Optional[Any]:
    """Gets a field from a Redis hash."""
    redis = get_redis_client()
    data = await redis.hget(name, key)
    if data:
        return json.loads(data)
    return None


@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=1, max=10))
async def clear_cache_pattern(pattern: str) -> None:
    """Deletes all keys matching a pattern."""
    redis = get_redis_client()
    keys = []
    async for key in redis.scan_iter(match=pattern, count=100):
        keys.append(key)
    if keys:
        await redis.delete(*keys)
