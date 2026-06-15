// ====================================================
// VERCEL SERVERLESS FUNCTION — Dashboard AI Proxy
// POST /api/ai
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
    const { messages, model, json, isVision } = req.body;
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Invalid messages array' });
    }

    // Detect if there is any image in messages to force vision mode
    let hasImage = isVision || false;
    messages.forEach(msg => {
      if (msg.content && Array.isArray(msg.content)) {
        msg.content.forEach(part => {
          if (part.type === 'image_url') hasImage = true;
        });
      }
    });

    if (hasImage) {
      // Vision queries -> openrouter/google gemini
      const openRouterKey = process.env.OPENROUTER_API_KEY;
      if (!openRouterKey) {
        return res.status(500).json({ error: 'OPENROUTER_API_KEY is not configured on Vercel.' });
      }

      const selectedModel = model || 'google/gemini-2.5-flash';
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openRouterKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://lebihfittools.vercel.app',
          'X-Title': 'LebihFit Dashboard Vision'
        },
        body: JSON.stringify({
          model: selectedModel,
          messages: messages,
          temperature: 0.2,
          max_tokens: 3000
        })
      });

      const data = await response.json();
      return res.status(response.status).json(data);

    } else {
      // Text queries -> Groq completions
      const groqKey = process.env.GROQ_API_KEY;
      if (!groqKey) {
        return res.status(500).json({ error: 'GROQ_API_KEY is not configured on Vercel.' });
      }

      const selectedModel = model || 'llama-3.3-70b-versatile';
      const body = {
        model: selectedModel,
        messages: messages,
        temperature: 0.2,
        max_tokens: 2500
      };
      if (json) {
        body.response_format = { type: 'json_object' };
      }

      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${groqKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });

      const data = await response.json();
      return res.status(response.status).json(data);
    }

  } catch (err) {
    console.error('[ai] Error:', err);
    return res.status(500).json({ error: 'Internal Server Error: ' + err.message });
  }
};
