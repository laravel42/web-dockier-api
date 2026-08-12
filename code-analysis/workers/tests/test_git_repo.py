import pytest
from unittest.mock import patch, AsyncMock

from src.infrastructure.git_repo import build_clone_url, get_connection, resolve_clone_url


@pytest.mark.parametrize("provider,expected_user", [
    ("github", "x-access-token"), ("gitlab", "oauth2"), ("bitbucket", "x-token-auth"),
])
def test_token_username_per_provider(provider, expected_user):
    url = build_clone_url(provider, "", "acme/app", "tok")
    assert url.startswith(f"https://{expected_user}:tok@")


def test_repo_gets_a_git_suffix():
    assert build_clone_url("github", "", "acme/app", None).endswith("/acme/app.git")
    assert build_clone_url("github", "", "acme/app.git", None).endswith("/acme/app.git")


def test_self_hosted_endpoint_is_honoured():
    url = build_clone_url("gitlab", "https://git.corp.example.com/", "team/app", None)
    assert url == "https://git.corp.example.com/team/app.git"


def test_token_is_percent_encoded():
    """PATs can contain characters that would otherwise end the userinfo section."""
    url = build_clone_url("github", "", "acme/app", "tok/with@slash")
    assert "tok%2Fwith%40slash" in url
    assert url.count("@") == 1


def test_no_token_produces_an_anonymous_url():
    assert build_clone_url("github", "", "acme/app", None) == "https://github.com/acme/app.git"


def test_non_https_endpoint_is_refused():
    with pytest.raises(ValueError, match="non-https"):
        build_clone_url("github", "http://insecure.example.com", "a/b", None)


def test_unknown_provider_without_endpoint_is_refused():
    with pytest.raises(ValueError, match="No endpoint"):
        build_clone_url("gitea", "", "a/b", None)


@pytest.mark.asyncio
@patch("src.infrastructure.git_repo.fetch_row", new_callable=AsyncMock)
async def test_connection_lookup_is_tenant_scoped(mock_fetch):
    """
    Without the tenant filter, a caller who guessed a connection id could clone
    another organization's private repository.
    """
    mock_fetch.return_value = {"id": "c1", "provider": "github",
                               "personal_token": "t", "endpoint": ""}
    await get_connection("c1", "org-9")

    sql, connection_id, tenant_id = mock_fetch.await_args[0]
    assert "organization_id = $2" in sql
    assert (connection_id, tenant_id) == ("c1", "org-9")


@pytest.mark.asyncio
@patch("src.infrastructure.git_repo.fetch_row", new_callable=AsyncMock)
async def test_missing_connection_raises(mock_fetch):
    mock_fetch.return_value = None
    with pytest.raises(ValueError, match="not found"):
        await resolve_clone_url({"connection_id": "c1", "repo": "a/b"}, "org-9")
