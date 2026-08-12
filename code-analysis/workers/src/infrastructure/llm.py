import os
import json
from typing import List, Dict, Any

class LLMProvider:
    """Abstract interface for LLM providers."""
    async def filter_false_positives(self, findings: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        raise NotImplementedError

class OpenAIProvider(LLMProvider):
    def __init__(self, api_key: str = None):
        import openai
        self.client = openai.AsyncOpenAI(api_key=api_key or os.getenv("OPENAI_API_KEY"))
        
    async def filter_false_positives(self, findings: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        if not findings:
            return findings
            
        # We process in batches to avoid token limits
        prompt = (
            "You are an expert Application Security Engineer. Review the following "
            "security scan findings (in JSON format) and determine if any are obvious "
            "false positives based on the rule and the limited context provided. "
            "Return a JSON array containing only the indices of the findings that are "
            "TRUE positives or likely true positives. Omit the indices of false positives. "
            "Respond ONLY with a JSON array of integers, e.g. [0, 1, 3]."
        )
        
        try:
            # Note: In a real implementation, we'd batch findings and include more code context.
            # Here we demonstrate the interface.
            response = await self.client.chat.completions.create(
                model="gpt-5.4-mini",
                messages=[
                    {"role": "system", "content": prompt},
                    {"role": "user", "content": json.dumps(findings)}
                ],
                response_format={ "type": "json_object" }
            )
            content = response.choices[0].message.content
            
            try:
                # Expecting a JSON object like {"true_positives": [0, 1, 3]} or just a raw array
                data = json.loads(content)
                if isinstance(data, dict) and "true_positives" in data:
                    valid_indices = set(data["true_positives"])
                elif isinstance(data, list):
                    valid_indices = set(data)
                else:
                    valid_indices = set(range(len(findings))) # Fallback
                    
                return [f for i, f in enumerate(findings) if i in valid_indices]
                
            except json.JSONDecodeError:
                return findings
                
        except Exception as e:
            print(f"[!] LLM Filtering failed: {e}")
            return findings # Fallback to all findings if LLM fails

class MockLLMProvider(LLMProvider):
    """A mock provider that keeps all findings for local testing."""
    async def filter_false_positives(self, findings: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        return findings

def get_llm_provider() -> LLMProvider:
    provider_name = os.getenv("LLM_PROVIDER", "mock").lower()
    if provider_name == "openai":
        return OpenAIProvider()
    return MockLLMProvider()
