import os
import json
import pytest
from unittest.mock import patch, AsyncMock, MagicMock

from src.infrastructure.llm import OpenAIProvider, MockLLMProvider, get_llm_provider


def _client(content):
    client = MagicMock()
    client.chat.completions.create = AsyncMock(
        return_value=MagicMock(choices=[MagicMock(message=MagicMock(content=content))])
    )
    return client


def _findings(n=3):
    return [{"rule_id": f"rule-{i}", "severity": "error", "message": "m",
             "file_path": "a.py", "line": i} for i in range(n)]


@pytest.mark.asyncio
@patch("openai.AsyncOpenAI")
async def test_suppressed_findings_are_marked_not_removed(mock_openai):
    """
    Suppression must be a marked state. Deleting entries silently erased real
    vulnerabilities with no audit trail and no way to recover from a bad run.
    """
    mock_openai.return_value = _client('{"false_positives": [1], "reason": "test fixture"}')

    findings = _findings(3)
    result = await OpenAIProvider(api_key="k").judge(findings)

    assert len(result) == 3, "no finding may be dropped"
    assert [f["suppressed_by_llm"] for f in result] == [False, True, False]
    assert result[1]["suppression_reason"] == "test fixture"
    assert result[0]["suppression_reason"] is None


@pytest.mark.asyncio
@patch("openai.AsyncOpenAI")
async def test_api_error_suppresses_nothing(mock_openai):
    """Fail open: a filtering outage must not hide findings."""
    client = MagicMock()
    client.chat.completions.create = AsyncMock(side_effect=Exception("rate limited"))
    mock_openai.return_value = client

    result = await OpenAIProvider(api_key="k").judge(_findings(2))
    assert len(result) == 2
    assert all(f["suppressed_by_llm"] is False for f in result)


@pytest.mark.asyncio
@patch("openai.AsyncOpenAI")
async def test_malformed_response_suppresses_nothing(mock_openai):
    mock_openai.return_value = _client("not json at all")
    result = await OpenAIProvider(api_key="k").judge(_findings(2))
    assert all(f["suppressed_by_llm"] is False for f in result)


@pytest.mark.asyncio
@patch("openai.AsyncOpenAI")
async def test_out_of_range_indices_are_ignored(mock_openai):
    mock_openai.return_value = _client('{"false_positives": [0, 99, -1, "x"], "reason": "r"}')
    result = await OpenAIProvider(api_key="k").judge(_findings(2))
    assert [f["suppressed_by_llm"] for f in result] == [True, False]


@pytest.mark.asyncio
@patch("openai.AsyncOpenAI")
async def test_findings_are_batched(mock_openai):
    """The old implementation claimed to batch in a comment and sent everything at once."""
    client = _client('{"false_positives": [], "reason": null}')
    mock_openai.return_value = client

    provider = OpenAIProvider(api_key="k")
    await provider.judge(_findings(provider.BATCH_SIZE * 2 + 1))

    assert client.chat.completions.create.await_count == 3


@pytest.mark.asyncio
@patch("openai.AsyncOpenAI")
async def test_empty_input_makes_no_request(mock_openai):
    client = _client("{}")
    mock_openai.return_value = client
    assert await OpenAIProvider(api_key="k").judge([]) == []
    client.chat.completions.create.assert_not_called()


@pytest.mark.asyncio
async def test_mock_provider_marks_everything_unsuppressed():
    result = await MockLLMProvider().judge(_findings(2))
    assert all(f["suppressed_by_llm"] is False for f in result)


@patch.dict(os.environ, {"LLM_PROVIDER": "openai", "OPENAI_API_KEY": "test"})
@patch("openai.AsyncOpenAI")
def test_get_llm_provider_openai(mock_openai):
    assert isinstance(get_llm_provider(), OpenAIProvider)


@patch.dict(os.environ, {"LLM_PROVIDER": "mock"})
def test_get_llm_provider_mock():
    assert isinstance(get_llm_provider(), MockLLMProvider)
