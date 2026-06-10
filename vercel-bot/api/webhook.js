// ====================================================
// VERCEL SERVERLESS FUNCTION — Telegram Webhook
// POST /api/webhook
// ====================================================
const { handleMessage, handleCallback } = require('../lib/handlers');

const TG_API = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;

async function sendErrorToUser(chatId, errMsg) {
  if (!chatId) return;
  try {
    await fetch(`${TG_API}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: `⚠️ Error: ${errMsg}\n\nCoba lagi dengan /start`
      })
    });
  } catch (e) { /* ignore */ }
}

module.exports = async function handler(req, res) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let chatId = null;
  try {
    const body = req.body;
    if (!body) {
      return res.status(200).json({ ok: true });
    }

    // Extract chatId for error reporting
    if (body.message) chatId = body.message.chat?.id;
    else if (body.callback_query) chatId = body.callback_query.message?.chat?.id;

    console.log('[webhook] update_id:', body.update_id, 'chatId:', chatId, 'type:', body.message ? 'message' : body.callback_query ? 'callback' : 'other');

    // Process FIRST, then respond (critical for Vercel hobby plan)
    if (body.message) {
      await handleMessage(body.message);
    } else if (body.callback_query) {
      await handleCallback(body.callback_query);
    }

  } catch (err) {
    console.error('[webhook] ERROR:', err.message);
    console.error('[webhook] STACK:', err.stack);
    await sendErrorToUser(chatId, err.message);
  }

  // Always respond 200 to Telegram AFTER processing
  return res.status(200).json({ ok: true });
};
