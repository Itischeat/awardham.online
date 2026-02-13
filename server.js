const express = require('express');
const cors = require('cors');
const path = require('path');
const { parseAllDiplomas } = require('./parser/index');
const { clearCache, getCacheInfo } = require('./parser/cache');

const app = express();
const PORT = process.env.PORT || 3000;
const APP_VERSION = require('./package.json').version;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Хранилище активных сессий парсинга
const parsingSessions = new Map();

// Лимит одновременных парсингов (каждый запускает Chromium ~300-500 МБ RAM)
const MAX_CONCURRENT = parseInt(process.env.MAX_CONCURRENT) || 2;
let activeParsings = 0;

// Heartbeat: если клиент не шлёт пинг 90 секунд — сессия считается брошенной
const HEARTBEAT_TIMEOUT = 90 * 1000;

// API: Начать проверку позывного
app.post('/api/check-callsign', async (req, res) => {
    const { callsign } = req.body;

    if (!callsign || callsign.trim().length === 0) {
        return res.status(400).json({ error: 'Позывной не указан' });
    }

    // Проверяем лимит одновременных парсингов
    if (activeParsings >= MAX_CONCURRENT) {
        return res.status(429).json({
            error: `Сервер занят. Сейчас выполняется ${activeParsings} парсинг(ов). Попробуйте через несколько минут.`,
            activeParsings,
            maxConcurrent: MAX_CONCURRENT
        });
    }

    const normalizedCallsign = callsign.trim().toUpperCase();
    const sessionId = `${normalizedCallsign}_${Date.now()}`;

    // Создаём сессию парсинга
    parsingSessions.set(sessionId, {
        callsign: normalizedCallsign,
        status: 'started',
        progress: 0,
        totalDiplomas: 0,
        checkedDiplomas: 0,
        currentCategory: '',
        results: [],
        error: null,
        startTime: Date.now(),
        lastHeartbeat: Date.now(),
        abortController: new AbortController()
    });

    res.json({
        sessionId,
        message: `Начинаем проверку позывного ${normalizedCallsign}`
    });

    // Запускаем парсинг асинхронно
    runParsing(sessionId, normalizedCallsign);
});

// API: Получить статус парсинга
app.get('/api/status/:sessionId', (req, res) => {
    const { sessionId } = req.params;
    const session = parsingSessions.get(sessionId);

    if (!session) {
        return res.status(404).json({ error: 'Сессия не найдена' });
    }

    // Обновляем heartbeat при каждом запросе статуса
    if (session.status === 'parsing' || session.status === 'started') {
        session.lastHeartbeat = Date.now();
    }

    // Не отправляем abortController клиенту
    const { abortController, ...sessionData } = session;
    res.json(sessionData);
});

// API: Heartbeat — клиент подтверждает что ещё на странице
app.post('/api/heartbeat/:sessionId', (req, res) => {
    const { sessionId } = req.params;
    const session = parsingSessions.get(sessionId);

    if (!session) {
        return res.status(404).json({ error: 'Сессия не найдена' });
    }

    session.lastHeartbeat = Date.now();
    res.json({ ok: true });
});

// API: Отмена парсинга (при закрытии вкладки или нажатии "Отмена")
app.post('/api/cancel/:sessionId', (req, res) => {
    const { sessionId } = req.params;
    const session = parsingSessions.get(sessionId);

    if (!session) {
        return res.status(404).json({ error: 'Сессия не найдена' });
    }

    if (session.status === 'parsing' || session.status === 'started') {
        console.log(`🛑 Клиент отменил парсинг: ${sessionId}`);
        session.abortController.abort();
    }

    res.json({ ok: true });
});

// API: Получить результаты с пагинацией
app.get('/api/results/:sessionId', (req, res) => {
    const { sessionId } = req.params;
    const { page = 1, limit = 20, filter = 'all' } = req.query;

    const session = parsingSessions.get(sessionId);

    if (!session) {
        return res.status(404).json({ error: 'Сессия не найдена' });
    }

    let results = [...session.results];

    // Фильтрация по статусу
    if (filter !== 'all') {
        results = results.filter(r => r.status === filter);
    }

    // Сортировка: полученные сверху, потом в процессе, потом не получены
    const statusOrder = { 'issued': 0, 'received': 1, 'in_progress': 2, 'not_received': 3, 'error': 4 };
    results.sort((a, b) => (statusOrder[a.status] ?? 99) - (statusOrder[b.status] ?? 99));

    // Пагинация
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const startIndex = (pageNum - 1) * limitNum;
    const endIndex = startIndex + limitNum;
    const paginatedResults = results.slice(startIndex, endIndex);

    const stats = {
        total: session.results.length,
        issued: session.results.filter(r => r.status === 'issued').length,
        received: session.results.filter(r => r.status === 'received').length,
        inProgress: session.results.filter(r => r.status === 'in_progress').length,
        notReceived: session.results.filter(r => r.status === 'not_received').length,
        errors: session.results.filter(r => r.status === 'error').length
    };

    res.json({
        results: paginatedResults,
        pagination: {
            page: pageNum,
            limit: limitNum,
            totalItems: results.length,
            totalPages: Math.ceil(results.length / limitNum)
        },
        stats,
        isCompleted: session.status === 'completed' || session.status === 'error'
    });
});

// Функция асинхронного запуска парсинга
async function runParsing(sessionId, callsign) {
    const session = parsingSessions.get(sessionId);
    activeParsings++;
    console.log(`🔄 Активных парсингов: ${activeParsings}/${MAX_CONCURRENT}`);

    try {
        session.status = 'parsing';

        await parseAllDiplomas(callsign, {
            onProgress: (progress) => {
                session.progress = progress.percent;
                session.totalDiplomas = progress.total;
                session.checkedDiplomas = progress.checked;
                session.currentCategory = progress.currentCategory || '';
            },
            onDiplomaResult: (result) => {
                session.results.push(result);
            }
        }, session.abortController.signal);

        session.status = 'completed';
        session.progress = 100;

        console.log(`Парсинг завершён для ${callsign}: ${session.results.length} дипломов проверено`);

    } catch (error) {
        if (error.name === 'AbortError' || session.abortController.signal.aborted) {
            console.log(`🛑 Парсинг отменён для ${callsign} (клиент отключился)`);
            session.status = 'cancelled';
            session.error = 'Парсинг отменён — клиент отключился';
        } else {
            console.error(`Ошибка парсинга для ${callsign}:`, error);
            session.status = 'error';
            session.error = error.message;
        }
    } finally {
        activeParsings--;
        console.log(`🔄 Активных парсингов: ${activeParsings}/${MAX_CONCURRENT}`);

        // Очищаем сессию через 10 минут
        setTimeout(() => {
            parsingSessions.delete(sessionId);
        }, 10 * 60 * 1000);
    }
}

// Проверка брошенных сессий каждые 15 секунд
setInterval(() => {
    const now = Date.now();
    for (const [sessionId, session] of parsingSessions) {
        if ((session.status === 'parsing' || session.status === 'started') &&
            now - session.lastHeartbeat > HEARTBEAT_TIMEOUT) {
            console.log(`💀 Сессия ${sessionId} брошена (нет heartbeat ${Math.round((now - session.lastHeartbeat) / 1000)}с)`);
            session.abortController.abort();
        }
    }
}, 15 * 1000);

// API: Статус сервера (активные парсинги)
app.get('/api/server-status', (req, res) => {
    // Пересчитываем из реальных данных — страховка от рассинхрона счётчика
    let realActive = 0;
    for (const session of parsingSessions.values()) {
        if (session.status === 'parsing' || session.status === 'started') {
            realActive++;
        }
    }

    if (activeParsings !== realActive) {
        console.log(`⚠️ Счётчик рассинхронизирован: ${activeParsings} → ${realActive}`);
        activeParsings = realActive;
    }

    res.json({
        activeParsings,
        maxConcurrent: MAX_CONCURRENT,
        isBusy: activeParsings >= MAX_CONCURRENT,
        version: APP_VERSION
    });
});

// Проверка доступности hamlog.online
let originStatus = { online: true, lastCheck: 0, responseTime: 0 };
const ORIGIN_CHECK_INTERVAL = 30 * 1000; // Проверяем каждые 30 секунд

async function checkOriginHealth() {
    try {
        const start = Date.now();
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);

        const response = await fetch('https://hamlog.online', {
            method: 'HEAD',
            signal: controller.signal
        });
        clearTimeout(timeout);

        originStatus = {
            online: response.ok,
            lastCheck: Date.now(),
            responseTime: Date.now() - start
        };
    } catch (error) {
        originStatus = {
            online: false,
            lastCheck: Date.now(),
            responseTime: 0,
            error: error.message
        };
    }
}

// Проверяем при старте и потом каждые 30с
checkOriginHealth();
setInterval(checkOriginHealth, ORIGIN_CHECK_INTERVAL);

app.get('/api/origin-status', (req, res) => {
    res.json(originStatus);
});

// Главная страница
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API: Очистить кэш дипломов
app.post('/api/cache/clear', async (req, res) => {
    try {
        const success = await clearCache();
        if (success) {
            res.json({ success: true, message: 'Кэш очищен' });
        } else {
            res.json({ success: false, message: 'Redis недоступен' });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// API: Информация о кэше
app.get('/api/cache/info', async (req, res) => {
    try {
        const info = await getCacheInfo();
        res.json(info || { exists: false, message: 'Redis недоступен' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Сервер запущен на http://localhost:${PORT}`);
    console.log(`📡 Ham Radio Diplomas Parser готов к работе`);
});
