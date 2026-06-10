// ====================================================
// VERCEL SERVERLESS FUNCTION — Telegram Webhook
// POST /api/webhook
// ====================================================
const { handleMessage, handleCallback } = require('../lib/handlers');

const TG_API = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;

// Helper to send error message to user when something crashes
async function sendErrorToUser(chatId, errMsg) {
  if (!chatId) return;
  try {
    await fetch(`${TG_API}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: `⚠️ Error: ${errMsg}\n\nCoba lagi dengan /start`,
        parse_mode: 'Markdown'
      })
    });
  } catch (e) { /* ignore */ }
}

module.exports = async function handler(req, res) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Always respond 200 immediately to Telegram (prevents retries)
  res.status(200).json({ ok: true });

  let chatId = null;
  try {
    const body = req.body;
    if (!body) return;

    // Extract chatId for error reporting
    if (body.message) chatId = body.message.chat?.id;
    else if (body.callback_query) chatId = body.callback_query.message?.chat?.id;

    console.log('Webhook received update_id:', body.update_id, 'chatId:', chatId);

    if (body.message) {
      await handleMessage(body.message);
    } else if (body.callback_query) {
      await handleCallback(body.callback_query);
    }
  } catch (err) {
    console.error('Webhook handler error:', err.message);
    console.error('Stack:', err.stack);
    // Send error to user so they know something went wrong
    await sendErrorToUser(chatId, err.message);
  }
};
