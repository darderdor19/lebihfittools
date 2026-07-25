// ====================================================
// VERCEL SERVERLESS FUNCTION — Admin Stats & Key Balance
// GET /api/admin
// ====================================================

const { getFirebase, safe } = require('../lib/firebase');

module.exports = async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const email = req.query.email;
    if (!email) {
      return res.status(401).json({ error: 'Email parameter required' });
    }

    const safeEmail = safe(email.replace(/"/g, '').trim().toLowerCase());
    
    // Server-side Admin Authorization check using Firebase Realtime DB
    const isAdmin = await getFirebase(`admins/${safeEmail}`);
    if (email.toLowerCase() !== 'jadilebihfit@gmail.com' && isAdmin !== true) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    // Resolve API Keys from Vercel env
    const textKey = process.env.API_KEY_TEXT || process.env.OPENAI_API_KEY || process.env.API_KEY_IMAGE || process.env.GEMINI_API_KEY;
    const imageKey = process.env.API_KEY_IMAGE || process.env.GEMINI_API_KEY || process.env.API_KEY_TEXT || process.env.OPENAI_API_KEY;

    // Check key status concurrently
    const [textKeyStatus, imageKeyStatus] = await Promise.all([
      checkKeyStatus(textKey, false),
      checkKeyStatus(imageKey, true)
    ]);

    // Return status along with environment configs
    return res.status(200).json({
      textKey: {
        ...textKeyStatus,
        model: process.env.TEXT_MODEL || 'gpt-4o-mini',
        endpoint: process.env.TEXT_API_ENDPOINT || 'https://api.openai.com/v1/chat/completions'
      },
      imageKey: {
        ...imageKeyStatus,
        model: process.env.VISION_MODEL || 'gemini-2.5-flash',
        endpoint: process.env.VISION_API_ENDPOINT || 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions'
      }
    });

  } catch (err) {
    console.error('[admin] API failed:', err);
    return res.status(500).json({ error: { message: err.message } });
  }
};

async function checkKeyStatus(apiKey, isVision) {
  if (!apiKey) {
    return { provider: 'None', status: 'Not Configured', balance: 'N/A', detail: '' };
  }

  const isGoogleKey = apiKey.startsWith('AIzaSy');
  const isOpenRouterKey = apiKey.startsWith('sk-or-');
  const isOpenAIKey = apiKey.startsWith('sk-') && !isOpenRouterKey;

  let provider = 'Unknown';
  let status = 'Inactive';
  let balance = 'N/A';
  let detail = '';

  if (isOpenRouterKey) {
    provider = 'OpenRouter';
    try {
      const resp = await fetch('https://openrouter.ai/api/v1/auth/key', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`
        }
      });
      if (resp.ok) {
        const data = await resp.json();
        status = data.data?.is_active ? 'Active' : 'Inactive';
        const limit = data.data?.limit;
        const usage = data.data?.usage;
        if (limit === null || limit === undefined) {
          balance = 'Unlimited';
        } else {
          const remaining = limit - usage;
          balance = `$${remaining.toFixed(4)} remaining`;
        }
        detail = data.data?.label || '';
      } else {
        status = 'Error (' + resp.status + ')';
      }
    } catch (e) {
      status = 'Fetch Error';
      detail = e.message;
    }
  } else if (isGoogleKey) {
    provider = 'Gemini';
    try {
      const modelName = 'gemini-2.5-flash';
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'ping' }] }],
          generationConfig: { maxOutputTokens: 1 }
        })
      });
      if (resp.ok) {
        status = 'Active';
        balance = 'Paid / Free (RT)';
      } else {
        const err = await resp.json().catch(() => ({}));
        status = 'Error (' + resp.status + ')';
        detail = err.error?.message || '';
      }
    } catch (e) {
      status = 'Fetch Error';
      detail = e.message;
    }
  } else if (isOpenAIKey) {
    provider = 'OpenAI';
    try {
      const resp = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 1
        })
      });
      if (resp.ok) {
        status = 'Active';
        balance = 'Pay-as-you-go';
      } else {
        const err = await resp.json().catch(() => ({}));
        status = 'Error (' + resp.status + ')';
        detail = err.error?.message || '';
      }
    } catch (e) {
      status = 'Fetch Error';
      detail = e.message;
    }
  } else {
    provider = 'Custom / Nvidia';
    try {
      const endpoint = isVision 
        ? (process.env.VISION_API_ENDPOINT || 'https://api.openai.com/v1/chat/completions')
        : (process.env.TEXT_API_ENDPOINT || 'https://api.openai.com/v1/chat/completions');
      const model = isVision ? (process.env.VISION_MODEL || 'gemini-2.5-flash') : (process.env.TEXT_MODEL || 'gpt-4o-mini');
      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: model,
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 1
        })
      });
      if (resp.ok) {
        status = 'Active';
      } else {
        status = 'Error (' + resp.status + ')';
      }
    } catch (e) {
      status = 'Fetch Error';
    }
  }

  return { provider, status, balance, detail };
}
