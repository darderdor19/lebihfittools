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
      console.error('[consultant] API Key missing:', hasImage ? 'API_KEY_IMAGE' : 'API_KEY_TEXT');
      return res.status(500).json({ error: { message: 'Layanan AI sedang tidak tersedia. Silakan coba beberapa saat lagi.' } });
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
        const rawMsg = err.error?.message || '';
        console.error('[consultant/stream] Upstream API error:', response.status, rawMsg);
        if (response.status === 429 || rawMsg.toLowerCase().includes('quota') || rawMsg.toLowerCase().includes('rate')) {
          return res.status(429).json({ error: { message: 'Sistem AI sedang banyak permintaan. Coba lagi sebentar.' } });
        }
        return res.status(502).json({ error: { message: 'Layanan AI tidak merespons. Silakan coba lagi.' } });
      }

      // Pipe response stream directly and track completion text
      let completeText = '';
      for await (const chunk of response.body) {
        res.write(chunk);
        try {
          const text = chunk.toString('utf8');
          const lines = text.split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const dataStr = line.slice(6).trim();
              if (dataStr && dataStr !== '[DONE]') {
                const parsedObj = JSON.parse(dataStr);
                const content = parsedObj.choices?.[0]?.delta?.content || '';
                completeText += content;
              }
            }
          }
        } catch (e) {
          // Silent catch to prevent breaking stream
        }
      }
      res.end();

      // Log token usage after stream ends
      try {
        const promptTokens = Math.round(JSON.stringify(messages).length / 3.5);
        const completionTokens = Math.round(completeText.length / 4.5) || 100; // fallback if parsing failed
        const userEmail = req.body.email || 'anonymous';
        const feature = hasImage ? 'ai_assistant_image' : 'ai_assistant_text';
        
        const { logTokenUsage } = require('../lib/firebase');
        logTokenUsage(userEmail, feature, promptTokens, completionTokens, model).catch(console.error);
      } catch (logErr) {
        console.error('[consultant] Stream token logging failed:', logErr);
      }
      return;
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
      const rawMsg = err.error?.message || '';
      console.error('[consultant] Upstream API error:', response.status, rawMsg);
      if (response.status === 429 || rawMsg.toLowerCase().includes('quota') || rawMsg.toLowerCase().includes('rate')) {
        return res.status(429).json({ error: { message: 'Sistem AI sedang banyak permintaan. Coba lagi sebentar.' } });
      }
      return res.status(502).json({ error: { message: 'Layanan AI tidak merespons. Silakan coba lagi.' } });
    }

    const data = await response.json();
    const rawText = data.choices?.[0]?.message?.content;
    if (!rawText) {
      console.error('[consultant] Empty content from upstream API');
      return res.status(500).json({ error: { message: 'AI tidak memberikan respons. Silakan coba lagi.' } });
    }

    // Log token usage for non-streaming response
    try {
      const usage = data.usage || {};
      const promptTokens = usage.prompt_tokens || Math.round(JSON.stringify(messages).length / 3.5);
      const completionTokens = usage.completion_tokens || Math.round(rawText.length / 4.5);
      const userEmail = req.body.email || 'anonymous';
      const feature = hasImage ? 'ai_assistant_image' : 'ai_assistant_text';

      const { logTokenUsage } = require('../lib/firebase');
      logTokenUsage(userEmail, feature, promptTokens, completionTokens, model).catch(console.error);
    } catch (logErr) {
      console.error('[consultant] Token logging failed:', logErr);
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
    return res.status(500).json({ error: { message: 'Terjadi kesalahan pada server. Silakan coba lagi.' } });
  }
};
