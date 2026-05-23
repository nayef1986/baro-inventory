// api/gemini-image.js — Vercel serverless proxy for Gemini

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { prompt, imageBase64 } = req.body;

  if (!prompt) {
    return res.status(400).json({ error: "prompt required" });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "GEMINI_API_KEY not configured" });
  }

  try {
    const parts = [{ text: prompt }];

    if (imageBase64) {
      const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
      parts.unshift({
        inline_data: {
          mime_type: "image/jpeg",
          data: base64Data,
        }
      });
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp-image-generation:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: { responseModalities: ["IMAGE", "TEXT"] },
        }),
      }
    );

    const data = await response.json();

    if (data.error) {
      return res.status(500).json({ error: data.error.message });
    }

    // استخراج الصورة من الرد
    const candidate = data.candidates?.[0];
    const imagePart = candidate?.content?.parts?.find(p => p.inline_data);

    if (!imagePart) {
      return res.status(500).json({ error: "لم يتم توليد صورة" });
    }

    const imageData = `data:${imagePart.inline_data.mime_type};base64,${imagePart.inline_data.data}`;
    return res.status(200).json({ image: imageData });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
