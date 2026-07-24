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
    const msgContent = userMsg && typeof userMsg.content === 'string' ? userMsg.content : '';
    if (msgContent.includes('== BAHAN UTAMA') && msgContent.includes('PORSI ==')) {
      const nameMatch = msgContent.match(/Nama Makanan[^\n:]*:\s*([^\n"]+)/i);
      if (nameMatch) {
        const foodName = nameMatch[1].replace(/^"/, '').replace(/".*$/, '').trim();
        try {
          const { searchFoodDatabase } = require('../lib/foodSearch');
          const dbMatches = await searchFoodDatabase(foodName);
          if (dbMatches && dbMatches.length > 0) {
            let referenceContext = "\n\n== DATABASE REFERENCE DITEMUKAN (Gunakan angka gizi per 100g ini secara ketat untuk kalkulasi gizi makanan user): ==\n";
            dbMatches.forEach(item => {
              referenceContext += `- ${item.name}: cal ${item.cal} kcal | protein ${item.protein}g | carbs ${item.carbs}g | fat ${item.fat}g | fiber ${item.fiber}g | sugar ${item.sugar}g | sodium ${item.sodium}mg | calcium ${item.calcium}mg | iron ${item.iron}mg | vitC ${item.vitC}mg | vitD ${item.vitD}mcg | zinc ${item.zinc}mg\n`;
            });
            // Inject into both old and new prompt format
            userMsg.content = userMsg.content
              .replace('== DATABASE REFERENCE (Per 100g): ==', `== DATABASE REFERENCE (Per 100g): ==${referenceContext}`)
              .replace('== PRIORITAS DATABASE (Per 100g', `== PRIORITAS DATABASE (Per 100g \u2014 DB MATCH:${referenceContext}\n\nSelebihnya (Per 100g`);
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

    const apiKey = isVision ? process.env.API_KEY_IMAGE : process.env.API_KEY_TEXT;
    if (!apiKey) {
      console.error('[ai] API Key missing:', isVision ? 'API_KEY_IMAGE' : 'API_KEY_TEXT');
      return res.status(500).json({ error: { message: 'Layanan AI sedang tidak tersedia. Silakan coba beberapa saat lagi.' } });
    }

    const model = isVision 
      ? (process.env.VISION_MODEL || 'gemini-2.5-flash') 
      : (process.env.TEXT_MODEL || 'gpt-4o-mini');

    const apiEndpoint = isVision
      ? 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions'
      : (process.env.TEXT_API_ENDPOINT || 'https://api.openai.com/v1/chat/completions');

    const body = {
      model: model,
      messages: messages,
      temperature: json ? 0.1 : 0.2,
      max_tokens: json ? 1000 : 2500
    };
    if (json) {
      body.response_format = { type: "json_object" };
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
      console.error('[ai] Upstream API error:', response.status, rawMsg);
      // Rate limit: expose safely
      if (response.status === 429 || rawMsg.toLowerCase().includes('quota') || rawMsg.toLowerCase().includes('rate')) {
        return res.status(429).json({ error: { message: 'Sistem AI sedang banyak permintaan. Coba lagi sebentar.' } });
      }
      return res.status(502).json({ error: { message: 'Layanan AI tidak merespons. Silakan coba lagi.' } });
    }

    const data = await response.json();
    let rawText = data.choices?.[0]?.message?.content;
    if (!rawText) {
      console.error('[ai] Empty content from upstream API');
      return res.status(500).json({ error: { message: 'AI tidak memberikan respons. Silakan coba lagi.' } });
    }

    // Clean up markdown code blocks if the model outputs them in JSON mode
    if (json && typeof rawText === 'string') {
      rawText = rawText.replace(/```json|```/gi, '').trim();
    }

    // Log token usage for admin tracking
    try {
      const usage = data.usage || {};
      const promptTokens = usage.prompt_tokens || 0;
      const completionTokens = usage.completion_tokens || 0;
      const userEmail = req.body.email || 'anonymous';
      
      let feature = 'dashboard_weekly';
      const lastMsg = messages[messages.length - 1];
      const msgStr = typeof lastMsg?.content === 'string' ? lastMsg.content : JSON.stringify(lastMsg?.content || '');
      
      if (isVision) {
        if (msgStr.includes('Identifikasi nama makanan')) {
          feature = 'food_scan';
        } else {
          feature = 'body_analysis';
        }
      } else if (msgStr.includes('== BAHAN UTAMA')) {
        feature = 'manual_food_ai';
      } else if (msgStr.includes('Kebutuhan Kalori Target')) {
        feature = 'calculator_demo';
      } else if (msgStr.includes('Tinggi: ') && msgStr.includes('Berat: ')) {
        feature = 'calculator_tdee';
      } else if (msgStr.includes('Tulis evaluasi dalam HTML')) {
        feature = 'dashboard_daily';
      }

      const { logTokenUsage } = require('../lib/firebase');
      logTokenUsage(userEmail, feature, promptTokens, completionTokens, model).catch(console.error);
    } catch (logErr) {
      console.error('[ai] Token logging failed:', logErr);
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
    return res.status(500).json({ error: { message: 'Terjadi kesalahan pada server. Silakan coba lagi.' } });
  }
};
