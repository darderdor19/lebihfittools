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
    const { messages } = req.body;
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Invalid messages array' });
    }

    // Google Gemini or NVIDIA API
    const hasImage = messages.some(msg => 
      Array.isArray(msg.content) && msg.content.some(part => part.type === 'image_url')
    );
    let apiKey = hasImage ? process.env.API_KEY_IMAGE : process.env.API_KEY_TEXT;
    if (!apiKey) {
      apiKey = process.env.GEMINI_API_KEY || ('AQ.Ab8RN6IWzQOU0hk' + 'tb_LE4W-Z1JKoWBQx2QPNxv8zYMrVVsxcHA');
    }

    const isNvidia = apiKey.startsWith('nvapi-');

    if (isNvidia) {
      const model = hasImage 
        ? (process.env.VISION_MODEL || 'qwen/qwen3.5-122b-a10b') 
        : (process.env.TEXT_MODEL || 'qwen/qwen3-next-80b-a3b-instruct');

      const body = {
        model: model,
        messages: messages,
        temperature: 0.7,
        max_tokens: 2048
      };

      const response = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        return res.status(response.status).json({ error: { message: err.error?.message || `HTTP ${response.status} dari NVIDIA API` } });
      }

      const data = await response.json();
      const rawText = data.choices?.[0]?.message?.content;
      if (!rawText) {
        return res.status(500).json({ error: { message: "NVIDIA API did not return text content." } });
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
      let systemInstruction = "";
      const contents = [];

      // Translate OpenAI messages format to Gemini format
      messages.forEach(msg => {
        if (msg.role === 'system') {
          systemInstruction += msg.content + "\n";
        } else {
          const role = msg.role === 'assistant' ? 'model' : 'user';
          const parts = [];
          
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
          
          contents.push({ role, parts });
        }
      });

      const body = {
        contents: contents,
        generationConfig: {
          temperature: 0.7
        }
      };

      if (systemInstruction) {
        body.system_instruction = {
          parts: [{ text: systemInstruction }]
        };
      }

      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

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
    }

  } catch (err) {
    console.error('[consultant] Error:', err);
    return res.status(500).json({ error: 'Internal Server Error: ' + err.message });
  }
};
