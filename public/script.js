// ==================================================
// Ham Radio Diplomas Checker - Client-Side JavaScript
// ==================================================

// State
let currentSessionId = null;
let currentCallsign = null;
let currentPage = 1;
let livePage = 1;
let currentFilter = 'all';
let pollingInterval = null;
let isCompleted = false;
const ITEMS_PER_PAGE = 20;

// DOM Elements
const searchSection = document.getElementById('searchSection');
const progressSection = document.getElementById('progressSection');
const resultsSection = document.getElementById('resultsSection');
const searchForm = document.getElementById('searchForm');
const callsignInput = document.getElementById('callsignInput');
const searchBtn = document.getElementById('searchBtn');
const cancelBtn = document.getElementById('cancelBtn');
const newSearchBtn = document.getElementById('newSearchBtn');
const prevPageBtn = document.getElementById('prevPage');
const nextPageBtn = document.getElementById('nextPage');

// Progress Elements
const currentCallsignEl = document.getElementById('currentCallsign');
const progressBar = document.getElementById('progressBar');
const progressText = document.getElementById('progressText');
const checkedCount = document.getElementById('checkedCount');
const totalCount = document.getElementById('totalCount');
const currentCategory = document.getElementById('currentCategory');

// Live Stats Elements
const liveStatTotal = document.getElementById('liveStatTotal');
const liveStatIssued = document.getElementById('liveStatIssued');
const liveStatReceived = document.getElementById('liveStatReceived');
const liveStatProgress = document.getElementById('liveStatProgress');
const liveStatNotReceived = document.getElementById('liveStatNotReceived');
const liveStatErrors = document.getElementById('liveStatErrors');

// Live Results Elements
const liveResultsList = document.getElementById('liveResultsList');
const livePageInfo = document.getElementById('livePageInfo');
const livePrevPageBtn = document.getElementById('livePrevPage');
const liveNextPageBtn = document.getElementById('liveNextPage');

// Final Stats Elements
const statTotal = document.getElementById('statTotal');
const statIssued = document.getElementById('statIssued');
const statReceived = document.getElementById('statReceived');
const statProgress = document.getElementById('statProgress');
const statNotReceived = document.getElementById('statNotReceived');
const statErrors = document.getElementById('statErrors');
const completedCallsign = document.getElementById('completedCallsign');

// Final Results Elements
const resultsList = document.getElementById('resultsList');
const pageInfo = document.getElementById('pageInfo');

// ==================================================
// Event Listeners
// ==================================================

searchForm.addEventListener('submit', handleSearch);
cancelBtn.addEventListener('click', handleCancel);
newSearchBtn.addEventListener('click', handleNewSearch);
prevPageBtn.addEventListener('click', () => changePage(-1, false));
nextPageBtn.addEventListener('click', () => changePage(1, false));
livePrevPageBtn.addEventListener('click', () => changePage(-1, true));
liveNextPageBtn.addEventListener('click', () => changePage(1, true));

// Filter buttons in progress section
document.querySelectorAll('#progressSection .filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('#progressSection .filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentFilter = btn.dataset.filter;
        livePage = 1;
        loadLiveResults();
    });
});

// Filter buttons in final results section
document.querySelectorAll('#finalFilters .filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('#finalFilters .filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentFilter = btn.dataset.filter;
        currentPage = 1;
        loadFinalResults();
    });
});

// Auto-uppercase input
callsignInput.addEventListener('input', (e) => {
    e.target.value = e.target.value.toUpperCase();
});

// ==================================================
// Search Handler
// ==================================================

async function handleSearch(e) {
    e.preventDefault();

    const callsign = callsignInput.value.trim().toUpperCase();

    if (!callsign) {
        shakeElement(callsignInput);
        return;
    }

    // Validate callsign format (basic validation)
    if (!/^[A-Z0-9]{3,10}(\/[A-Z0-9]+)?$/.test(callsign)) {
        shakeElement(callsignInput);
        showToast('Неверный формат позывного', 'error');
        return;
    }

    try {
        searchBtn.disabled = true;
        searchBtn.querySelector('.btn-text').textContent = 'Запуск...';

        const response = await fetch('/api/check-callsign', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ callsign })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => null);
            if (response.status === 429 && errorData) {
                showToast(errorData.error, 'warning');
                searchBtn.disabled = false;
                searchBtn.querySelector('.btn-text').textContent = 'Проверить';
                return;
            }
            throw new Error(errorData?.error || 'Ошибка запуска проверки');
        }

        const data = await response.json();
        currentSessionId = data.sessionId;
        currentCallsign = callsign;
        isCompleted = false;

        // Show progress section
        showProgress(callsign);

        // Start polling for status and results
        startPolling();

    } catch (error) {
        console.error('Search error:', error);
        showToast(error.message || 'Ошибка соединения с сервером', 'error');
        searchBtn.disabled = false;
        searchBtn.querySelector('.btn-text').textContent = 'Проверить';
    }
}

// ==================================================
// Progress Tracking
// ==================================================

function showProgress(callsign) {
    searchSection.classList.add('hidden');
    progressSection.classList.remove('hidden');
    resultsSection.classList.add('hidden');

    currentCallsignEl.textContent = callsign;
    progressBar.style.width = '0%';
    progressText.textContent = '0%';
    checkedCount.textContent = '0';
    totalCount.textContent = '0';
    currentCategory.textContent = 'Подготовка...';

    // Reset live stats
    liveStatTotal.textContent = '0';
    liveStatIssued.textContent = '0';
    liveStatReceived.textContent = '0';
    liveStatProgress.textContent = '0';
    liveStatNotReceived.textContent = '0';

    // Reset live results
    liveResultsList.innerHTML = `
        <div class="empty-state">
            <div class="empty-state-icon">🔍</div>
            <h3>Поиск дипломов...</h3>
            <p>Результаты будут появляться по мере обработки</p>
        </div>
    `;

    // Reset filter
    currentFilter = 'all';
    livePage = 1;
    document.querySelectorAll('#progressSection .filter-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.filter === 'all');
    });
}

function startPolling() {
    // Clear any existing interval
    if (pollingInterval) {
        clearInterval(pollingInterval);
    }

    pollingInterval = setInterval(async () => {
        try {
            // Get status
            const statusResponse = await fetch(`/api/status/${currentSessionId}`);
            if (!statusResponse.ok) {
                throw new Error('Ошибка получения статуса');
            }
            const statusData = await statusResponse.json();
            updateProgress(statusData);

            // Get live results
            await loadLiveResults();

            if (statusData.status === 'completed' || statusData.status === 'error' || statusData.status === 'cancelled') {
                clearInterval(pollingInterval);
                pollingInterval = null;
                isCompleted = true;

                if (statusData.status === 'completed') {
                    // Update progress bar to 100%
                    progressBar.style.width = '100%';
                    progressText.textContent = '100%';

                    // Wait a moment then show final results
                    setTimeout(() => {
                        showFinalResults();
                    }, 1000);
                } else if (statusData.status === 'cancelled') {
                    showToast('Сессия была отменена', 'warning');
                    handleNewSearch();
                } else {
                    showToast('Ошибка при парсинге: ' + (statusData.error || 'Неизвестная ошибка'), 'error');
                    handleNewSearch();
                }
            }

        } catch (error) {
            console.error('Polling error:', error);
        }
    }, 1500); // Poll every 1.5 seconds
}

function updateProgress(data) {
    const percent = Math.min(data.progress || 0, 100);

    progressBar.style.width = `${percent}%`;
    progressText.textContent = `${percent}%`;
    checkedCount.textContent = data.checkedDiplomas || 0;
    totalCount.textContent = data.totalDiplomas || '?';
    currentCategory.textContent = data.currentCategory || 'Обработка...';
}

// ==================================================
// Live Results Display
// ==================================================

async function loadLiveResults() {
    try {
        const response = await fetch(
            `/api/results/${currentSessionId}?page=${livePage}&limit=${ITEMS_PER_PAGE}&filter=${currentFilter}`
        );

        if (!response.ok) {
            return;
        }

        const data = await response.json();

        // Update live stats
        updateLiveStats(data.stats);

        // Render diplomas
        renderDiplomas(liveResultsList, data.results, true);

        // Update pagination
        updateLivePagination(data.pagination);

    } catch (error) {
        console.error('Load live results error:', error);
    }
}

function updateLiveStats(stats) {
    liveStatTotal.textContent = stats.total;
    liveStatIssued.textContent = stats.issued || 0;
    liveStatReceived.textContent = stats.received;
    liveStatProgress.textContent = stats.inProgress;
    liveStatNotReceived.textContent = stats.notReceived;
    liveStatErrors.textContent = stats.errors || 0;
}

function updateLivePagination(paginationData) {
    const { page, totalPages } = paginationData;

    livePageInfo.textContent = `Страница ${page} из ${totalPages || 1}`;
    livePrevPageBtn.disabled = page <= 1;
    liveNextPageBtn.disabled = page >= totalPages;
}

// ==================================================
// Final Results Display
// ==================================================

function showFinalResults() {
    progressSection.classList.add('hidden');
    resultsSection.classList.remove('hidden');

    // Set completed callsign
    completedCallsign.textContent = currentCallsign;

    // Reset to first page and all filter
    currentPage = 1;
    currentFilter = 'all';
    document.querySelectorAll('#finalFilters .filter-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.filter === 'all');
    });

    loadFinalResults();
}

async function loadFinalResults() {
    try {
        const response = await fetch(
            `/api/results/${currentSessionId}?page=${currentPage}&limit=${ITEMS_PER_PAGE}&filter=${currentFilter}`
        );

        if (!response.ok) {
            throw new Error('Ошибка загрузки результатов');
        }

        const data = await response.json();

        // Update stats
        updateFinalStats(data.stats);

        // Render diplomas
        renderDiplomas(resultsList, data.results, false);

        // Update pagination
        updateFinalPagination(data.pagination);

    } catch (error) {
        console.error('Load final results error:', error);
        showToast('Ошибка загрузки результатов', 'error');
    }
}

function updateFinalStats(stats) {
    animateNumber(statTotal, stats.total);
    animateNumber(statIssued, stats.issued || 0);
    animateNumber(statReceived, stats.received);
    animateNumber(statProgress, stats.inProgress);
    animateNumber(statNotReceived, stats.notReceived);
    animateNumber(statErrors, stats.errors || 0);
}

function updateFinalPagination(paginationData) {
    const { page, totalPages } = paginationData;

    pageInfo.textContent = `Страница ${page} из ${totalPages || 1}`;
    prevPageBtn.disabled = page <= 1;
    nextPageBtn.disabled = page >= totalPages;
}

function animateNumber(element, target) {
    const current = parseInt(element.textContent) || 0;
    const duration = 500;
    const steps = 20;
    const increment = (target - current) / steps;
    let step = 0;

    const timer = setInterval(() => {
        step++;
        const value = Math.round(current + increment * step);
        element.textContent = value;

        if (step >= steps) {
            element.textContent = target;
            clearInterval(timer);
        }
    }, duration / steps);
}

// ==================================================
// Shared Rendering
// ==================================================

function renderDiplomas(container, diplomas, isLive) {
    if (diplomas.length === 0) {
        if (isLive) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">🔍</div>
                    <h3>Поиск дипломов...</h3>
                    <p>Результаты будут появляться по мере обработки</p>
                </div>
            `;
        } else {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">📭</div>
                    <h3>Нет результатов</h3>
                    <p>Попробуйте изменить фильтр</p>
                </div>
            `;
        }
        return;
    }

    container.innerHTML = diplomas.map(diploma => {
        // Вычисляем процент прогресса для визуального бара
        let progressPercent = 0;
        let progressText = '';
        if (diploma.progress) {
            const match = diploma.progress.match(/(\d+)\/(\d+)/);
            if (match) {
                const current = parseInt(match[1]);
                const total = parseInt(match[2]);
                progressPercent = total > 0 ? Math.round((current / total) * 100) : 0;
                progressText = `${current} / ${total}`;
            }
        }

        // Получен/Выдан = 100%
        if (diploma.status === 'received' || diploma.status === 'issued') {
            progressPercent = 100;
        }

        // Определяем цвет бара
        const barClass = (diploma.status === 'received' || diploma.status === 'issued') ? 'progress-bar-success' :
            progressPercent > 50 ? 'progress-bar-warning' : 'progress-bar-default';

        return `
        <div class="diploma-card ${diploma.status}" onclick="window.open('${diploma.url}', '_blank')">
            <div class="diploma-status-icon">
                ${getStatusIcon(diploma.status)}
            </div>
            <div class="diploma-info">
                <div class="diploma-name" title="${escapeHtml(diploma.name)}">${escapeHtml(diploma.name)}</div>
                <div class="diploma-meta">
                    ${diploma.organization ? `<span class="diploma-organization">🏛️ ${escapeHtml(diploma.organization)}</span>` : ''}
                    ${diploma.category ? `<span class="diploma-category">📁 ${escapeHtml(diploma.category)}</span>` : ''}
                </div>
                ${diploma.progress || diploma.status === 'received' || diploma.status === 'issued' ? `
                <div class="diploma-progress-bar-container">
                    <div class="diploma-progress-bar ${barClass}" style="width: ${progressPercent}%"></div>
                    <span class="diploma-progress-text">${progressText || ((diploma.status === 'received' || diploma.status === 'issued') ? 'Выполнено!' : '')}</span>
                </div>
                ` : ''}
            </div>
            <div class="diploma-status-wrapper">
                <div class="diploma-status">
                    ${getStatusText(diploma.status)}
                </div>
                ${diploma.progress ? `<div class="diploma-progress-badge">${escapeHtml(diploma.progress)}</div>` : ''}
            </div>
            <a class="diploma-link" href="${diploma.url}" target="_blank" onclick="event.stopPropagation();" title="Открыть на HAMLOG">
                🔗
            </a>
        </div>
    `}).join('');
}

function getStatusIcon(status) {
    switch (status) {
        case 'issued': return '📜';
        case 'received': return '🏆';
        case 'in_progress': return '⏳';
        case 'not_received': return '📋';
        case 'error': return '⚠️';
        default: return '❓';
    }
}

function getStatusText(status) {
    switch (status) {
        case 'issued': return 'Выдан';
        case 'received': return 'Получен';
        case 'in_progress': return 'В процессе';
        case 'not_received': return 'Не получен';
        case 'error': return 'Ошибка';
        default: return 'Неизвестно';
    }
}

function changePage(delta, isLive) {
    if (isLive) {
        livePage += delta;
        loadLiveResults();
    } else {
        currentPage += delta;
        loadFinalResults();
        resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

// ==================================================
// Cancel & New Search
// ==================================================

function handleCancel() {
    if (pollingInterval) {
        clearInterval(pollingInterval);
        pollingInterval = null;
    }

    // Уведомляем сервер об отмене
    if (currentSessionId) {
        fetch(`/api/cancel/${currentSessionId}`, { method: 'POST' }).catch(() => { });
    }

    currentSessionId = null;
    currentCallsign = null;
    handleNewSearch();
}

function handleNewSearch() {
    searchSection.classList.remove('hidden');
    progressSection.classList.add('hidden');
    resultsSection.classList.add('hidden');

    searchBtn.disabled = false;
    searchBtn.querySelector('.btn-text').textContent = 'Проверить';
    callsignInput.value = '';
    callsignInput.focus();
}

// При закрытии вкладки — отмена парсинга
window.addEventListener('beforeunload', () => {
    if (currentSessionId && !isCompleted) {
        navigator.sendBeacon(`/api/cancel/${currentSessionId}`);
    }
});

// ==================================================
// Utilities
// ==================================================

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function shakeElement(element) {
    element.style.animation = 'none';
    element.offsetHeight; // Trigger reflow
    element.style.animation = 'shake 0.5s ease';
}

function showToast(message, type = 'info') {
    // Simple toast implementation
    const toast = document.createElement('div');
    toast.style.cssText = `
        position: fixed;
        bottom: 2rem;
        left: 50%;
        transform: translateX(-50%);
        background: ${type === 'error' ? '#ef4444' : type === 'warning' ? '#f59e0b' : '#3b82f6'};
        color: white;
        padding: 1rem 2rem;
        border-radius: 8px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        z-index: 1000;
        animation: fadeIn 0.3s ease;
    `;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'fadeOut 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Add shake animation
const style = document.createElement('style');
style.textContent = `
    @keyframes shake {
        0%, 100% { transform: translateX(0); }
        25% { transform: translateX(-10px); }
        75% { transform: translateX(10px); }
    }
    @keyframes fadeIn {
        from { opacity: 0; transform: translateX(-50%) translateY(20px); }
        to { opacity: 1; transform: translateX(-50%) translateY(0); }
    }
    @keyframes fadeOut {
        from { opacity: 1; transform: translateX(-50%) translateY(0); }
        to { opacity: 0; transform: translateX(-50%) translateY(20px); }
    }
`;
document.head.appendChild(style);

// ==================================================
// Server Status Indicator
// ==================================================

const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const appVersion = document.getElementById('appVersion');
let statusInterval = null;

async function updateServerStatus() {
    try {
        const response = await fetch('/api/server-status');
        if (!response.ok) return;

        const data = await response.json();
        const { activeParsings, maxConcurrent, isBusy } = data;

        // Update dot color
        statusDot.className = 'status-dot';
        if (activeParsings === 0) {
            statusDot.classList.add('free');
            statusText.textContent = 'Сервер свободен';
        } else if (isBusy) {
            statusDot.classList.add('full');
            statusText.textContent = `Занято ${activeParsings}/${maxConcurrent} — очередь`;
        } else {
            statusDot.classList.add('busy');
            statusText.textContent = `Активно ${activeParsings}/${maxConcurrent}`;
        }

        // Обновляем версию из package.json
        if (data.version && appVersion) {
            appVersion.textContent = `v${data.version}`;
        }
    } catch (error) {
        statusText.textContent = 'Нет связи';
        statusDot.className = 'status-dot';
    }
}

function startStatusPolling() {
    updateServerStatus();
    statusInterval = setInterval(updateServerStatus, 5000);
}

// ==================================================
// Origin Health Check (hamlog.online)
// ==================================================

const originBanner = document.getElementById('originDownBanner');
let originOnline = true;

async function checkOriginStatus() {
    try {
        const response = await fetch('/api/origin-status');
        const data = await response.json();
        originOnline = data.online;

        if (!originOnline) {
            originBanner.classList.remove('hidden');
            searchBtn.disabled = true;
            searchBtn.querySelector('.btn-text').textContent = 'Источник недоступен';
        } else {
            originBanner.classList.add('hidden');
            // Восстанавливаем кнопку только если нет активного парсинга
            if (!currentSessionId) {
                searchBtn.disabled = false;
                searchBtn.querySelector('.btn-text').textContent = 'Проверить';
            }
        }
    } catch (error) {
        console.error('Origin check error:', error);
    }
}

// ==================================================
// Initialize
// ==================================================
// Changelog Popup
// ==================================================

const APP_VERSION = '1.1.0';

function checkChangelog() {
    const lastSeenVersion = localStorage.getItem('hamlog_last_version');
    const appVersionEl = document.getElementById('appVersion');

    if (appVersionEl) {
        appVersionEl.textContent = `v${APP_VERSION}`;
    }

    if (lastSeenVersion !== APP_VERSION) {
        const overlay = document.getElementById('changelogOverlay');
        const closeBtn = document.getElementById('changelogCloseBtn');

        if (overlay) {
            overlay.classList.add('active');

            closeBtn.addEventListener('click', () => {
                overlay.classList.remove('active');
                localStorage.setItem('hamlog_last_version', APP_VERSION);
            });

            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    overlay.classList.remove('active');
                    localStorage.setItem('hamlog_last_version', APP_VERSION);
                }
            });
        }
    }
}

// ==================================================
// Initialization
// ==================================================

document.addEventListener('DOMContentLoaded', () => {
    callsignInput.focus();
    startStatusPolling();
    checkOriginStatus();
    setInterval(checkOriginStatus, 30000);
    checkChangelog();
});
