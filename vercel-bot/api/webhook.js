// ====================================================
// VERCEL SERVERLESS FUNCTION — Telegram Webhook
// POST /api/webhook
// ====================================================
const { handleMessage, handleCallback } = require('../lib/handlers');

module.exports = async function handler(req, res) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Always respond 200 immediately to Telegram (prevents retries)
  res.status(200).json({ ok: true });

  try {
    const body = req.body;
    if (!body) return;

    console.log('Webhook received:', JSON.stringify(body).slice(0, 200));

    if (body.message) {
      await handleMessage(body.message);
    } else if (body.callback_query) {
      await handleCallback(body.callback_query);
    }
  } catch (err) {
    // Log error but don't crash — response already sent
    console.error('Webhook handler error:', err.message, err.stack);
  }
};
