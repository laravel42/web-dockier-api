import json
import asyncpg
from typing import Optional
from src.infrastructure.config import get_db_url

_pool: Optional[asyncpg.Pool] = None


async def _init_connection(conn: asyncpg.Connection) -> None:
    """Decode jsonb to Python objects instead of raw strings.

    Without this every jsonb column — pgboss.job.data, scans.summary,
    quality_gates.conditions — arrives as a str and each caller has to remember
    to json.loads it. Forgetting is silent: `row["data"]["scanId"]` on a string
    indexes characters.
    """
    await conn.set_type_codec(
        "jsonb", encoder=json.dumps, decoder=json.loads, schema="pg_catalog"
    )
    await conn.set_type_codec(
        "json", encoder=json.dumps, decoder=json.loads, schema="pg_catalog"
    )


async def get_db_pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        # Supabase Supavisor / PgBouncer transaction pooling reuses connections
        # across clients; asyncpg's default prepared-statement cache then raises
        # DuplicatePreparedStatementError and the API service exits on startup.
        _pool = await asyncpg.create_pool(
            dsn=get_db_url(),
            min_size=2,
            max_size=10,
            init=_init_connection,
            statement_cache_size=0,
        )
    return _pool

async def execute_query(query: str, *args):
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        return await conn.execute(query, *args)

async def fetch_row(query: str, *args):
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        return await conn.fetchrow(query, *args)

async def fetch_all(query: str, *args):
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        return await conn.fetch(query, *args)

async def execute_many(query: str, args_seq):
    """Batch-execute one statement over many parameter tuples in a transaction."""
    if not args_seq:
        return
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            await conn.executemany(query, args_seq)

async def close_pool():
    global _pool
    if _pool:
        await _pool.close()
        _pool = None
