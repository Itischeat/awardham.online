/**
 * Парсер глобальных и национальных дипломов (вкладка 1)
 * Структура: DataTables таблица + отдельные программы
 */

/**
 * Собирает все глобальные и национальные дипломы
 * @param {Page} page - Puppeteer page
 * @param {string} baseUrl - Базовый URL сайта
 * @returns {Array} - Массив дипломов
 */
async function parseGlobalAwards(page, baseUrl) {
    const diplomas = [];
    const awardsUrl = `${baseUrl}/account/awards.php`;

    try {
        // Повторные попытки при сетевых ошибках
        let retries = 3;
        let success = false;
        while (retries > 0 && !success) {
            try {
                await page.goto(awardsUrl, { waitUntil: 'networkidle2', timeout: 90000 });
                success = true;
            } catch (navError) {
                retries--;
                if (retries > 0) {
                    console.log(`   Ошибка подключения (глобальные), повтор... (осталось ${retries} попыток)`);
                    await page.waitForTimeout(3000);
                } else {
                    throw navError;
                }
            }
        }

        // Кликаем на вкладку "Global and National Awards" (она обычно активна по умолчанию)
        const globalTab = await page.$('a[href*="gnawards"], a[href*="#gnawards"]');
        if (globalTab) {
            await globalTab.click();
            await page.waitForTimeout(2000);
        }

        // Переключаем DataTables на показ ВСЕХ записей
        const showAllApplied = await page.evaluate(() => {
            const selects = document.querySelectorAll('select[name*="_length"], .dataTables_length select');

            for (const select of selects) {
                // Пробуем найти опцию "All" / "-1"
                let allOption = null;
                for (const option of select.options) {
                    if (option.value === '-1' || option.text.toLowerCase() === 'all' || option.text === 'Все') {
                        allOption = option;
                        break;
                    }
                }

                if (allOption) {
                    select.value = allOption.value;
                    select.dispatchEvent(new Event('change', { bubbles: true }));
                    return 'all_option';
                }

                // Если нет "All", ставим максимальное значение
                let maxVal = 0;
                for (const option of select.options) {
                    const v = parseInt(option.value);
                    if (v > maxVal) maxVal = v;
                }
                if (maxVal > 0) {
                    select.value = String(maxVal);
                    select.dispatchEvent(new Event('change', { bubbles: true }));
                    return 'max_option_' + maxVal;
                }
            }

            return 'no_select_found';
        });

        console.log(`   DataTables (глобальные) переключение: ${showAllApplied}`);
        await page.waitForTimeout(3000);

        // Собираем ВСЕ ссылки на дипломы со страницы
        const allLinks = await page.evaluate((baseUrl) => {
            const results = [];
            const seen = new Set();

            // Ищем все ссылки с числовым ID (дипломы из таблицы)
            const anchors = document.querySelectorAll('a[href*="/club/"], a[href*="/global/"]');

            for (const a of anchors) {
                const href = a.getAttribute('href');
                const text = a.innerText.trim();

                if (!href || !text) continue;

                // Дипломы имеют числовой ID в конце
                const isDiploma = /\/\d+\/?$/.test(href);
                if (!isDiploma) continue;

                const fullUrl = href.startsWith('http') ? href : baseUrl + href;
                if (seen.has(fullUrl)) continue;
                seen.add(fullUrl);

                // Определяем организацию из строки таблицы
                let organization = null;
                const row = a.closest('tr');
                if (row) {
                    const cells = row.querySelectorAll('td');
                    if (cells.length >= 2) {
                        const orgLink = cells[0].querySelector('a');
                        if (orgLink && orgLink !== a) {
                            organization = orgLink.innerText.trim();
                        }
                    }
                }

                results.push({
                    url: fullUrl,
                    name: text,
                    organization
                });
            }

            return results;
        }, baseUrl);

        console.log(`   Найдено ${allLinks.length} глобальных дипломов из таблицы`);

        for (const dp of allLinks) {
            if (!diplomas.some(d => d.url === dp.url)) {
                diplomas.push({
                    name: dp.name,
                    url: dp.url,
                    organization: dp.organization,
                    category: 'Global and National'
                });
            }
        }

        // Также собираем специальные программы (NECA, SIA, RAEM, GB и т.д.)
        const specialPrograms = await page.evaluate((baseUrl) => {
            const results = [];
            const seen = new Set();

            // Специальные URL-паттерны для глобальных программ
            const specialSelectors = [
                'a[href*="/neca/"]',
                'a[href*="/gb/"]',
                'a[href*="/raem/"]',
                'a[href*="/sia/"]',
                'a[href*="/geo/"]',
                'a[href*="/rrnars/"]',
                'a[href*="/thefirstinthenation/"]'
            ];

            for (const selector of specialSelectors) {
                const anchors = document.querySelectorAll(selector);
                for (const a of anchors) {
                    const href = a.getAttribute('href');
                    const text = a.innerText.trim();

                    if (!href || !text) continue;
                    // Пропускаем служебные
                    if (href.includes('/list/') || href.includes('/rules/') ||
                        href.includes('/activations/') || href.includes('/listreferences/')) continue;

                    const fullUrl = href.startsWith('http') ? href : baseUrl + href;
                    if (seen.has(fullUrl)) continue;
                    seen.add(fullUrl);

                    results.push({
                        url: fullUrl,
                        name: text
                    });
                }
            }

            return results;
        }, baseUrl);

        console.log(`   Найдено ${specialPrograms.length} специальных программ`);

        // Специальные программы не добавляем если уже есть в территориальных
        // (geo/ ссылки могут пересекаться)
        for (const sp of specialPrograms) {
            if (!diplomas.some(d => d.url === sp.url)) {
                diplomas.push({
                    name: sp.name,
                    url: sp.url,
                    organization: null,
                    category: 'Global and National'
                });
            }
        }

        // Если DataTables не показал все — пробуем пагинацию
        if (showAllApplied === 'no_select_found' || allLinks.length < 100) {
            console.log(`   Пагинация (глобальные): пробуем листать...`);
            await collectFromPagination(page, baseUrl, diplomas);
        }

    } catch (error) {
        console.error('Ошибка при парсинге глобальных дипломов:', error);
    }

    return diplomas;
}

/**
 * Собирает дипломы через пагинацию DataTables
 */
async function collectFromPagination(page, baseUrl, diplomas) {
    let pagesProcessed = 0;
    const maxPages = 20;

    while (pagesProcessed < maxPages) {
        try {
            const nextBtn = await page.$('.dataTables_paginate .next:not(.disabled), .paginate_button.next:not(.disabled)');
            if (!nextBtn) break;

            const isDisabled = await page.evaluate(el => {
                return el.classList.contains('disabled') || el.getAttribute('aria-disabled') === 'true';
            }, nextBtn);

            if (isDisabled) break;

            await nextBtn.click();
            await page.waitForTimeout(1500);

            const pageLinks = await page.evaluate((baseUrl) => {
                const results = [];
                const anchors = document.querySelectorAll('a[href*="/club/"], a[href*="/global/"]');

                for (const a of anchors) {
                    const href = a.getAttribute('href');
                    const text = a.innerText.trim();

                    if (!href || !text) continue;
                    if (!/\/\d+\/?$/.test(href)) continue;

                    const fullUrl = href.startsWith('http') ? href : baseUrl + href;

                    let organization = null;
                    const row = a.closest('tr');
                    if (row) {
                        const cells = row.querySelectorAll('td');
                        if (cells.length >= 2) {
                            const orgLink = cells[0].querySelector('a');
                            if (orgLink && orgLink !== a) {
                                organization = orgLink.innerText.trim();
                            }
                        }
                    }

                    results.push({ url: fullUrl, name: text, organization });
                }

                return results;
            }, baseUrl);

            let newCount = 0;
            for (const dp of pageLinks) {
                if (!diplomas.some(d => d.url === dp.url)) {
                    diplomas.push({
                        name: dp.name,
                        url: dp.url,
                        organization: dp.organization,
                        category: 'Global and National'
                    });
                    newCount++;
                }
            }

            pagesProcessed++;
            console.log(`   Страница ${pagesProcessed + 1} (глобальные): +${newCount} дипломов (всего ${diplomas.length})`);

            if (newCount === 0) break;

        } catch (error) {
            break;
        }
    }
}

module.exports = { parseGlobalAwards };
