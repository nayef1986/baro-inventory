// api/gemini-chat.js — Gemini chat proxy

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { messages, system } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "GEMINI_API_KEY not configured" });

  // نجرب عدة موديلات
  const MODELS = [
    "gemini-2.0-flash",
    "gemini-flash-latest",
    "gemini-2.5-flash",
    "gemini-2.0-flash-001",
    "gemini-1.5-flash-latest",
    "gemini-1.5-flash-002",
    "gemini-1.5-flash",
  ];

  const contents = messages.map(m => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  if (system && contents.length > 0) {
    contents[0].parts[0].text = system + "\n\n" + contents[0].parts[0].text;
  }

  let lastError = null;

  for (const model of MODELS) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents,
            generationConfig: { maxOutputTokens: 1500, temperature: 0.7 },
          }),
        }
      );

      const data = await response.json();

      if (data.error) {
        lastError = data.error.message;
        continue; // جرب الموديل التالي
      }

      const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "لم أفهم السؤال";
      return res.status(200).json({ content: [{ type: "text", text }] });

    } catch (err) {
      lastError = err.message;
      continue;
    }
  }

  return res.status(500).json({ error: lastError ?? "فشل الاتصال بـ Gemini" });
}
