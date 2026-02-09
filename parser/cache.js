/**
 * Модуль кэширования списка дипломов через Redis
 * Позволяет избежать повторного сбора списка дипломов с сайта
 */

const { createClient } = require('redis');

const CACHE_KEY = 'hamlog:diplomas';
const DEFAULT_TTL = 12 * 60 * 60; // 12 часов в секундах

let client = null;
let isConnected = false;

/**
 * Подключение к Redis
 * @returns {Promise<RedisClient>}
 */
async function connectRedis() {
    if (client && isConnected) {
        return client;
    }

    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

    try {
        client = createClient({ url: redisUrl });

        client.on('error', (err) => {
            console.error('🔴 Redis ошибка:', err.message);
            isConnected = false;
        });

        client.on('connect', () => {
            console.log('🔴 Redis подключён');
            isConnected = true;
        });

        client.on('disconnect', () => {
            console.log('🔴 Redis отключён');
            isConnected = false;
        });

        await client.connect();
        return client;

    } catch (error) {
        console.error('🔴 Не удалось подключиться к Redis:', error.message);
        client = null;
        isConnected = false;
        return null;
    }
}

/**
 * Прочитать кэш дипломов из Redis
 * @returns {Promise<Array|null>} - Массив дипломов или null если кэш недоступен
 */
async function readCache() {
    try {
        const redis = await connectRedis();

        if (!redis) {
            console.log('📦 Redis недоступен, кэш пропущен');
            return null;
        }

        const data = await redis.get(CACHE_KEY);

        if (!data) {
            console.log('📦 Кэш не найден в Redis');
            return null;
        }

        const diplomas = JSON.parse(data);
        console.log(`📦 Загружено из Redis: ${diplomas.length} дипломов`);
        return diplomas;

    } catch (error) {
        console.error('📦 Ошибка чтения кэша:', error.message);
        return null;
    }
}

/**
 * Сохранить кэш дипломов в Redis
 * @param {Array} diplomas - Массив дипломов для кэширования
 * @returns {Promise<boolean>} - Успешность сохранения
 */
async function writeCache(diplomas) {
    try {
        const redis = await connectRedis();

        if (!redis) {
            console.log('📦 Redis недоступен, кэш не сохранён');
            return false;
        }

        await redis.setEx(
            CACHE_KEY,
            DEFAULT_TTL,
            JSON.stringify(diplomas)
        );

        console.log(`📦 Сохранено в Redis: ${diplomas.length} дипломов (TTL: ${DEFAULT_TTL / 3600}ч)`);
        return true;

    } catch (error) {
        console.error('📦 Ошибка сохранения кэша:', error.message);
        return false;
    }
}

/**
 * Очистить кэш дипломов
 * @returns {Promise<boolean>} - Успешность очистки
 */
async function clearCache() {
    try {
        const redis = await connectRedis();

        if (!redis) {
            return false;
        }

        await redis.del(CACHE_KEY);
        console.log('📦 Кэш Redis очищен');
        return true;

    } catch (error) {
        console.error('📦 Ошибка очистки кэша:', error.message);
        return false;
    }
}

/**
 * Получить информацию о кэше
 * @returns {Promise<Object|null>}
 */
async function getCacheInfo() {
    try {
        const redis = await connectRedis();

        if (!redis) {
            return null;
        }

        const ttl = await redis.ttl(CACHE_KEY);
        const exists = ttl > 0;

        return {
            exists,
            ttlSeconds: ttl > 0 ? ttl : 0,
            ttlHours: ttl > 0 ? Math.round(ttl / 3600 * 10) / 10 : 0
        };

    } catch (error) {
        return null;
    }
}

/**
 * Закрыть соединение с Redis (при завершении приложения)
 */
async function disconnect() {
    if (client && isConnected) {
        await client.quit();
        console.log('🔴 Redis соединение закрыто');
    }
}

module.exports = {
    readCache,
    writeCache,
    clearCache,
    getCacheInfo,
    disconnect
};
