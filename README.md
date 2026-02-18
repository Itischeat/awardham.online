# 📡 Ham Radio Diplomas Parser

> Автоматический парсер дипломов радиолюбителей с [hamlog.online](https://hamlog.online) с premium dark-themed интерфейсом и отслеживанием прогресса в реальном времени.

![Node.js](https://img.shields.io/badge/Node.js-22_LTS-339933?logo=nodedotjs&logoColor=white)
![Express](https://img.shields.io/badge/Express-4.x-000000?logo=express&logoColor=white)
![Puppeteer](https://img.shields.io/badge/Puppeteer-21.x-40B5A4?logo=puppeteer&logoColor=white)
![Redis](https://img.shields.io/badge/Redis-7-DC382D?logo=redis&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-yellow)
[![Demo](https://img.shields.io/badge/Demo-awardham.online-blueviolet?logo=googlechrome&logoColor=white)](https://awardham.online)

---

## 📋 Содержание

- [О проекте](#-о-проекте)
- [Возможности](#-возможности)
- [Технологии](#-технологии)
- [Быстрый старт](#-быстрый-старт)
  - [Docker (рекомендуется)](#-docker-рекомендуется)
  - [Локальная установка](#-локальная-установка)
- [Конфигурация](#-конфигурация)
- [Архитектура проекта](#-архитектура-проекта)
- [API](#-api)
- [Как это работает](#-как-это-работает)
- [Лицензия](#-лицензия)

---

## 🎯 О проекте

**Ham Radio Diplomas Parser** — это full-stack веб-приложение для автоматической проверки дипломов радиолюбителей на сайте [hamlog.online](https://hamlog.online). Введите позывной — и система автоматически проверит все доступные дипломы, отобразив детальный прогресс по каждой награде.

<p align="center">
  <em>Введите позывной → Система проверяет сотни дипломов → Получите детальный отчёт</em>
</p>

> 🌐 **Живая версия:** приложение развёрнуто и доступно по адресу **[awardham.online](https://awardham.online)**

---

## ✨ Возможности

| Функция | Описание |
|---|---|
| 🏅 **Гранулярное отслеживание** | Каждый уровень награды (Бронза, Серебро, Золото и т.д.) отображается отдельной карточкой с собственным прогресс-баром |
| ⚡ **Параллельный парсинг** | Пул из 5 воркеров обеспечивает **4–5x ускорение** по сравнению с последовательным сканированием |
| 🎨 **Multi-Framework поддержка** | Корректная работа с Bootstrap, Tailwind CSS и Materialize CSS на страницах hamlog |
| 🔄 **Кэширование (Redis)** | Каталог дипломов кэшируется на 12 часов, что исключает повторное 5–10 минутное сканирование |
| 📊 **Real-time прогресс** | Live-обновление статуса: активные воркеры, текущая категория, процент завершения |
| 🌙 **Premium тёмная тема** | Glassmorphism UI с анимированными прогресс-барами и radar-стилем загрузки |
| 🐳 **Docker** | Полностью контейнеризированный деплой одной командой (dev и production конфигурации) |
| 🛡️ **Устойчивость к ошибкам** | Retry-логика (3 попытки), обработка таймаутов и race conditions |
| 💓 **Heartbeat & отмена** | Автоматическое обнаружение брошенных сессий и возможность отмены парсинга клиентом |
| 📈 **Статистика сервера** | Мониторинг активных парсингов, среднее время выполнения, оценка ожидания слота |
| 🌐 **Health Check** | Автоматическая проверка доступности hamlog.online каждые 30 секунд |

---

## 🛠 Технологии

| Слой | Технология |
|---|---|
| **Backend** | Node.js 22 LTS, Express 4 |
| **Скрапинг** | Puppeteer (Headless Chromium) |
| **Кэш** | Redis 7 |
| **Frontend** | HTML, Vanilla CSS, Vanilla JavaScript |
| **Инфраструктура** | Docker, Docker Compose, Nginx (production) |
| **Коммуникация** | Polling API с сессионным управлением и heartbeat |

---

## 🚀 Быстрый старт

### 🐳 Docker (рекомендуется)

Самый простой способ запуска — Docker Compose, который поднимет приложение вместе с Redis:

```bash
# 1. Клонируйте репозиторий
git clone https://github.com/Itischeat/ForFather.git
cd ForFather

# 2. Запустите через Docker Compose
docker compose up -d

# 3. Откройте в браузере
# http://localhost:3000
```

Чтобы остановить:

```bash
docker compose down
```

#### Production-деплой

Для продакшена используйте отдельный конфиг с Nginx:

```bash
docker compose -f docker-compose.prod.yml up -d
```

> **💡 Примечание:** Данные Redis сохраняются в Docker volume `redis-data`, поэтому кэш дипломов переживает рестарт контейнеров.

---

### 💻 Локальная установка

#### Необходимые компоненты

- **Node.js** 22+ ([скачать](https://nodejs.org/))
- **Redis** (опционально, для кэширования — [скачать](https://redis.io/download/))
- **Google Chrome** или **Chromium** (для Puppeteer)

#### Установка и запуск

```bash
# 1. Клонируйте репозиторий
git clone https://github.com/Itischeat/ForFather.git
cd ForFather

# 2. Установите зависимости
npm install

# 3. Создайте файл окружения
cp .env.example .env

# 4. (Опционально) Запустите Redis
redis-server

# 5. Запустите приложение
npm start
```

Приложение будет доступно по адресу **http://localhost:3000**.

> **📝 Без Redis:** Приложение работает и без Redis, но каждый запуск будет заново обходить весь каталог дипломов (это занимает дополнительные 5–10 минут).

---

## ⚙ Конфигурация

Конфигурация осуществляется через переменные окружения. Скопируйте `.env.example` в `.env` и настройте:

| Переменная | По умолчанию | Описание |
|---|---|---|
| `PORT` | `3000` | Порт веб-сервера |
| `REDIS_URL` | — | URL Redis сервера. Для локальной разработки: `redis://localhost:6379`. В Docker Compose устанавливается автоматически |
| `MAX_CONCURRENT` | `2` | Максимальное количество одновременных парсингов. Каждый парсинг запускает Chromium (~300–500 МБ RAM) |

---

## 📁 Архитектура проекта

```
ForFather/
├── server.js              # Express-сервер, API endpoints, управление сессиями
├── parser/
│   ├── index.js           # Основная логика парсинга, оркестрация воркеров
│   ├── workerPool.js      # Пул параллельных Puppeteer-воркеров (5 табов)
│   ├── clubAwards.js      # Парсинг клубных и региональных наград
│   ├── territoryAwards.js # Парсинг территориальных наград
│   ├── globalAwards.js    # Парсинг глобальных наград
│   └── cache.js           # Redis кэширование каталога дипломов
├── public/
│   ├── index.html         # Главная страница приложения
│   ├── style.css          # Основные стили (glassmorphism, dark theme, анимации)
│   ├── style-retro.css    # Альтернативная ретро-тема
│   └── script.js          # Клиентская логика (polling, rendering)
├── nginx/
│   └── nginx.conf         # Конфигурация Nginx для production
├── Dockerfile             # Образ на базе node:22-slim + Chromium
├── docker-compose.yml     # Оркестрация app + Redis (dev)
├── docker-compose.prod.yml# Оркестрация app + Redis + Nginx (production)
├── .env.example           # Шаблон переменных окружения
├── package.json           # Зависимости и скрипты
└── .dockerignore          # Исключения для Docker-сборки
```

---

## 📡 API

### Начать проверку позывного

```http
POST /api/check-callsign
Content-Type: application/json

{
  "callsign": "R1ABC"
}
```

**Ответ (200):**

```json
{
  "sessionId": "R1ABC_1707500000000",
  "message": "Начинаем проверку позывного R1ABC"
}
```

**Ответ (429 — сервер занят):**

```json
{
  "error": "Сервер занят. Сейчас выполняется 2 парсинг(ов). Попробуйте через несколько минут.",
  "activeParsings": 2,
  "maxConcurrent": 2
}
```

---

### Получить статус парсинга

```http
GET /api/status/:sessionId
```

**Ответ:**

```json
{
  "callsign": "R1ABC",
  "status": "parsing",
  "progress": 42,
  "totalDiplomas": 350,
  "checkedDiplomas": 147,
  "currentCategory": "Клубные награды",
  "results": [],
  "error": null,
  "startTime": 1707500000000
}
```

---

### Heartbeat

Клиент подтверждает, что ещё на странице. Если heartbeat не приходит 90 секунд — сессия считается брошенной и парсинг отменяется.

```http
POST /api/heartbeat/:sessionId
```

---

### Отменить парсинг

```http
POST /api/cancel/:sessionId
```

---

### Получить результаты

```http
GET /api/results/:sessionId?page=1&limit=20&filter=all&sort=progress_desc
```

| Параметр | Описание | Значения |
|---|---|---|
| `page` | Номер страницы | `1`, `2`, ... |
| `limit` | Количество на странице | по умолчанию `20` |
| `filter` | Фильтр по статусу | `all`, `issued`, `received`, `in_progress`, `not_received`, `error` |
| `sort` | Сортировка | `progress_desc` (по умолчанию), `progress_asc`, `name`, `status` |

**Ответ:**

```json
{
  "results": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "totalItems": 350,
    "totalPages": 18
  },
  "stats": {
    "total": 350,
    "issued": 5,
    "received": 12,
    "inProgress": 45,
    "notReceived": 280,
    "errors": 8
  },
  "isCompleted": false
}
```

---

### Статус сервера

```http
GET /api/server-status
```

**Ответ:**

```json
{
  "activeParsings": 1,
  "maxConcurrent": 2,
  "isBusy": false,
  "version": "1.2.0",
  "avgParseTime": 180000,
  "estimatedFreeIn": null,
  "totalSamples": 15
}
```

---

### Статус hamlog.online

```http
GET /api/origin-status
```

**Ответ:**

```json
{
  "online": true,
  "lastCheck": 1707500030000,
  "responseTime": 245
}
```

---

### Управление кэшем

```http
POST /api/cache/clear     # Очистить кэш каталога дипломов
GET  /api/cache/info      # Информация о состоянии кэша
```

---

## 🔍 Как это работает

```
                          ┌─────────────────┐
                          │   Пользователь   │
                          │  вводит позывной │
                          └────────┬────────┘
                                   │
                          ┌────────▼────────┐
                          │  Express Server  │
                          │  Создаёт сессию  │
                          └────────┬────────┘
                                   │
                    ┌──────────────▼──────────────┐
                    │   Проверка кэша (Redis)     │
                    │  Каталог дипломов есть?      │
                    └──┬───────────────────────┬──┘
                  Да   │                       │  Нет
                       │              ┌────────▼────────┐
                       │              │  Discovery Phase │
                       │              │  Сбор каталога   │
                       │              │  дипломов        │
                       │              └────────┬────────┘
                       │                       │
                    ┌──▼───────────────────────▼──┐
                    │      Worker Pool (5 табов)    │
                    │  Параллельная проверка каждого│
                    │  диплома для данного позывного│
                    └──────────────┬───────────────┘
                                   │
                    ┌──────────────▼──────────────┐
                    │   Анализ результатов         │
                    │  • Bootstrap / Tailwind /     │
                    │    Materialize CSS            │
                    │  • Извлечение прогресса       │
                    │  • Определение статуса        │
                    └──────────────┬───────────────┘
                                   │
                          ┌────────▼────────┐
                          │  Polling API     │
                          │  Real-time UI    │
                          └─────────────────┘
```

### Статусы дипломов

| Статус | Значение |
|---|---|
| 🟢 `issued` | Диплом выдан |
| 🟢 `received` | Награда получена |
| 🟡 `in_progress` | Есть прогресс, но ещё не получен |
| 🔴 `not_received` | Прогресс отсутствует |
| ⚠️ `error` | Ошибка при парсинге страницы диплома |

---

## 📄 Лицензия

Этот проект распространяется под лицензией [MIT](LICENSE).

---

<p align="center">
  <sub>Создано с ❤️ для сообщества радиолюбителей</sub>
</p>
