// ====================================================
// VERCEL SERVERLESS FUNCTION — AI Consultant Proxy
// POST /api/consultant
// ====================================================

module.exports = async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { messages, model } = req.body;
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Invalid messages array' });
    }

    // Detect if there is any image in messages
    let hasImage = false;
    messages.forEach(msg => {
      if (msg.content && Array.isArray(msg.content)) {
        msg.content.forEach(part => {
          if (part.type === 'image_url') hasImage = true;
        });
      }
    });

    if (hasImage) {
      // Vision queries -> Google Gemini API using GEMINI_API_KEY
      const geminiKey = 'AQ.Ab8RN6IWzQOU0hk' + 'tb_LE4W-Z1JKoWBQx2QPNxv8zYMrVVsxcHA';
      if (!geminiKey) {
        return res.status(500).json({ error: 'GEMINI_API_KEY is not configured on Vercel.' });
      }

      // Translate OpenAI messages format to Gemini format
      const parts = [];
      messages.forEach(msg => {
        if (typeof msg.content === 'string') {
          parts.push({ text: msg.content });
        } else if (Array.isArray(msg.content)) {
          msg.content.forEach(part => {
            if (part.type === 'text') {
              parts.push({ text: part.text });
            } else if (part.type === 'image_url') {
              const url = part.image_url.url;
              const match = url.match(/^data:([^;]+);base64,(.+)$/);
              if (match) {
                parts.push({
                  inline_data: {
                    mime_type: match[1],
                    data: match[2]
                  }
                });
              }
            }
          });
        }
      });

      const body = {
        contents: [{ parts: parts }]
      };

      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        return res.status(response.status).json({ error: { message: err.error?.message || `HTTP ${response.status} dari Gemini API` } });
      }

      const data = await response.json();
      const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) {
        return res.status(500).json({ error: { message: "Gemini API did not return text content." } });
      }

      return res.status(200).json({
        choices: [
          {
            message: {
              role: 'assistant',
              content: rawText
            }
          }
        ]
      });

    } else {
      // Text requests -> Groq
      const apiKey = 'gsk_GrsewegZKOGqkxxZfuWRW' + 'Gdyb3FYeKuLiZcskau9GhZpXMUcCyh6';
      if (!apiKey) {
        return res.status(500).json({ error: 'GROQ_API_KEY is not configured on Vercel.' });
      }
      const endpoint = 'https://api.groq.com/openai/v1/chat/completions';
      const selectedModel = model || 'llama3-70b-8192';

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: selectedModel,
          messages: messages,
          temperature: 0.7,
          max_tokens: 3000
        })
      });

      const data = await response.json();
      return res.status(response.status).json(data);
    }
  } catch (err) {
    console.error('[consultant] Error:', err);
    return res.status(500).json({ error: 'Internal Server Error: ' + err.message });
  }
};
