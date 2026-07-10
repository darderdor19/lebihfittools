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
    const { messages, json } = req.body;
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Invalid messages array' });
    }

    // Check for text food analysis prompt to inject database references
    const userMsg = messages[messages.length - 1];
    if (userMsg && typeof userMsg.content === 'string' && userMsg.content.includes('== BAHAN UTAMA & PORSI ==')) {
      const nameMatch = userMsg.content.match(/Nama Makanan:\s*([^\n]+)/i);
      if (nameMatch) {
        const foodName = nameMatch[1].trim();
        try {
          const { searchFoodDatabase } = require('../lib/foodSearch');
          const dbMatches = await searchFoodDatabase(foodName);
          if (dbMatches && dbMatches.length > 0) {
            let referenceContext = "\n\n== DATABASE REFERENCE DITEMUKAN (Gunakan angka gizi per 100g ini secara ketat untuk kalkulasi gizi makanan user): ==\n";
            dbMatches.forEach(item => {
              referenceContext += `- ${item.name}: cal ${item.cal} kcal | protein ${item.protein}g | carbs ${item.carbs}g | fat ${item.fat}g | fiber ${item.fiber}g | sugar ${item.sugar}g | sodium ${item.sodium}mg | calcium ${item.calcium}mg | iron ${item.iron}mg | vitC ${item.vitC}mg | vitD ${item.vitD}mcg | zinc ${item.zinc}mg\n`;
            });
            userMsg.content = userMsg.content.replace('== DATABASE REFERENCE (Per 100g): ==', `== DATABASE REFERENCE (Per 100g): ==${referenceContext}`);
          }
        } catch (dbErr) {
          console.error('[ai] DB search error:', dbErr);
        }
      }
    }

    // Fully NVIDIA API Setup
    const hasImage = messages.some(msg => 
      Array.isArray(msg.content) && msg.content.some(part => part.type === 'image_url')
    );
    const isVision = req.body.isVision || hasImage;

    let apiKey = isVision ? (process.env.API_KEY_IMAGE || process.env.NVIDIA_API_KEY) : (process.env.API_KEY_TEXT || process.env.NVIDIA_API_KEY);
    if (!apiKey) {
      apiKey = process.env.API_KEY_TEXT || process.env.API_KEY_IMAGE || process.env.NVIDIA_API_KEY;
    }

    if (!apiKey) {
      return res.status(500).json({ error: { message: "OpenRouter API Key not configured in environment variables (API_KEY_TEXT / API_KEY_IMAGE / NVIDIA_API_KEY)." } });
    }

    const model = isVision 
      ? (process.env.VISION_MODEL || 'google/gemini-2.5-flash') 
      : (process.env.TEXT_MODEL || 'deepseek/deepseek-v4-flash');

    const body = {
      model: model,
      messages: messages,
      temperature: json ? 0.1 : 0.2,
      max_tokens: json ? 3000 : 2048
    };
    if (json) {
      body.response_format = { type: "json_object" };
    }

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return res.status(response.status).json({ error: { message: err.error?.message || `HTTP ${response.status} dari OpenRouter API` } });
    }

    const data = await response.json();
    let rawText = data.choices?.[0]?.message?.content;
    if (!rawText) {
      return res.status(500).json({ error: { message: "OpenRouter API did not return text content." } });
    }

    // Clean up markdown code blocks if the model outputs them in JSON mode
    if (json && typeof rawText === 'string') {
      rawText = rawText.replace(/```json|```/gi, '').trim();
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
    console.error('[ai] Error:', err);
    return res.status(500).json({ error: 'Internal Server Error: ' + err.message });
  }
};
