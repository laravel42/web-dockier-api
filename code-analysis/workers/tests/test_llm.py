import os
import pytest
from unittest.mock import patch, AsyncMock, MagicMock

from src.infrastructure.llm import OpenAIProvider, MockLLMProvider, get_llm_provider


@pytest.mark.asyncio
@patch("openai.AsyncOpenAI")
async def test_openai_provider_keeps_only_true_positives(mock_openai):
    mock_client = MagicMock()
    mock_message = MagicMock(content='{"true_positives": [0, 2]}')
    mock_client.chat.completions.create = AsyncMock(
        return_value=MagicMock(choices=[MagicMock(message=mock_message)])
    )
    mock_openai.return_value = mock_client

    provider = OpenAIProvider(api_key="test-key")
    findings = [{"id": 1, "msg": "TP 1"}, {"id": 2, "msg": "FP"}, {"id": 3, "msg": "TP 2"}]

    result = await provider.filter_false_positives(findings)
    assert [f["id"] for f in result] == [1, 3]


@pytest.mark.asyncio
@patch("openai.AsyncOpenAI")
async def test_openai_provider_fails_open_on_api_error(mock_openai):
    """A filtering failure must never silently drop findings."""
    mock_client = MagicMock()
    mock_client.chat.completions.create = AsyncMock(side_effect=Exception("rate limited"))
    mock_openai.return_value = mock_client

    findings = [{"id": 1}, {"id": 2}]
    assert await OpenAIProvider(api_key="test-key").filter_false_positives(findings) == findings


@pytest.mark.asyncio
@patch("openai.AsyncOpenAI")
async def test_openai_provider_short_circuits_on_empty_input(mock_openai):
    mock_client = MagicMock()
    mock_client.chat.completions.create = AsyncMock()
    mock_openai.return_value = mock_client

    assert await OpenAIProvider(api_key="test-key").filter_false_positives([]) == []
    mock_client.chat.completions.create.assert_not_called()


@pytest.mark.asyncio
async def test_mock_llm_provider_is_a_passthrough():
    findings = [{"id": 1}]
    assert await MockLLMProvider().filter_false_positives(findings) == findings


@patch.dict(os.environ, {"LLM_PROVIDER": "openai", "OPENAI_API_KEY": "test"})
@patch("openai.AsyncOpenAI")
def test_get_llm_provider_openai(mock_openai):
    assert isinstance(get_llm_provider(), OpenAIProvider)


@patch.dict(os.environ, {"LLM_PROVIDER": "mock"})
def test_get_llm_provider_mock():
    assert isinstance(get_llm_provider(), MockLLMProvider)
