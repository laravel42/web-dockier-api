import os
import httpx

async def get_cloudflare_secret(secret_name: str) -> str:
    """
    Fetches a secret from Cloudflare Secrets Store.
    In a real production environment, this might call the Cloudflare REST API 
    using a service token, or the secrets might be synced as environment variables.
    For this implementation, we attempt an HTTP fetch if credentials are provided,
    otherwise fallback to local environment variables.
    """
    cf_account_id = os.getenv("CLOUDFLARE_ACCOUNT_ID")
    cf_api_token = os.getenv("CLOUDFLARE_API_TOKEN")
    
    if cf_account_id and cf_api_token:
        # Example pseudo-implementation for calling a KV/Secrets API
        url = f"https://api.cloudflare.com/client/v4/accounts/{cf_account_id}/workers/scripts/dockier/secrets"
        headers = {
            "Authorization": f"Bearer {cf_api_token}",
            "Content-Type": "application/json"
        }
        async with httpx.AsyncClient() as client:
            try:
                response = await client.get(url, headers=headers)
                if response.status_code == 200:
                    data = response.json()
                    # Example parsing depending on CF exact endpoint format
                    for secret in data.get("result", []):
                        if secret["name"] == secret_name:
                            # Note: CF API often doesn't return the plain text secret via GET for security.
                            # Usually, secrets are injected at runtime.
                            # If using a KV store for configs:
                            pass
            except Exception as e:
                print(f"[!] Failed to fetch secret {secret_name} from Cloudflare: {e}")
                
    # Fallback to local environment variables
    val = os.getenv(secret_name)
    if not val:
        raise ValueError(f"Secret '{secret_name}' not found in Cloudflare or local env.")
    return val
