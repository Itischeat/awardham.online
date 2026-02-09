/**
 * Парсер клубных и региональных дипломов (вкладка 2)
 * Структура: Организации -> Дипломы
 */

/**
 * Собирает все клубные и региональные дипломы
 * @param {Page} page - Puppeteer page
 * @param {string} baseUrl - Базовый URL сайта
 * @returns {Array} - Массив дипломов
 */
async function parseClubAwards(page, baseUrl) {
    const diplomas = [];
    const awardsUrl = `${baseUrl}/account/awards.php`;

    try {
        await page.goto(awardsUrl, { waitUntil: 'networkidle2' });

        // Кликаем на вкладку "Club and Regional Awards"
        const clubTab = await page.$('a[href*="crawards"], a[href*="#crawards"]');
        if (clubTab) {
            await clubTab.click();
            await page.waitForTimeout(1000);
        }

        // Собираем все ссылки на организации и дипломы со страницы
        const links = await page.evaluate(() => {
            const results = [];
            const anchors = document.querySelectorAll('a[href*="/club/"], a[href*="/global/"]');

            for (const a of anchors) {
                const href = a.getAttribute('href');
                const text = a.innerText.trim();

                // Пропускаем пустые и дублирующиеся
                if (href && text && !results.some(r => r.url === href)) {
                    // Проверяем, это организация или диплом
                    // Дипломы имеют числовой ID в конце URL: /club/arck/1706/
                    const isDiploma = /\/\d+\/?$/.test(href);

                    results.push({
                        url: href,
                        name: text,
                        isDiploma
                    });
                }
            }

            return results;
        });

        // Разделяем на организации и дипломы
        const organizations = links.filter(l => !l.isDiploma && (l.url.includes('/club/') || l.url.includes('/global/')));
        const directDiplomas = links.filter(l => l.isDiploma);

        console.log(`   Найдено ${organizations.length} организаций, ${directDiplomas.length} прямых дипломов`);

        // Добавляем прямые дипломы
        for (const dp of directDiplomas) {
            diplomas.push({
                name: dp.name,
                url: dp.url.startsWith('http') ? dp.url : `${baseUrl}${dp.url}`,
                organization: null,
                category: 'Club and Regional'
            });
        }

        // Проходим по организациям и собираем их дипломы
        const uniqueOrgs = [...new Map(organizations.map(o => [o.url, o])).values()];

        for (const org of uniqueOrgs.slice(0, 150)) { // Ограничиваем для скорости
            try {
                const orgUrl = org.url.startsWith('http') ? org.url : `${baseUrl}${org.url}`;

                await page.goto(orgUrl, { waitUntil: 'networkidle2', timeout: 20000 });
                await page.waitForTimeout(500);

                // Собираем дипломы этой организации
                const orgDiplomas = await page.evaluate((baseUrl, orgName) => {
                    const results = [];
                    const anchors = document.querySelectorAll('a');

                    for (const a of anchors) {
                        const href = a.getAttribute('href');
                        const text = a.innerText.trim();

                        // Дипломы имеют числовой ID
                        if (href && text && /\/\d+\/?$/.test(href)) {
                            // Исключаем служебные ссылки
                            if (!href.includes('/list/') &&
                                !href.includes('/rules/') &&
                                !href.includes('/activations/') &&
                                !href.includes('/listreferences/')) {

                                results.push({
                                    url: href.startsWith('http') ? href : baseUrl + href,
                                    name: text,
                                    organization: orgName
                                });
                            }
                        }
                    }

                    return results;
                }, baseUrl, org.name);

                // Добавляем уникальные дипломы
                for (const dp of orgDiplomas) {
                    if (!diplomas.some(d => d.url === dp.url)) {
                        diplomas.push({
                            name: dp.name,
                            url: dp.url,
                            organization: dp.organization,
                            category: 'Club and Regional'
                        });
                    }
                }

            } catch (error) {
                console.error(`   Ошибка при парсинге организации ${org.name}:`, error.message);
            }
        }

        // Проверяем пагинацию
        await page.goto(awardsUrl, { waitUntil: 'networkidle2' });

        let currentPage = 1;
        const maxPages = 20; // Ограничение страниц пагинации

        while (currentPage < maxPages) {
            try {
                // Ищем ссылку на следующую страницу
                const nextPageLink = await page.$(`a[href*="page=${currentPage + 1}"], a.page-link:has-text("${currentPage + 1}"), .pagination a:has-text("»")`);

                if (!nextPageLink) break;

                await nextPageLink.click();
                await page.waitForTimeout(1000);
                await page.waitForNetworkIdle({ timeout: 5000 }).catch(() => { });

                // Собираем дипломы с текущей страницы
                const pageLinks = await page.evaluate((baseUrl) => {
                    const results = [];
                    const anchors = document.querySelectorAll('a');

                    for (const a of anchors) {
                        const href = a.getAttribute('href');
                        const text = a.innerText.trim();

                        if (href && text && /\/\d+\/?$/.test(href)) {
                            if (!href.includes('/list/') && !href.includes('/rules/')) {
                                results.push({
                                    url: href.startsWith('http') ? href : baseUrl + href,
                                    name: text
                                });
                            }
                        }
                    }

                    return results;
                }, baseUrl);

                for (const dp of pageLinks) {
                    if (!diplomas.some(d => d.url === dp.url)) {
                        diplomas.push({
                            name: dp.name,
                            url: dp.url,
                            organization: null,
                            category: 'Club and Regional'
                        });
                    }
                }

                currentPage++;

            } catch (error) {
                break;
            }
        }

    } catch (error) {
        console.error('Ошибка при парсинге клубных дипломов:', error);
    }

    return diplomas;
}

module.exports = { parseClubAwards };
