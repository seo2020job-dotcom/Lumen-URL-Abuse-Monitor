/**
 * Lumen URL Abuse Monitor
 * Monitors URLs for DMCA and takedown notices using the Lumen Database API
 */

// Storage keys
const STORAGE_KEYS = {
    API_KEY: 'lumen_api_key',
    URLS: 'lumen_monitored_urls',
    UPDATE_DAYS: 'lumen_update_days',
    UPDATE_HOURS: 'lumen_update_hours',
    LAST_CHECK: 'lumen_last_check',
    RESULTS: 'lumen_results'
};

// Lumen API base URL
const LUMEN_API_BASE = 'https://lumendatabase.org';

// Application state
let autoUpdateInterval = null;
let isChecking = false;

// DOM Elements
const elements = {
    apiKey: document.getElementById('api-key'),
    toggleKey: document.getElementById('toggle-key'),
    updateDays: document.getElementById('update-days'),
    updateHours: document.getElementById('update-hours'),
    frequencyText: document.getElementById('frequency-text'),
    saveSettings: document.getElementById('save-settings'),
    settingsStatus: document.getElementById('settings-status'),
    newUrl: document.getElementById('new-url'),
    addUrl: document.getElementById('add-url'),
    addUrlStatus: document.getElementById('add-url-status'),
    bulkUrls: document.getElementById('bulk-urls'),
    addBulkUrls: document.getElementById('add-bulk-urls'),
    bulkUrlStatus: document.getElementById('bulk-url-status'),
    urlsList: document.getElementById('urls-list'),
    checkAll: document.getElementById('check-all'),
    clearAll: document.getElementById('clear-all'),
    resultsContainer: document.getElementById('results-container'),
    autoUpdateStatus: document.getElementById('auto-update-status'),
    nextCheckTime: document.getElementById('next-check-time'),
    lastCheckTime: document.getElementById('last-check-time'),
    startAuto: document.getElementById('start-auto'),
    stopAuto: document.getElementById('stop-auto')
};

// Initialize the application
function init() {
    loadSettings();
    loadUrls();
    loadResults();
    setupEventListeners();
    updateFrequencyDisplay();
    updateLastCheckDisplay();
}

// Load settings from localStorage
function loadSettings() {
    const apiKey = localStorage.getItem(STORAGE_KEYS.API_KEY) || '';
    const updateDays = localStorage.getItem(STORAGE_KEYS.UPDATE_DAYS) || '0';
    const updateHours = localStorage.getItem(STORAGE_KEYS.UPDATE_HOURS) || '1';

    elements.apiKey.value = apiKey;
    elements.updateDays.value = updateDays;
    elements.updateHours.value = updateHours;
}

// Save settings to localStorage
function saveSettings() {
    const apiKey = elements.apiKey.value.trim();
    const updateDays = parseInt(elements.updateDays.value) || 0;
    const updateHours = parseInt(elements.updateHours.value) || 0;

    if (!apiKey) {
        showStatus(elements.settingsStatus, 'API key is required', 'error');
        return;
    }

    if (updateDays === 0 && updateHours === 0) {
        showStatus(elements.settingsStatus, 'Update frequency must be at least 1 hour', 'error');
        return;
    }

    localStorage.setItem(STORAGE_KEYS.API_KEY, apiKey);
    localStorage.setItem(STORAGE_KEYS.UPDATE_DAYS, updateDays.toString());
    localStorage.setItem(STORAGE_KEYS.UPDATE_HOURS, updateHours.toString());

    showStatus(elements.settingsStatus, 'Settings saved successfully!', 'success');
    updateFrequencyDisplay();

    // Restart auto-update if running
    if (autoUpdateInterval) {
        stopAutoUpdate();
        startAutoUpdate();
    }
}

// Update frequency display text
function updateFrequencyDisplay() {
    const days = parseInt(elements.updateDays.value) || 0;
    const hours = parseInt(elements.updateHours.value) || 0;

    let text = '';
    if (days > 0) {
        text += `${days} day(s)`;
        if (hours > 0) text += ' and ';
    }
    if (hours > 0 || days === 0) {
        text += `${hours} hour(s)`;
    }

    elements.frequencyText.textContent = text;
}

// Get total interval in milliseconds
function getIntervalMs() {
    const days = parseInt(localStorage.getItem(STORAGE_KEYS.UPDATE_DAYS)) || 0;
    const hours = parseInt(localStorage.getItem(STORAGE_KEYS.UPDATE_HOURS)) || 1;
    return (days * 24 * 60 * 60 * 1000) + (hours * 60 * 60 * 1000);
}

// Load monitored URLs from localStorage
function loadUrls() {
    const urls = getStoredUrls();
    renderUrlsList(urls);
}

// Get stored URLs
function getStoredUrls() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEYS.URLS)) || [];
    } catch {
        return [];
    }
}

// Save URLs to localStorage
function saveUrls(urls) {
    localStorage.setItem(STORAGE_KEYS.URLS, JSON.stringify(urls));
}

// Add a new URL
function addUrl() {
    const url = elements.newUrl.value.trim();

    if (!url) {
        showStatus(elements.addUrlStatus, 'Please enter a URL', 'error');
        return;
    }

    // Validate URL format
    try {
        new URL(url);
    } catch {
        showStatus(elements.addUrlStatus, 'Please enter a valid URL', 'error');
        return;
    }

    const urls = getStoredUrls();

    // Check for duplicates
    if (urls.some(u => u.url === url)) {
        showStatus(elements.addUrlStatus, 'URL already exists', 'error');
        return;
    }

    urls.push({
        url: url,
        addedAt: new Date().toISOString(),
        lastChecked: null
    });

    saveUrls(urls);
    renderUrlsList(urls);
    elements.newUrl.value = '';
    showStatus(elements.addUrlStatus, 'URL added successfully!', 'success');
}

// Add multiple URLs from textarea
function addBulkUrls() {
    const bulkText = elements.bulkUrls.value.trim();

    if (!bulkText) {
        showStatus(elements.bulkUrlStatus, 'Please enter at least one URL', 'error');
        return;
    }

    // Split by newlines and filter empty lines
    const lines = bulkText.split(/\r?\n/).map(line => line.trim()).filter(line => line.length > 0);

    if (lines.length === 0) {
        showStatus(elements.bulkUrlStatus, 'No valid URLs found', 'error');
        return;
    }

    const urls = getStoredUrls();
    let addedCount = 0;
    let duplicateCount = 0;
    let invalidCount = 0;

    for (const line of lines) {
        // Validate URL format
        try {
            new URL(line);
        } catch {
            invalidCount++;
            continue;
        }

        // Check for duplicates
        if (urls.some(u => u.url === line)) {
            duplicateCount++;
            continue;
        }

        urls.push({
            url: line,
            addedAt: new Date().toISOString(),
            lastChecked: null
        });
        addedCount++;
    }

    if (addedCount > 0) {
        saveUrls(urls);
        renderUrlsList(urls);
        elements.bulkUrls.value = '';

        let message = `Added ${addedCount} URL(s)`;
        if (duplicateCount > 0) message += `, ${duplicateCount} duplicate(s) skipped`;
        if (invalidCount > 0) message += `, ${invalidCount} invalid skipped`;

        showStatus(elements.bulkUrlStatus, message, 'success');
    } else {
        let message = 'No URLs added';
        if (duplicateCount > 0) message += `: ${duplicateCount} duplicate(s)`;
        if (invalidCount > 0) message += `${duplicateCount > 0 ? ',' : ':'} ${invalidCount} invalid`;

        showStatus(elements.bulkUrlStatus, message, 'error');
    }
}

// Remove a URL
function removeUrl(url) {
    let urls = getStoredUrls();
    urls = urls.filter(u => u.url !== url);
    saveUrls(urls);
    renderUrlsList(urls);

    // Also remove from results
    let results = getStoredResults();
    delete results[url];
    saveResults(results);
    renderResults(results);
}

// Render the URLs list
function renderUrlsList(urls) {
    if (urls.length === 0) {
        elements.urlsList.innerHTML = '<p class="empty-state">No URLs added yet. Add a URL above to start monitoring.</p>';
        return;
    }

    elements.urlsList.innerHTML = urls.map(item => `
        <div class="url-item">
            <div class="url-info">
                <div class="url-text">${escapeHtml(item.url)}</div>
                <div class="url-meta">
                    Added: ${formatDate(item.addedAt)}
                    ${item.lastChecked ? ` | Last checked: ${formatDate(item.lastChecked)}` : ''}
                </div>
            </div>
            <div class="url-actions">
                <button class="btn btn-secondary btn-small" onclick="checkSingleUrl('${escapeHtml(item.url)}')">Check</button>
                <button class="btn btn-danger btn-small" onclick="removeUrl('${escapeHtml(item.url)}')">Remove</button>
            </div>
        </div>
    `).join('');
}

// Clear all URLs
function clearAllUrls() {
    if (!confirm('Are you sure you want to remove all monitored URLs?')) {
        return;
    }

    saveUrls([]);
    saveResults({});
    renderUrlsList([]);
    renderResults({});
}

// Load results from localStorage
function loadResults() {
    const results = getStoredResults();
    renderResults(results);
}

// Get stored results
function getStoredResults() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEYS.RESULTS)) || {};
    } catch {
        return {};
    }
}

// Save results to localStorage
function saveResults(results) {
    localStorage.setItem(STORAGE_KEYS.RESULTS, JSON.stringify(results));
}

// Render results
function renderResults(results) {
    const urls = Object.keys(results);

    if (urls.length === 0) {
        elements.resultsContainer.innerHTML = '<p class="empty-state">No analysis results yet. Add URLs and click "Check All Now" to analyze.</p>';
        return;
    }

    elements.resultsContainer.innerHTML = urls.map(url => {
        const result = results[url];
        const statusClass = result.error ? 'warning' : (result.notices.length > 0 ? 'abused' : 'clean');
        const statusText = result.error ? 'Error' : (result.notices.length > 0 ? 'Notices Found' : 'Clean');

        let noticesHtml = '';
        if (result.notices && result.notices.length > 0) {
            noticesHtml = `
                <div class="result-notices">
                    <strong>Found ${result.notices.length} notice(s):</strong>
                    ${result.notices.slice(0, 5).map(notice => `
                        <div class="notice-item">
                            <span class="notice-type">${escapeHtml(notice.type || 'Unknown')}</span>
                            <span class="notice-date">${notice.date_received ? formatDate(notice.date_received) : 'Unknown date'}</span>
                            ${notice.title ? `<div>${escapeHtml(notice.title)}</div>` : ''}
                            <a class="notice-link" href="${LUMEN_API_BASE}/notices/${notice.id}" target="_blank">View Notice #${notice.id}</a>
                        </div>
                    `).join('')}
                    ${result.notices.length > 5 ? `<p class="notice-item">... and ${result.notices.length - 5} more notices</p>` : ''}
                </div>
            `;
        }

        return `
            <div class="result-item ${statusClass}">
                <div class="result-header">
                    <span class="result-url">${escapeHtml(url)}</span>
                    <span class="result-badge ${statusClass}">${statusText}</span>
                </div>
                <div class="result-details">
                    ${result.error
                        ? `Error: ${escapeHtml(result.error)}`
                        : `Total notices found: ${result.totalCount || 0} | Checked: ${formatDate(result.checkedAt)}`
                    }
                </div>
                ${noticesHtml}
            </div>
        `;
    }).join('');
}

// Check all URLs for abuse
async function checkAllUrls() {
    const apiKey = localStorage.getItem(STORAGE_KEYS.API_KEY);
    if (!apiKey) {
        alert('Please configure your API key first');
        return;
    }

    const urls = getStoredUrls();
    if (urls.length === 0) {
        alert('No URLs to check. Add some URLs first.');
        return;
    }

    if (isChecking) {
        alert('Check already in progress...');
        return;
    }

    isChecking = true;
    elements.checkAll.disabled = true;
    elements.checkAll.innerHTML = '<span class="loading"></span>Checking...';

    const results = getStoredResults();

    for (let i = 0; i < urls.length; i++) {
        const urlItem = urls[i];
        try {
            const result = await checkUrlForAbuse(urlItem.url, apiKey);
            results[urlItem.url] = result;

            // Update last checked time
            urls[i].lastChecked = new Date().toISOString();
        } catch (error) {
            results[urlItem.url] = {
                error: error.message,
                notices: [],
                checkedAt: new Date().toISOString()
            };
        }

        // Rate limiting: wait 1.5 seconds between requests
        if (i < urls.length - 1) {
            await sleep(1500);
        }
    }

    saveUrls(urls);
    saveResults(results);
    renderUrlsList(urls);
    renderResults(results);

    // Update last check time
    localStorage.setItem(STORAGE_KEYS.LAST_CHECK, new Date().toISOString());
    updateLastCheckDisplay();

    isChecking = false;
    elements.checkAll.disabled = false;
    elements.checkAll.innerHTML = 'Check All Now';
}

// Check a single URL
async function checkSingleUrl(url) {
    const apiKey = localStorage.getItem(STORAGE_KEYS.API_KEY);
    if (!apiKey) {
        alert('Please configure your API key first');
        return;
    }

    if (isChecking) {
        alert('Check already in progress...');
        return;
    }

    isChecking = true;

    try {
        const result = await checkUrlForAbuse(url, apiKey);
        const results = getStoredResults();
        results[url] = result;
        saveResults(results);

        // Update last checked time for this URL
        const urls = getStoredUrls();
        const urlIndex = urls.findIndex(u => u.url === url);
        if (urlIndex !== -1) {
            urls[urlIndex].lastChecked = new Date().toISOString();
            saveUrls(urls);
            renderUrlsList(urls);
        }

        renderResults(results);
    } catch (error) {
        const results = getStoredResults();
        results[url] = {
            error: error.message,
            notices: [],
            checkedAt: new Date().toISOString()
        };
        saveResults(results);
        renderResults(results);
    }

    isChecking = false;
}

// Check URL for abuse using Lumen API
async function checkUrlForAbuse(url, apiKey) {
    // Extract domain from URL for searching
    const urlObj = new URL(url);
    const domain = urlObj.hostname;
    const fullUrl = url;

    // Search for the URL in Lumen database
    const searchUrl = `${LUMEN_API_BASE}/notices/search.json?term=${encodeURIComponent(fullUrl)}&authentication_token=${encodeURIComponent(apiKey)}`;

    const response = await fetch(searchUrl, {
        method: 'GET',
        headers: {
            'Accept': 'application/json',
            'Accept-Encoding': 'gzip'
        }
    });

    if (!response.ok) {
        if (response.status === 401) {
            throw new Error('Invalid API key');
        } else if (response.status === 429) {
            throw new Error('Rate limit exceeded. Please wait and try again.');
        }
        throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();

    // Process the results
    const notices = (data.notices || []).map(notice => ({
        id: notice.id,
        type: notice.type,
        title: notice.title,
        date_received: notice.date_received,
        sender_name: notice.sender_name
    }));

    return {
        notices: notices,
        totalCount: data.meta?.total_entries || notices.length,
        checkedAt: new Date().toISOString(),
        query: fullUrl
    };
}

// Start auto-update
function startAutoUpdate() {
    const apiKey = localStorage.getItem(STORAGE_KEYS.API_KEY);
    if (!apiKey) {
        alert('Please configure your API key first');
        return;
    }

    const urls = getStoredUrls();
    if (urls.length === 0) {
        alert('No URLs to monitor. Add some URLs first.');
        return;
    }

    const intervalMs = getIntervalMs();

    // Run immediately, then at intervals
    checkAllUrls();

    autoUpdateInterval = setInterval(() => {
        checkAllUrls();
    }, intervalMs);

    updateAutoUpdateStatus(true);
    updateNextCheckTime(intervalMs);

    elements.startAuto.disabled = true;
    elements.stopAuto.disabled = false;
}

// Stop auto-update
function stopAutoUpdate() {
    if (autoUpdateInterval) {
        clearInterval(autoUpdateInterval);
        autoUpdateInterval = null;
    }

    updateAutoUpdateStatus(false);
    elements.nextCheckTime.textContent = 'N/A';

    elements.startAuto.disabled = false;
    elements.stopAuto.disabled = true;
}

// Update auto-update status display
function updateAutoUpdateStatus(running) {
    elements.autoUpdateStatus.textContent = running ? 'Running' : 'Stopped';
    elements.autoUpdateStatus.className = `status-badge ${running ? 'status-running' : 'status-stopped'}`;
}

// Update next check time display
function updateNextCheckTime(intervalMs) {
    const nextCheck = new Date(Date.now() + intervalMs);
    elements.nextCheckTime.textContent = formatDate(nextCheck.toISOString());

    // Update the next check time display periodically
    if (autoUpdateInterval) {
        setTimeout(() => {
            if (autoUpdateInterval) {
                updateNextCheckTime(intervalMs);
            }
        }, 60000); // Update every minute
    }
}

// Update last check time display
function updateLastCheckDisplay() {
    const lastCheck = localStorage.getItem(STORAGE_KEYS.LAST_CHECK);
    elements.lastCheckTime.textContent = lastCheck ? formatDate(lastCheck) : 'Never';
}

// Show status message
function showStatus(element, message, type) {
    element.textContent = message;
    element.className = `status-message ${type}`;

    setTimeout(() => {
        element.textContent = '';
        element.className = 'status-message';
    }, 3000);
}

// Format date for display
function formatDate(isoString) {
    try {
        const date = new Date(isoString);
        return date.toLocaleString();
    } catch {
        return isoString;
    }
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Sleep utility
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Setup event listeners
function setupEventListeners() {
    // Toggle API key visibility
    elements.toggleKey.addEventListener('click', () => {
        const isPassword = elements.apiKey.type === 'password';
        elements.apiKey.type = isPassword ? 'text' : 'password';
        elements.toggleKey.textContent = isPassword ? 'Hide' : 'Show';
    });

    // Update frequency display on input change
    elements.updateDays.addEventListener('input', updateFrequencyDisplay);
    elements.updateHours.addEventListener('input', updateFrequencyDisplay);

    // Save settings
    elements.saveSettings.addEventListener('click', saveSettings);

    // Add URL on button click
    elements.addUrl.addEventListener('click', addUrl);

    // Add URL on Enter key
    elements.newUrl.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            addUrl();
        }
    });

    // Add bulk URLs on button click
    elements.addBulkUrls.addEventListener('click', addBulkUrls);

    // Check all URLs
    elements.checkAll.addEventListener('click', checkAllUrls);

    // Clear all URLs
    elements.clearAll.addEventListener('click', clearAllUrls);

    // Auto-update controls
    elements.startAuto.addEventListener('click', startAutoUpdate);
    elements.stopAuto.addEventListener('click', stopAutoUpdate);
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', init);
