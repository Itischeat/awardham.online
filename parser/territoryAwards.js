/**
 * Парсер территориальных дипломов (вкладка 3)
 * Структура: Категории -> Дипломы
 */

/**
 * Собирает все территориальные дипломы
 * @param {Page} page - Puppeteer page
 * @param {string} baseUrl - Базовый URL сайта
 * @returns {Array} - Массив дипломов
 */
async function parseTerritoryAwards(page, baseUrl) {
    const diplomas = [];
    const awardsUrl = `${baseUrl}/account/awards.php`;

    try {
        // Повторные попытки при сетевых ошибках
        let retries = 3;
        let success = false;
        while (retries > 0 && !success) {
            try {
                await page.goto(awardsUrl, { waitUntil: 'networkidle2', timeout: 60000 });
                success = true;
            } catch (navError) {
                retries--;
                if (retries > 0) {
                    console.log(`   Ошибка подключения, повтор... (осталось ${retries} попыток)`);
                    await page.waitForTimeout(2000);
                } else {
                    throw navError;
                }
            }
        }

        // Кликаем на вкладку "Territory Awards"
        const territoryTab = await page.$('a[href*="tcawards"], a[href*="#tcawards"]');
        if (territoryTab) {
            await territoryTab.click();
            await page.waitForTimeout(1000);
        }

        // Собираем все ссылки на территориальные дипломы
        const links = await page.evaluate((baseUrl) => {
            const results = [];

            // Ищем все ссылки в секции территориальных дипломов
            const anchors = document.querySelectorAll('a[href*="/geo/"], a[href*="/sia/"], a[href*="/rrnars/"], a[href*="/gb/"], a[href*="/raem/"], a[href*="/neca/"]');

            for (const a of anchors) {
                const href = a.getAttribute('href');
                const text = a.innerText.trim();

                if (href && text && !results.some(r => r.url === href)) {
                    // Пропускаем служебные страницы
                    if (!href.includes('/list/') &&
                        !href.includes('/rules/') &&
                        !href.includes('/activations/') &&
                        !href.includes('/listreferences/')) {

                        results.push({
                            url: href.startsWith('http') ? href : baseUrl + href,
                            name: text
                        });
                    }
                }
            }

            return results;
        }, baseUrl);

        console.log(`   Найдено ${links.length} территориальных дипломов/категорий`);

        // Проходим по каждой ссылке и проверяем, это диплом или категория
        for (const link of links) {
            try {
                await page.goto(link.url, { waitUntil: 'networkidle2', timeout: 20000 });
                await page.waitForTimeout(500);

                // Проверяем, есть ли вложенные дипломы
                const nestedDiplomas = await page.evaluate((baseUrl, parentCategory) => {
                    const results = [];

                    // Ищем ссылки на дипломы с числовыми ID или на geo/ страницы
                    const anchors = document.querySelectorAll('a');

                    for (const a of anchors) {
                        const href = a.getAttribute('href');
                        const text = a.innerText.trim();

                        if (href && text) {
                            // Дипломы или подкатегории
                            if ((/\/\d+\/?$/.test(href) || /\/geo\/[a-z]+\/?$/i.test(href)) &&
                                !href.includes('/list/') &&
                                !href.includes('/rules/') &&
                                !href.includes('/activations/') &&
                                !href.includes('/listreferences/')) {

                                results.push({
                                    url: href.startsWith('http') ? href : baseUrl + href,
                                    name: text,
                                    category: parentCategory
                                });
                            }
                        }
                    }

                    return results;
                }, baseUrl, link.name);

                if (nestedDiplomas.length > 0) {
                    // Это категория с дипломами
                    for (const dp of nestedDiplomas) {
                        if (!diplomas.some(d => d.url === dp.url)) {
                            diplomas.push({
                                name: dp.name,
                                url: dp.url,
                                organization: null,
                                category: `Territory - ${dp.category}`
                            });
                        }
                    }
                } else {
                    // Это сам диплом
                    if (!diplomas.some(d => d.url === link.url)) {
                        diplomas.push({
                            name: link.name,
                            url: link.url,
                            organization: null,
                            category: 'Territory'
                        });
                    }
                }

            } catch (error) {
                console.error(`   Ошибка при парсинге ${link.name}:`, error.message);
                // Добавляем как диплом даже при ошибке
                if (!diplomas.some(d => d.url === link.url)) {
                    diplomas.push({
                        name: link.name,
                        url: link.url,
                        organization: null,
                        category: 'Territory'
                    });
                }
            }
        }

    } catch (error) {
        console.error('Ошибка при парсинге территориальных дипломов:', error);
    }

    return diplomas;
}

module.exports = { parseTerritoryAwards };
