import { api } from "encore.dev/api";
import { db, OpenAIApiKey } from "../shared";

interface AiColumn {
  name: string;
  type: string;
  category: string;
  sensitivity: string;
  reason: string;
  confidence: number;
}

interface AiTable {
  name: string;
  riskScore: number;
  columns: AiColumn[];
}

interface AiSensitiveResult {
  tables: AiTable[];
  summary: {
    totalTables: number;
    highRiskTables: number;
    criticalFindings: string[];
  };
}

// ─── Analyze with AI (with DB cache) ───

export const analyzeSensitiveData = api(
  { method: "POST", path: "/git/analyze-sensitive-data", auth: true },
  async (params: { schema: string; projectId?: string }): Promise<AiSensitiveResult> => {
    // Check DB cache ONLY if no schema provided (page load cache probe)
    if (params.projectId && (!params.schema || params.schema.trim().length === 0)) {
      try {
        const cached = await db.queryRow<{ result: string }>`
          SELECT result FROM sensitive_cache WHERE project_id = ${params.projectId}`;
        if (cached) {
          const parsed = typeof cached.result === "string" ? JSON.parse(cached.result) : cached.result;
          if (parsed.tables && parsed.tables.length > 0) {
            console.log(`[sensitive-ai] Cache hit for project ${params.projectId}`);
            return parsed as AiSensitiveResult;
          }
        }
      } catch { /* ignore cache errors */ }
      // No cache and no schema — return empty
      return { tables: [], summary: { totalTables: 0, highRiskTables: 0, criticalFindings: [] } };
    }

    const apiKey = OpenAIApiKey();
    if (!apiKey) throw new Error("OpenAI API key not configured");

    const prompt = `You are a senior data security analyst specialized in detecting sensitive data (PII, secrets, credentials, regulated data) from database schemas.

Your task is to analyze the following SQL schema dump and identify sensitive data risks.

---

# INPUT

You will receive a SQL schema dump containing:
- CREATE TABLE statements
- Columns, types, constraints
- Indexes and relationships

---

# INSTRUCTIONS

Analyze the schema and classify each column based ONLY on:
- column names
- data types
- constraints
- relationships

DO NOT assume actual stored values.
DO NOT hallucinate. If uncertain, mark as "unknown".

---

# SENSITIVE DATA CATEGORIES

Use these exact categories:
- "credentials" (passwords, hashes, tokens, api keys)
- "personal_identifiable" (name, email, phone, address)
- "financial" (credit cards, IBAN, transactions)
- "authentication" (session ids, oauth tokens, refresh tokens)
- "health" (medical, insurance)
- "location" (gps, ip address, geo)
- "internal" (internal ids, system metadata)
- "unknown" (cannot determine)

---

# DETECTION RULES

1. Use strong signals:
   - column names like: password, email, token, ssn, card_number
2. Use weak signals:
   - generic names like: value, data, info → classify as "unknown"
3. If multiple interpretations exist → choose safest (more sensitive)
4. Never invent meaning beyond schema

---

# OUTPUT FORMAT (STRICT JSON ONLY)

Return ONLY valid JSON:

{
  "tables": [
    {
      "name": "table_name",
      "riskScore": 0-100,
      "columns": [
        {
          "name": "column_name",
          "type": "sql_type",
          "category": "one of the categories above",
          "sensitivity": "low|medium|high|critical",
          "reason": "short explanation based on schema evidence only",
          "confidence": 0-1
        }
      ]
    }
  ],
  "summary": {
    "totalTables": number,
    "highRiskTables": number,
    "criticalFindings": ["short bullet insights"]
  }
}

---

# SCORING RULES

- critical → passwords, tokens, secrets
- high → emails, phone, financial
- medium → names, addresses
- low → internal ids
- unknown → unknown

Table riskScore:
- 0–30 → low
- 31–60 → medium
- 61–80 → high
- 81–100 → critical

---

# HARD CONSTRAINTS

- Output ONLY JSON (no markdown, no text)
- No trailing commas
- No comments
- No explanations outside JSON
- If unsure → use "unknown"
- Keep reasons concise and factual

---

# GOAL

Produce a deterministic, conservative classification of sensitive data exposure risk based solely on schema structure.

---

# INPUT SCHEMA

${params.schema}`;

    console.log(`[sensitive-ai] Analyzing schema (${params.schema.length} chars)...`);

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "gpt-5.4-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0,
        max_completion_tokens: 16384,
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { error?: { message?: string } };
      throw new Error(`OpenAI error ${res.status}: ${err.error?.message || res.statusText}`);
    }

    const data = await res.json() as { choices?: Array<{ message?: { content?: string }; finish_reason?: string }> };
    const text = data.choices?.[0]?.message?.content?.trim() || "";

    if (data.choices?.[0]?.finish_reason === "length") {
      console.error("[sensitive-ai] Response truncated");
    }

    const result = JSON.parse(text) as AiSensitiveResult;
    console.log(`[sensitive-ai] Found ${result.tables?.length || 0} tables, ${result.summary?.highRiskTables || 0} high risk`);

    // Store in DB cache (only if we got actual results)
    if (params.projectId && result.tables && result.tables.length > 0) {
      try {
        await db.exec`
          INSERT INTO sensitive_cache (project_id, result, created_at)
          VALUES (${params.projectId}, ${JSON.stringify(result)}::jsonb, NOW())
          ON CONFLICT (project_id) DO UPDATE SET result = ${JSON.stringify(result)}::jsonb, created_at = NOW()`;
        console.log(`[sensitive-ai] Cached for project ${params.projectId}`);
      } catch { /* ignore cache errors */ }
    }

    return result;
  }
);
