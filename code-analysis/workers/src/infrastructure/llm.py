import os
import json
from typing import List, Dict, Any

class LLMProvider:
    """Abstract interface for LLM providers.

    Implementations MARK findings rather than removing them. `judge` returns the
    input list with `suppressed_by_llm` / `suppression_reason` set on each entry.
    A model omitting an index must never cause a finding to vanish without trace:
    suppression is recoverable, deletion is not.
    """
    async def judge(self, findings: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        raise NotImplementedError


def _mark(findings: List[Dict[str, Any]], suppressed_indices: set, reason: str) -> List[Dict[str, Any]]:
    """Annotate findings in place with the filter verdict and return them all."""
    for i, f in enumerate(findings):
        if i in suppressed_indices:
            f["suppressed_by_llm"] = True
            f["suppression_reason"] = reason
        else:
            f["suppressed_by_llm"] = False
            f["suppression_reason"] = None
    return findings


class OpenAIProvider(LLMProvider):
    # Batched so a large scan cannot blow the context window. The previous
    # implementation carried a comment claiming it batched, above code that sent
    # every finding in a single request.
    BATCH_SIZE = 50
    REQUEST_TIMEOUT_SECONDS = 60

    def __init__(self, api_key: str = None):
        import openai
        self.client = openai.AsyncOpenAI(api_key=api_key or os.getenv("OPENAI_API_KEY"))

    async def judge(self, findings: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        if not findings:
            return findings

        for start in range(0, len(findings), self.BATCH_SIZE):
            batch = findings[start : start + self.BATCH_SIZE]
            suppressed, reason = await self._judge_batch(batch)
            _mark(batch, suppressed, reason)

        return findings

    async def _judge_batch(self, batch: List[Dict[str, Any]]) -> tuple:
        # response_format=json_object forbids a top-level array, so the contract
        # is an object. The prompt and the parser must agree on that; they did
        # not before, and the two were documented differently again in
        # aggregator/README.md.
        prompt = (
            "You are an expert Application Security Engineer. Review the following "
            "security scan findings (in JSON format) and determine which are obvious "
            "false positives based on the rule and the limited context provided. "
            "Respond with a JSON object of the form "
            '{"false_positives": [<indices>], "reason": "<one sentence>"} '
            "where each index refers to the position of a finding in the input array. "
            "Return an empty list when every finding looks like a true positive."
        )

        try:
            response = await self.client.chat.completions.create(
                model="gpt-5.4-mini",
                messages=[
                    {"role": "system", "content": prompt},
                    {"role": "user", "content": json.dumps(batch)},
                ],
                response_format={"type": "json_object"},
                timeout=self.REQUEST_TIMEOUT_SECONDS,
            )
            data = json.loads(response.choices[0].message.content)
        except Exception as e:
            # Fail open: on any error nothing is suppressed, so the findings are
            # reported. Failing closed would hide real vulnerabilities whenever
            # the API had a bad day.
            print(f"[!] LLM filtering failed, suppressing nothing: {e}")
            return set(), None

        if not isinstance(data, dict):
            return set(), None

        raw_indices = data.get("false_positives", [])
        if not isinstance(raw_indices, list):
            return set(), None

        reason = data.get("reason") or "Judged a likely false positive by the LLM filter."
        suppressed = {i for i in raw_indices if isinstance(i, int) and 0 <= i < len(batch)}
        return suppressed, reason


class MockLLMProvider(LLMProvider):
    """A mock provider that suppresses nothing, for local testing."""
    async def judge(self, findings: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        return _mark(findings, set(), None)


def get_llm_provider() -> LLMProvider:
    provider_name = os.getenv("LLM_PROVIDER", "mock").lower()
    if provider_name == "openai":
        return OpenAIProvider()
    return MockLLMProvider()
