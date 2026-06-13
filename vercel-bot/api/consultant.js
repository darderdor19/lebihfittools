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

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'OPENROUTER_API_KEY is not set in Vercel environment variables.' });
  }

  try {
    const { messages, model } = req.body;
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Invalid messages array' });
    }

    const selectedModel = model || 'google/gemini-2.5-pro';

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://lebihfittools.vercel.app',
        'X-Title': 'LebihFit AI Consultant'
      },
      body: JSON.stringify({
        model: selectedModel,
        messages: messages,
        temperature: 0.7
      })
    });

    const data = await response.json();
    return res.status(200).json(data);
  } catch (err) {
    console.error('[consultant] Error:', err);
    return res.status(500).json({ error: 'Internal Server Error: ' + err.message });
  }
};
