// ====================================================
// TELEGRAM API SENDER HELPER
// ====================================================
const TG_API = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;

async function callTelegram(method, payload) {
  try {
    const res = await fetch(`${TG_API}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const json = await res.json();
    if (!json.ok) {
      console.error(`Telegram ${method} error:`, JSON.stringify(json));
    }
    return json;
  } catch (e) {
    console.error(`Telegram ${method} exception:`, e.message);
    return null;
  }
}

async function sendMessage(chatId, text, keyboard = null, parseMode = 'Markdown') {
  const payload = {
    chat_id: chatId,
    text: text,
    parse_mode: parseMode
  };
  if (keyboard) payload.reply_markup = keyboard;
  return callTelegram('sendMessage', payload);
}

async function sendChatAction(chatId, action) {
  return callTelegram('sendChatAction', { chat_id: chatId, action });
}

async function answerCallback(cbId, text = '') {
  return callTelegram('answerCallbackQuery', { callback_query_id: cbId, text });
}

async function setWebhook(url) {
  return callTelegram('setWebhook', {
    url,
    allowed_updates: ['message', 'callback_query'],
    drop_pending_updates: true
  });
}

module.exports = { sendMessage, sendChatAction, answerCallback, setWebhook };
