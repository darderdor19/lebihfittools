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

    // Check for text/photo food analysis prompt to inject database references
    const userMsg = messages[messages.length - 1];
    const msgContent = userMsg && typeof userMsg.content === 'string' ? userMsg.content : '';
    if (msgContent.includes('BAHAN UTAMA') || msgContent.includes('MAKANAN YANG DIIDENTIFIKASI DARI FOTO') || msgContent.includes('Nama Makanan')) {
      let searchQueries = [];
      
      // Extract food name or components breakdown
      const nameMatch = msgContent.match(/Nama Makanan[^\n:]*:\s*([^\n"]+)/i) || msgContent.match(/Nama\s*:\s*([^\n"]+)/i);
      if (nameMatch) searchQueries.push(nameMatch[1].replace(/^"/, '').replace(/".*$/, '').trim());

      const rincianMatch = msgContent.match(/rincian bahan\s*:\s*([^\)\n]+)/i);
      if (rincianMatch) {
        const parts = rincianMatch[1].split(',');
        parts.forEach(p => {
          const itemName = p.split(':')[0].replace(/~\d+g?/i, '').trim();
          if (itemName && itemName.length > 2) searchQueries.push(itemName);
        });
      }

      if (searchQueries.length > 0) {
        try {
          const { searchFoodDatabase } = require('../lib/foodSearch');
          let allMatches = [];
          for (const q of searchQueries) {
            const matches = await searchFoodDatabase(q);
            if (matches && matches.length > 0) {
              allMatches.push(...matches);
            }
          }
          if (allMatches.length > 0) {
            let referenceContext = "\n\n== OFFICIAL TKPI INDONESIA DATABASE (Per 100g — Wajib gunakan nilai gizi presisi ini): ==\n";
            const seen = new Set();
            allMatches.forEach(item => {
              if (!seen.has(item.name)) {
                seen.add(item.name);
                referenceContext += `- ${item.name}: cal ${item.cal} kcal | protein ${item.protein}g | carbs ${item.carbs}g | fat ${item.fat}g | fiber ${item.fiber}g | sugar ${item.sugar}g | sodium ${item.sodium}mg | calcium ${item.calcium}mg | iron ${item.iron}mg | vitC ${item.vitC}mg | vitD ${item.vitD}mcg | zinc ${item.zinc}mg\n`;
              }
            });
            
            if (userMsg.content.includes('== DATABASE REFERENCE (Per 100g MATANG): ==')) {
              userMsg.content = userMsg.content.replace('== DATABASE REFERENCE (Per 100g MATANG): ==', `== DATABASE REFERENCE (Per 100g MATANG): ==${referenceContext}`);
            } else if (userMsg.content.includes('== DATABASE REFERENCE (Per 100g): ==')) {
              userMsg.content = userMsg.content.replace('== DATABASE REFERENCE (Per 100g): ==', `== DATABASE REFERENCE (Per 100g): ==${referenceContext}`);
            } else {
              userMsg.content += referenceContext;
            }
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

    // Smart API Key Resolution — Vision uses Gemini (AIzaSy), Text uses OpenAI (sk-)
    let apiKey;
    if (isVision) {
      apiKey = process.env.API_KEY_IMAGE || process.env.GEMINI_API_KEY || process.env.API_KEY_TEXT || process.env.OPENAI_API_KEY;
    } else {
      const paidOpenAIKey = [process.env.OPENAI_API_KEY, process.env.API_KEY_TEXT, process.env.API_KEY_IMAGE].find(k => k && k.startsWith('sk-'));
      apiKey = paidOpenAIKey || process.env.API_KEY_TEXT || process.env.OPENAI_API_KEY || process.env.API_KEY_IMAGE || process.env.GEMINI_API_KEY;
    }

    if (!apiKey) {
      console.error('[ai] API Key missing!');
      return res.status(500).json({ error: { message: 'API Key belum dipasang di Vercel Environment Variables. Silakan isi API_KEY_TEXT atau API_KEY_IMAGE.' } });
    }

    // Auto-detect provider & model compatibility from API key format
    let model, apiEndpoint;
    const isGoogleKey = apiKey.startsWith('AIzaSy');
    const isOpenAIKey = apiKey.startsWith('sk-');

    if (isOpenAIKey) {
      apiEndpoint = process.env.TEXT_API_ENDPOINT || 'https://api.openai.com/v1/chat/completions';
      let targetModel = isVision ? (process.env.VISION_MODEL || 'gpt-4o-mini') : (process.env.TEXT_MODEL || 'gpt-4o-mini');
      if (targetModel.toLowerCase().includes('gemini')) {
        targetModel = 'gpt-4o-mini';
      }
      model = targetModel;
    } else if (isGoogleKey) {
      apiEndpoint = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
      let targetModel = isVision ? (process.env.VISION_MODEL || 'gemini-2.5-flash') : (process.env.TEXT_MODEL || 'gemini-2.5-flash');
      if (targetModel.toLowerCase().includes('gpt')) {
        targetModel = 'gemini-2.5-flash';
      }
      model = targetModel;
    } else {
      apiEndpoint = isVision 
        ? (process.env.VISION_API_ENDPOINT || 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions')
        : (process.env.TEXT_API_ENDPOINT || 'https://api.openai.com/v1/chat/completions');
      model = isVision ? (process.env.VISION_MODEL || 'gemini-2.5-flash') : (process.env.TEXT_MODEL || 'gpt-4o-mini');
    }

    const reqMaxTokens = req.body.max_tokens || req.body.maxTokens;
    const body = {
      model: model,
      messages: messages,
      temperature: json ? 0.1 : 0.2,
      max_tokens: reqMaxTokens || (isVision ? 3500 : (json ? 3000 : 3500))
    };
    if (json) {
      body.response_format = { type: "json_object" };
    }

    let response;
    let attempts = 0;
    const maxAttempts = 3;
    let lastErrMsg = '';

    while (attempts < maxAttempts) {
      attempts++;
      try {
        response = await fetch(apiEndpoint, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(body)
        });

        if (response.ok) break;

        const err = await response.json().catch(() => ({}));
        lastErrMsg = err.error?.message || err.message || '';
        console.error(`[ai] Upstream API error (attempt ${attempts}/${maxAttempts}):`, response.status, lastErrMsg);

        const isTransient = [500, 502, 503, 504, 429].includes(response.status) || 
                            lastErrMsg.toLowerCase().includes('overloaded') || 
                            lastErrMsg.toLowerCase().includes('quota') ||
                            lastErrMsg.toLowerCase().includes('rate') ||
                            lastErrMsg.toLowerCase().includes('busy');

        if (isTransient && attempts < maxAttempts) {
          console.warn(`[ai] Upstream API transient error (${response.status}), retrying in ${attempts * 1.5}s...`);
          await new Promise(r => setTimeout(r, attempts * 1500));
          continue;
        }
        break;
      } catch (fetchErr) {
        lastErrMsg = fetchErr.message;
        console.error(`[ai] Upstream API fetch exception (attempt ${attempts}/${maxAttempts}):`, fetchErr);
        if (attempts < maxAttempts) {
          await new Promise(r => setTimeout(r, attempts * 1500));
          continue;
        }
        break;
      }
    }

    if (!response || !response.ok) {
      const status = response ? response.status : 503;
      if (status === 429 || lastErrMsg.toLowerCase().includes('quota') || lastErrMsg.toLowerCase().includes('rate')) {
        return res.status(429).json({ error: { message: 'Sistem AI sedang banyak permintaan (Quota Exceeded / Rate Limit). Coba lagi sebentar.' } });
      }
      if (status === 503 || lastErrMsg.toLowerCase().includes('overloaded') || lastErrMsg.toLowerCase().includes('busy')) {
        return res.status(503).json({ error: { message: 'Server Google Gemini / AI sedang antre (503 Service Unavailable). Coba sebentar lagi ya bro.' } });
      }
      return res.status(status || 500).json({ error: { message: lastErrMsg || `Upstream API Error (${status})` } });
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
