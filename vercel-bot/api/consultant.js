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

    // Fully NVIDIA API Setup
    const hasImage = messages.some(msg => 
      Array.isArray(msg.content) && msg.content.some(part => part.type === 'image_url')
    );
    const apiKey = hasImage ? process.env.API_KEY_IMAGE : process.env.API_KEY_TEXT;
    if (!apiKey) {
      return res.status(500).json({ error: { message: `API Key not configured in environment variables (${hasImage ? 'API_KEY_IMAGE' : 'API_KEY_TEXT'}).` } });
    }

    const model = hasImage 
      ? (process.env.VISION_MODEL || 'gemini-2.5-flash') 
      : (process.env.TEXT_MODEL || 'deepseek-v4-flash');

    const apiEndpoint = hasImage
      ? 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions'
      : 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';

    const { stream } = req.body;
    const body = {
      model: model,
      messages: messages,
      temperature: 0.7,
      max_tokens: 4096,
      stream: !!stream
    };

    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        return res.status(response.status).json({ error: { message: err.error?.message || `HTTP ${response.status} dari AI API` } });
      }

      // Pipe response stream directly
      for await (const chunk of response.body) {
        res.write(chunk);
      }
      return res.end();
    }

    const response = await fetch(apiEndpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return res.status(response.status).json({ error: { message: err.error?.message || `HTTP ${response.status} dari AI API` } });
    }

    const data = await response.json();
    const rawText = data.choices?.[0]?.message?.content;
    if (!rawText) {
      return res.status(500).json({ error: { message: "AI API did not return text content." } });
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

  } catch (err) {
    console.error('[consultant] Error:', err);
    return res.status(500).json({ error: 'Internal Server Error: ' + err.message });
  }
};
