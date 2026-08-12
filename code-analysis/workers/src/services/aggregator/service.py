import json
from pydantic import ValidationError

from src.models.schemas import ScanResult
from src.infrastructure.llm import get_llm_provider
from src.infrastructure.db_client import execute_query
from src.infrastructure.redis_client import get_redis_client

EXPECTED_ENGINES = {"semgrep", "regex", "sonarqube", "codeql"}


class AggregatorService:
    def __init__(self):
        self.redis = get_redis_client()
        self.llm = get_llm_provider()

    def _findings_key(self, job_id: str) -> str:
        return f"job:{job_id}:findings"

    def _engines_key(self, job_id: str) -> str:
        return f"job:{job_id}:engines_done"

    def _status_key(self, job_id: str) -> str:
        return f"job:{job_id}:engine_status"

    def _claim_key(self, job_id: str) -> str:
        return f"job:{job_id}:completing"

    async def complete_job(self, job_id: str, scan_id: str, all_findings: list, engine_status: dict):
        print(f"[*] AggregatorService: Finalizing job {job_id} with {len(all_findings)} raw findings")

        filtered_findings = await self.llm.filter_false_positives(all_findings)
        print(f"[*] AggregatorService: Kept {len(filtered_findings)} findings after LLM filtering")

        failed = [e for e, s in engine_status.items() if s.get("status") != "ok"]
        if failed:
            print(f"[!] AggregatorService: job {job_id} completed with failed engines: {failed}")

        results_json = json.dumps(filtered_findings)
        status_json = json.dumps(engine_status)
        # A scan where an engine failed is not a clean bill of health.
        scan_status = "partial" if failed else "success"

        try:
            await execute_query(
                "UPDATE pgboss.job SET state = 'completed', completedon = now(), output = $1 WHERE id = $2",
                results_json, job_id
            )
            if scan_id:
                await execute_query(
                    "UPDATE security_scans SET status = $1, findings = $2, engine_status = $3, "
                    "completed_at = now() WHERE id = $4",
                    scan_status, results_json, status_json, scan_id
                )
        except Exception as e:
            print(f"[!] AggregatorService: Failed to save to DB: {e}")

    async def process_result(self, message: dict):
        try:
            result = ScanResult.model_validate(message)
        except ValidationError as e:
            # Reject malformed engine output rather than aggregating garbage.
            print(f"[!] AggregatorService: discarding malformed result: {e}")
            return

        job_id = result.job_id
        scan_id = result.scan_id

        # sadd returns 1 only for a member that was genuinely new. An engine
        # that reports twice (redelivery, duplicate subscriber) must not have
        # its findings counted twice.
        newly_added = await self.redis.sadd(self._engines_key(job_id), result.engine)
        if not newly_added:
            print(f"[*] AggregatorService: ignoring duplicate result from {result.engine} for {job_id}")
            return

        if result.findings:
            await self.redis.rpush(
                self._findings_key(job_id),
                *[f.model_dump_json() for f in result.findings]
            )
        await self.redis.hset(
            self._status_key(job_id),
            result.engine,
            json.dumps({"status": result.status, "error": result.error}),
        )

        engines_done = await self.redis.smembers(self._engines_key(job_id))
        engines_done_decoded = {e.decode("utf-8") for e in engines_done}

        if not EXPECTED_ENGINES.issubset(engines_done_decoded):
            return

        # Two engines can observe a complete set in the same window. Exactly one
        # may finalize: SET NX is the atomic claim.
        claimed = await self.redis.set(self._claim_key(job_id), "1", nx=True, ex=3600)
        if not claimed:
            print(f"[*] AggregatorService: job {job_id} already being finalized elsewhere")
            return

        raw_findings_data = await self.redis.lrange(self._findings_key(job_id), 0, -1)
        # One list entry == one finding object. Parsing to a dict and appending
        # is the contract; extending a list with a dict would iterate its keys.
        all_findings = [json.loads(item.decode("utf-8")) for item in raw_findings_data]

        raw_status = await self.redis.hgetall(self._status_key(job_id))
        engine_status = {
            k.decode("utf-8"): json.loads(v.decode("utf-8")) for k, v in raw_status.items()
        }

        await self.redis.delete(
            self._findings_key(job_id),
            self._engines_key(job_id),
            self._status_key(job_id),
        )
        await self.complete_job(job_id, scan_id, all_findings, engine_status)
