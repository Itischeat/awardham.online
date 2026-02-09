/**
 * Пул воркеров для параллельной обработки страниц
 * Управляет очередью задач и распределением по доступным вкладкам браузера
 */

class WorkerPool {
    /**
     * @param {Array<Page>} pages - Массив Puppeteer страниц
     */
    constructor(pages) {
        this.pages = pages;
        this.available = [...pages];
        this.waiting = [];
        this.activeCount = 0;
    }

    /**
     * Получить свободную страницу из пула
     * Если все заняты - ждём освобождения
     * @returns {Promise<Page>}
     */
    async acquire() {
        if (this.available.length > 0) {
            this.activeCount++;
            return this.available.pop();
        }

        // Ждём освобождения страницы
        return new Promise(resolve => {
            this.waiting.push(resolve);
        });
    }

    /**
     * Вернуть страницу в пул
     * @param {Page} page - Puppeteer страница
     */
    release(page) {
        this.activeCount--;

        // Если есть ожидающие задачи - передаём им страницу
        const nextTask = this.waiting.shift();
        if (nextTask) {
            this.activeCount++;
            nextTask(page);
        } else {
            this.available.push(page);
        }
    }

    /**
     * Выполнить задачу с автоматическим управлением страницей
     * @param {Function} task - Асинхронная функция (page) => result
     * @returns {Promise<any>}
     */
    async execute(task) {
        const page = await this.acquire();
        try {
            return await task(page);
        } finally {
            this.release(page);
        }
    }

    /**
     * Получить статистику пула
     */
    getStats() {
        return {
            total: this.pages.length,
            available: this.available.length,
            active: this.activeCount,
            waiting: this.waiting.length
        };
    }
}

module.exports = { WorkerPool };
