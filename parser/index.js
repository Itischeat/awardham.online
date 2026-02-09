const puppeteer = require('puppeteer');
const { parseClubAwards } = require('./clubAwards');
const { parseTerritoryAwards } = require('./territoryAwards');
const { WorkerPool } = require('./workerPool');
const { readCache, writeCache } = require('./cache');

const BASE_URL = 'https://hamlog.online';

// Количество параллельных вкладок для проверки дипломов
const CONCURRENT_TABS = parseInt(process.env.CONCURRENT_TABS) || 2;

/**
 * Настройка страницы для проверки дипломов: блокировка ненужных ресурсов
 * @param {Page} page - Puppeteer page
 */
async function setupPage(page) {
    await page.setViewport({ width: 1920, height: 1080 });

    // Включаем перехват запросов для блокировки ресурсов
    await page.setRequestInterception(true);

    page.on('request', (req) => {
        const resourceType = req.resourceType();
        const url = req.url();

        // Блокируем: изображения, шрифты, медиа, аналитику
        const blockedTypes = ['image', 'font', 'media'];
        const blockedUrls = [
            'google-analytics',
            'googletagmanager',
            'yandex.ru/metrika',
            'mc.yandex.ru',
            'facebook.com',
            'doubleclick.net',
            'adservice',
            '.png',
            '.jpg',
            '.jpeg',
            '.gif',
            '.webp',
            '.woff',
            '.woff2',
            '.ttf'
        ];

        const isBlockedType = blockedTypes.includes(resourceType);
        const isBlockedUrl = blockedUrls.some(blocked => url.includes(blocked));

        if (isBlockedType || isBlockedUrl) {
            req.abort();
        } else {
            req.continue();
        }
    });

    // Устанавливаем таймауты
    page.setDefaultTimeout(30000);
    page.setDefaultNavigationTimeout(30000);
}

/**
 * Настройка главной страницы для сбора списка дипломов (без блокировки)
 * @param {Page} page - Puppeteer page
 */
async function setupMainPage(page) {
    await page.setViewport({ width: 1920, height: 1080 });
    page.setDefaultTimeout(60000);
    page.setDefaultNavigationTimeout(60000);
}

/**
 * Перевод названий категорий на русский
 */
function translateToRussian(text) {
    if (!text) return 'Проверка дипломов';

    const translations = {
        'Club and Regional': 'Клубные и региональные',
        'Club and Regional Awards': 'Клубные и региональные дипломы',
        'Territory Awards': 'Территориальные дипломы',
        'Territory': 'Территориальные',
        'Global and National': 'Глобальные и национальные',
        'Global and National Awards': 'Глобальные и национальные дипломы',
        'Checking diplomas': 'Проверка дипломов',
        'Processing': 'Обработка',
        'Loading': 'Загрузка'
    };

    // Ищем точное совпадение
    if (translations[text]) {
        return translations[text];
    }

    // Ищем частичное совпадение
    for (const [en, ru] of Object.entries(translations)) {
        if (text.toLowerCase().includes(en.toLowerCase())) {
            return ru;
        }
    }

    return text;
}

/**
 * Главная функция парсинга всех дипломов
 * @param {string} callsign - Позывной для проверки
 * @param {object} callbacks - Объект с колбэками
 * @param {function} callbacks.onProgress - Колбэк прогресса
 * @param {function} callbacks.onDiplomaResult - Колбэк результата диплома
 */
async function parseAllDiplomas(callsign, callbacks) {
    const { onProgress, onDiplomaResult } = callbacks;

    console.log(`🔍 Начинаем парсинг для позывного: ${callsign}`);
    console.log(`🚀 Используем ${CONCURRENT_TABS} параллельных вкладок`);

    let browser;
    try {
        browser = await puppeteer.launch({
            headless: 'new',
            protocolTimeout: 180000,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--disable-gpu',
                '--single-process',
                '--no-zygote',
                '--js-flags=--max-old-space-size=512',
                '--window-size=1920,1080'
            ]
        });

        // Сначала пробуем загрузить список дипломов из кэша
        onProgress({ percent: 0, total: 0, checked: 0, currentCategory: 'Проверка кэша...' });

        let allDiplomas = await readCache();

        if (allDiplomas && allDiplomas.length > 0) {
            console.log(`📦 Загружено из кэша: ${allDiplomas.length} дипломов`);
            onProgress({ percent: 10, total: allDiplomas.length, checked: 0, currentCategory: 'Кэш загружен!' });
        } else {
            // Кэш пуст или недоступен — собираем с сайта
            console.log('📋 Кэш недоступен, собираем дипломы с сайта...');

            // Создаём основную страницу для сбора списка дипломов (без блокировки ресурсов)
            const mainPage = await browser.newPage();
            await setupMainPage(mainPage);

            // Получаем все дипломы из вкладки 2 (Club and Regional)
            console.log('📋 Собираем клубные и региональные дипломы...');
            onProgress({ percent: 3, total: 0, checked: 0, currentCategory: 'Клубные и региональные дипломы' });

            const clubDiplomas = await parseClubAwards(mainPage, BASE_URL);
            console.log(`   Найдено ${clubDiplomas.length} клубных дипломов`);

            // Получаем все дипломы из вкладки 3 (Territory)
            console.log('📋 Собираем территориальные дипломы...');
            onProgress({ percent: 7, total: 0, checked: 0, currentCategory: 'Территориальные дипломы' });

            const territoryDiplomas = await parseTerritoryAwards(mainPage, BASE_URL);
            console.log(`   Найдено ${territoryDiplomas.length} территориальных дипломов`);

            // Закрываем основную страницу - больше не нужна
            await mainPage.close();

            // Объединяем все дипломы
            allDiplomas = [...clubDiplomas, ...territoryDiplomas];

            // Сохраняем в кэш для будущих запросов
            if (allDiplomas.length > 0) {
                await writeCache(allDiplomas);
            }

            onProgress({ percent: 10, total: allDiplomas.length, checked: 0, currentCategory: 'Список дипломов получен' });
        }

        console.log(`📊 Всего дипломов для проверки: ${allDiplomas.length}`);

        // Создаём пул параллельных страниц для проверки дипломов
        console.log(`🔧 Создаём ${CONCURRENT_TABS} параллельных вкладок...`);
        const pages = await Promise.all(
            Array(CONCURRENT_TABS).fill().map(async () => {
                const page = await browser.newPage();
                await setupPage(page);
                return page;
            })
        );
        const workerPool = new WorkerPool(pages);

        // Счётчик проверенных дипломов
        let checked = 0;
        const total = allDiplomas.length;

        // Запускаем параллельную проверку всех дипломов
        console.log(`⚡ Запускаем параллельную проверку ${total} дипломов...`);

        const checkPromises = allDiplomas.map(diploma =>
            workerPool.execute(async (page) => {
                try {
                    const results = await checkDiploma(page, diploma, callsign);
                    // checkDiploma возвращает массив результатов (по одному на каждую award карточку)
                    for (const result of results) {
                        onDiplomaResult(result);
                    }
                } catch (error) {
                    console.error(`   Ошибка проверки ${diploma.name}:`, error.message);
                    onDiplomaResult({
                        ...diploma,
                        status: 'error',
                        error: error.message,
                        awards: []
                    });
                }

                // Обновляем прогресс
                checked++;
                const percent = 10 + Math.floor((checked / total) * 90);

                // Переводим названия категорий на русский
                let categoryName = diploma.category || diploma.organization || 'Проверка дипломов';
                categoryName = translateToRussian(categoryName);

                const stats = workerPool.getStats();
                onProgress({
                    percent,
                    total,
                    checked,
                    currentCategory: `${categoryName} (${stats.active} активных)`
                });
            })
        );

        // Ждём завершения всех проверок
        await Promise.all(checkPromises);

        console.log('✅ Парсинг завершён');

    } finally {
        if (browser) {
            await browser.close();
        }
    }
}




/**
 * Проверка одного диплома
 * @param {Page} page - Puppeteer page
 * @param {object} diploma - Объект с информацией о дипломе
 * @param {string} callsign - Позывной
 * @returns {object} - Результат проверки
 */
async function checkDiploma(page, diploma, callsign) {
    try {
        await page.goto(diploma.url, { waitUntil: 'domcontentloaded', timeout: 30000 });

        // Ждём загрузки страницы
        await page.waitForSelector('body', { timeout: 10000 });

        // Ищем форму ввода позывного (hamlog.online использует разные варианты)
        const inputSelectors = [
            'input[name="callsign"]',
            'input[name="call"]',
            'input#callsign',
            'input#call',
            'input.form-control[type="text"]',
            'input[type="text"][placeholder*="call" i]',
            'input[type="text"][placeholder*="Call" i]',
            'input[type="text"][placeholder*="позывн" i]',
            '.callsign-input',
            'form input[type="text"]'
        ];

        let callsignInput = null;
        for (const selector of inputSelectors) {
            callsignInput = await page.$(selector);
            if (callsignInput) break;
        }

        if (callsignInput) {
            // Очищаем поле и вводим позывной
            await callsignInput.click({ clickCount: 3 });
            await callsignInput.type(callsign); // Без задержки между символами

            // Ищем кнопку отправки
            const buttonSelectors = [
                'button[type="submit"]',
                'input[type="submit"]',
                'button.btn-primary',
                'button.btn',
                '.btn-check',
                'button.submit',
                'form button'
            ];

            let submitButton = null;
            for (const selector of buttonSelectors) {
                submitButton = await page.$(selector);
                if (submitButton) break;
            }

            if (submitButton) {
                // Страница перезагружается после submit - ждём навигацию!
                await Promise.all([
                    page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }),
                    submitButton.click()
                ]).catch(() => { });
            } else {
                // Пробуем отправить форму через Enter
                await Promise.all([
                    page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }),
                    callsignInput.press('Enter')
                ]).catch(() => { });
            }

            // Ждём появления результатов (минимальная задержка)
            await page.waitForTimeout(500);

            // Парсим результаты
            return await parseResults(page, diploma, callsign);
        } else {
            // Нет формы ввода - пробуем альтернативные URL
            const urlWithCallsign = diploma.url.includes('?')
                ? `${diploma.url}&callsign=${callsign}`
                : `${diploma.url}?callsign=${callsign}`;

            await page.goto(urlWithCallsign, { waitUntil: 'domcontentloaded', timeout: 30000 });
            await page.waitForTimeout(500);

            return await parseResults(page, diploma, callsign);
        }

    } catch (error) {
        console.error(`   Ошибка при проверке ${diploma.name}:`, error.message);
        // Возвращаем массив с одним результатом ошибки (для единообразия)
        return [{
            ...diploma,
            status: 'error',
            error: error.message,
            awards: []
        }];
    }
}

/**
 * Парсинг результатов проверки
 * @param {Page} page - Puppeteer page
 * @param {object} diploma - Объект с информацией о дипломе
 * @param {string} callsign - Позывной
 * @returns {object} - Результат проверки
 */
async function parseResults(page, diploma, callsign) {
    const text = await page.evaluate(() => document.body.innerText);
    const html = await page.content();

    const awards = [];
    let status = 'not_received';
    let progress = null;

    // Проверяем наличие результата на странице (ищем заголовок "Результат CALLSIGN")
    const hasResult = text.includes(`Результат ${callsign}`) ||
        text.includes(`Result ${callsign}`) ||
        text.toLowerCase().includes(callsign.toLowerCase());

    console.log(`\n📋 Парсинг: ${diploma.name}`);
    console.log(`   hasResult: ${hasResult}`);

    if (!hasResult) {
        console.log(`   ❌ Результат не найден на странице`);
        // Результат не найден на странице
        return {
            name: diploma.name,
            url: diploma.url,
            organization: diploma.organization || null,
            category: diploma.category || null,
            status: 'not_received',
            progress: null,
            awards: [],
            callsign
        };
    }

    // Парсим карточки результатов
    const { results: cardResults, debug: debugInfo } = await page.evaluate(() => {
        const results = [];
        const debug = [];

        // HAMLOG использует Materialize CSS!
        // Классы: .card.red, .card.green, .card.teal и т.д.
        // Также: darken-1...4, lighten-1...5
        const allColoredCards = document.querySelectorAll(
            '.card.red, .card.green, .card.teal, .card.cyan, .card.amber, .card.orange,' +
            '[class*="red darken"], [class*="green darken"], [class*="teal darken"],' +
            '[class*="red lighten"], [class*="green lighten"]'
        );

        debug.push(`Materialize cards: ${allColoredCards.length}`);

        // Попробуем найти любые карточки
        const allCards = document.querySelectorAll('.card');
        debug.push(`Всего .card: ${allCards.length}`);

        // Попробуем искать по тексту "из" или "недостаточно"
        const allDivs = document.querySelectorAll('div');
        let divsWithProgress = 0;
        let firstMatch = null;
        for (const div of allDivs) {
            const text = div.innerText || '';
            if (/\d+\s*из\s*\d+/.test(text) || text.includes('недостаточно')) {
                divsWithProgress++;
                if (!firstMatch) {
                    firstMatch = {
                        tag: div.tagName,
                        class: div.className?.substring(0, 100),
                        text: text.substring(0, 150).replace(/\n/g, ' ')
                    };
                }
            }
        }
        debug.push(`DIV с прогрессом: ${divsWithProgress}`);
        if (firstMatch) {
            debug.push(`FIRST: <${firstMatch.tag} class="${firstMatch.class}"> ${firstMatch.text}`);
        }

        // Логируем часть HTML body для отладки
        const bodyHtml = document.body?.innerHTML?.substring(0, 500) || '';
        debug.push(`BODY (500 char): ${bodyHtml.replace(/\n/g, ' ')}`);

        // Логируем первые 5 карточек для отладки
        Array.from(allColoredCards).slice(0, 5).forEach((card, i) => {
            const txt = card.innerText?.substring(0, 100).replace(/\n/g, ' ') || '';
            debug.push(`[${i}] ${txt}`);
        });

        for (const card of allColoredCards) {
            const text = card.innerText || '';
            const classes = card.className || '';

            // Упрощённая проверка: ищем "из" или "out of" или "enough" в тексте
            const hasProgress = text.includes(' из ') || text.includes('out of');
            const hasIssued = text.includes('выдан') || text.includes('issued') || text.includes('awarded');
            const hasNotEnough = text.includes('недостаточно') || text.includes('enough');

            // Карточка должна содержать результат
            const isResultCard = (hasProgress || hasIssued || hasNotEnough);

            debug.push(`Card check: progress=${hasProgress}, issued=${hasIssued}, notEnough=${hasNotEnough}, result=${isResultCard}`);

            if (!isResultCard) continue;

            // Ищем название награды - обычно первая строка или h-тег
            const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
            let name = lines[0] || '';

            // Если первая строка слишком длинная или это описание - берём из h-тега
            const titleEl = card.querySelector('h1, h2, h3, h4, h5, h6, strong, b');
            if (titleEl) {
                name = titleEl.innerText.trim();
            }

            // Ищем прогресс (например "У вас: 21 из 60")
            // Ищем прогресс (RU: "У вас: 21 из 60", EN: "You have: 21 out of 60")
            const progressMatch = text.match(/[У|You]\s*[вас|have][:\s]*(\d+)\s*(из|out of)\s*(\d+)/i) ||
                text.match(/(\d+)\s*(из|out of)\s*(\d+)/i);

            let cardProgress = null;
            let current = 0;
            let total = 0;
            if (progressMatch) {
                // progressMatch[1] = current, progressMatch[3] = total (или [2] если нет "из/out of" в группах)
                current = parseInt(progressMatch[1]);
                total = parseInt(progressMatch[3] || progressMatch[2]);
                cardProgress = `${current}/${total}`;
            }

            // Определяем статус по цвету И тексту
            let cardStatus = 'not_received';

            // Materialize CSS цвета: green, teal = успех; red = неудача
            const isGreen = classes.includes('green') || classes.includes('teal') || classes.includes('cyan');
            const isRed = classes.includes('red') || classes.includes('orange') || classes.includes('amber');
            const hasIssuedText = /выдан|Успешно|issued|awarded/i.test(text);
            const hasNotEnoughStatus = /недостаточно|enough points|not enough/i.test(text);

            if (isGreen || hasIssuedText) {
                // Зелёная/бирюзовая карточка ИЛИ текст "выдан" = получено
                cardStatus = 'received';
            } else if (isRed || hasNotEnoughStatus) {
                // Красная карточка = проверяем прогресс
                if (current === 0) {
                    cardStatus = 'not_received';
                } else if (current >= total && total > 0) {
                    cardStatus = 'received';
                } else if (current > 0) {
                    cardStatus = 'in_progress';
                } else {
                    cardStatus = 'not_received';
                }
            }

            if (name && name.length > 2 && name.length < 200) {
                results.push({
                    name: name.substring(0, 100),
                    status: cardStatus,
                    progress: cardProgress,
                    text: text.substring(0, 300),
                    current: current,
                    total: total
                });
            }
        }

        return { results, debug };
    });

    // Выводим отладочную информацию
    if (debugInfo && debugInfo.length > 0) {
        debugInfo.forEach(line => console.log(`   [DEBUG] ${line}`));
    }

    // Обрабатываем найденные карточки - статус уже определён в page.evaluate
    for (const card of cardResults) {
        awards.push({
            name: card.name,
            awarded: card.status === 'received',
            progress: card.progress,
            status: card.status,
            current: card.current,
            total: card.total
        });
    }

    // Определяем общий статус на основе всех наград
    console.log(`   Найдено карточек: ${awards.length}`);

    if (awards.length > 0) {
        // Выводим первые 3 карточки для отладки
        awards.slice(0, 3).forEach((a, i) => {
            console.log(`   Card ${i}: name="${a.name?.substring(0, 30)}", awarded=${a.awarded}, progress=${a.progress}`);
        });

        // Считаем статистику по всем наградам
        let hasReceived = false;
        let hasProgress = false;
        let allZeroProgress = true;

        for (const award of awards) {
            if (award.awarded) {
                hasReceived = true;
            }
            if (award.progress) {
                // Проверяем, есть ли ненулевой прогресс
                const match = award.progress.match(/(\d+)\/(\d+)/);
                if (match) {
                    const current = parseInt(match[1]);
                    if (current > 0) {
                        hasProgress = true;
                        allZeroProgress = false;
                    }
                } else {
                    // Если формат не X/Y, считаем что есть прогресс
                    hasProgress = true;
                    allZeroProgress = false;
                }
            }
        }

        console.log(`   hasReceived=${hasReceived}, hasProgress=${hasProgress}, allZeroProgress=${allZeroProgress}`);

        // Если есть несколько наград с разными именами - возвращаем каждую отдельно
        if (awards.length > 0) {
            console.log(`   ✅ Возвращаем ${awards.length} отдельных наград`);

            return awards.map(award => ({
                name: award.name || diploma.name,
                url: diploma.url,
                organization: diploma.organization || null,
                category: diploma.category || null,
                status: award.awarded ? 'received' :
                    (award.current > 0 ? 'in_progress' : 'not_received'),
                progress: award.progress || null,
                callsign
            }));
        }
    } else {
        // Если карточки не найдены, анализируем текст страницы

        // Ищем прогресс в тексте
        const progressMatch = text.match(/У вас[:\s]*(\d+)\s*из\s*(\d+)/i) ||
            text.match(/(\d+)\s*(?:из|of|\/)\s*(\d+)/i);

        if (progressMatch) {
            const current = parseInt(progressMatch[1]);
            const total = parseInt(progressMatch[2]);
            progress = `${current}/${total}`;

            if (current === 0) {
                status = 'not_received';
            } else if (current >= total) {
                status = 'received';
            } else {
                status = 'in_progress';
            }
        } else if (/awarded|получен|выдан|congratulations|поздравляем|certificate.*issued|диплом.*выдан/i.test(text)) {
            status = 'received';
        } else if (/недостаточно|not enough/i.test(text)) {
            // "Недостаточно" без прогресса = не начато
            status = 'not_received';
        }
    }

    console.log(`   ✅ Итоговый статус: ${status}, progress: ${progress}`);

    // Возвращаем массив с одним результатом (для единообразия)
    return [{
        name: diploma.name,
        url: diploma.url,
        organization: diploma.organization || null,
        category: diploma.category || null,
        status,
        progress,
        callsign
    }];
}

module.exports = { parseAllDiplomas };
