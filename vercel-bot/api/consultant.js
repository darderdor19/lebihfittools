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

  const apiKey = process.env.GROQ_ASSISTANT_KEY || process.env.GROQ_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Neither GROQ_ASSISTANT_KEY nor GROQ_API_KEY is set in Vercel environment variables.' });
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

    const selectedModel = hasImage ? 'llama-3.2-11b-vision-preview' : (model || 'llama-3.3-70b-versatile');

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
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
  } catch (err) {
    console.error('[consultant] Error:', err);
    return res.status(500).json({ error: 'Internal Server Error: ' + err.message });
  }
};
