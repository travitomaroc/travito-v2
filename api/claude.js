// ================================================================
//  VERCEL SERVERLESS FUNCTION — Anthropic API Proxy
//  File: api/claude.js
// ================================================================
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "ANTHROPIC_API_KEY not set" });

  try {
    const body = {
      model:      "claude-sonnet-4-6",
      max_tokens: req.body.max_tokens || 1500,
      system:     req.body.system || "",
      messages:   req.body.messages || [],
    };
    // Pass tools if provided (e.g. web_search)
    if (req.body.tools?.length > 0) body.tools = req.body.tools;
    if (req.body.tool_choice)       body.tool_choice = req.body.tool_choice;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type":      "application/json",
        "x-api-key":         apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    });

    const text = await response.text();
    console.log("Anthropic status:", response.status);

    try {
      const data = JSON.parse(text);
      return res.status(response.status).json(data);
    } catch {
      return res.status(response.status).send(text);
    }
  } catch (error) {
    console.error("Proxy error:", error);
    return res.status(500).json({ error: error.message });
  }
}
