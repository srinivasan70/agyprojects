/**
 * BigQuery Release Explorer - Client Side Logic
 */

// Application State
const state = {
    releases: [],
    activeFilter: 'all',
    searchQuery: '',
    theme: 'dark'
};

// DOM Elements
const themeToggle = document.getElementById('themeToggle');
const refreshBtn = document.getElementById('refreshBtn');
const refreshIcon = document.getElementById('refreshIcon');
const syncStatus = document.getElementById('syncStatus');
const statusDot = syncStatus.querySelector('.status-dot');
const statusText = syncStatus.querySelector('.status-text');
const searchInput = document.getElementById('searchInput');
const clearSearchBtn = document.getElementById('clearSearchBtn');
const filterPills = document.querySelectorAll('.filter-pill');
const statCards = document.querySelectorAll('.stat-card');
const timelineFeed = document.getElementById('timelineFeed');
const loader = document.getElementById('loader');
const emptyState = document.getElementById('emptyState');
const statusToast = document.getElementById('statusToast');
const resetFiltersBtn = document.getElementById('resetFiltersBtn');

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    fetchReleases();
    setupEventListeners();
});

// Theme Logic
function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    setTheme(savedTheme);
}

function setTheme(theme) {
    state.theme = theme;
    localStorage.setItem('theme', theme);
    
    if (theme === 'dark') {
        document.body.classList.remove('light-theme');
        document.body.classList.add('dark-theme');
    } else {
        document.body.classList.remove('dark-theme');
        document.body.classList.add('light-theme');
    }
}

function toggleTheme() {
    const nextTheme = state.theme === 'dark' ? 'light' : 'dark';
    
    // Animate transition using simple rotation classes
    const svgIcon = themeToggle.querySelector('.icon:not([style*="display: none"])');
    if (svgIcon) {
        svgIcon.style.transform = 'rotate(180deg)';
    }
    
    setTimeout(() => {
        setTheme(nextTheme);
        if (svgIcon) {
            svgIcon.style.transform = '';
        }
    }, 150);
}

// Fetch Release Notes
async function fetchReleases(forceRefresh = false) {
    showLoader(true);
    setSyncStatus('loading', forceRefresh ? 'Refreshing feed...' : 'Fetching feed...');
    
    try {
        const url = `/api/releases${forceRefresh ? '?refresh=true' : ''}`;
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.status === 'success') {
            state.releases = data.releases;
            
            // Format Last Updated Text
            const timeStr = data.last_updated.split(' ')[1] || '';
            setSyncStatus('active', `Synced at ${timeStr}`);
            
            if (forceRefresh) {
                showToast('Feed refreshed successfully!');
            }
            
            // Update Filter and Display
            filterAndRender();
        } else {
            throw new Error(data.message || 'Unknown server error');
        }
    } catch (error) {
        console.error('Error fetching release notes:', error);
        setSyncStatus('error', 'Sync Failed');
        showToast('Error syncing feed: ' + error.message, true);
        
        if (state.releases.length === 0) {
            timelineFeed.innerHTML = `
                <div class="empty-state">
                    <h3>Connection Error</h3>
                    <p>We encountered an error fetching the release notes. Please check your network or try again.</p>
                    <button class="btn btn-primary" onclick="fetchReleases(true)">Retry Fetch</button>
                </div>
            `;
        }
    } finally {
        showLoader(false);
        refreshBtn.classList.remove('refreshing');
    }
}

// Sync Status Indicator helper
function setSyncStatus(type, message) {
    statusDot.className = 'status-dot';
    
    if (type === 'loading') {
        statusDot.classList.add('loading');
        refreshBtn.classList.add('refreshing');
        refreshBtn.disabled = true;
    } else if (type === 'active') {
        statusDot.classList.add('active');
        refreshBtn.disabled = false;
    } else {
        refreshBtn.disabled = false;
    }
    statusText.textContent = message;
}

// Toast Helper
function showToast(message, isError = false) {
    const toastMsg = statusToast.querySelector('.toast-message');
    toastMsg.textContent = message;
    
    if (isError) {
        statusToast.style.borderColor = 'rgba(239, 68, 68, 0.4)';
    } else {
        statusToast.style.borderColor = '';
    }
    
    statusToast.classList.add('show');
    setTimeout(() => {
        statusToast.classList.remove('show');
    }, 3500);
}

// Loader toggler
function showLoader(show) {
    if (show) {
        loader.style.display = 'flex';
        timelineFeed.style.opacity = '0.3';
        timelineFeed.style.pointerEvents = 'none';
        emptyState.style.display = 'none';
    } else {
        loader.style.display = 'none';
        timelineFeed.style.opacity = '1';
        timelineFeed.style.pointerEvents = 'auto';
    }
}

// Filtering and Stats Calculations
function filterAndRender() {
    const searchLower = state.searchQuery.trim().toLowerCase();
    
    // 1. Calculate stats across ALL entries
    let totalUpdates = 0;
    let featureCount = 0;
    let announcementCount = 0;
    let issueCount = 0;
    
    state.releases.forEach(release => {
        release.updates.forEach(up => {
            totalUpdates++;
            const type = up.type.toLowerCase();
            if (type === 'feature') featureCount++;
            if (type === 'announcement') announcementCount++;
            if (type === 'issue' || type === 'breaking') issueCount++;
        });
    });
    
    // Update DOM counters
    animateCounter('statTotal', totalUpdates);
    animateCounter('statFeatures', featureCount);
    animateCounter('statAnnouncements', announcementCount);
    animateCounter('statIssues', issueCount);
    
    // 2. Filter releases for timeline
    const filteredGroups = [];
    
    state.releases.forEach(release => {
        const matchingUpdates = release.updates.filter(up => {
            // Pill/Type filter
            if (state.activeFilter !== 'all') {
                if (up.type !== state.activeFilter) return false;
            }
            
            // Search text filter
            if (searchLower) {
                const typeMatch = up.type.toLowerCase().includes(searchLower);
                const bodyMatch = up.body.toLowerCase().includes(searchLower);
                const dateMatch = release.formatted_date.toLowerCase().includes(searchLower);
                return typeMatch || bodyMatch || dateMatch;
            }
            
            return true;
        });
        
        if (matchingUpdates.length > 0) {
            filteredGroups.push({
                ...release,
                updates: matchingUpdates
            });
        }
    });
    
    // 3. Render Timeline
    renderTimeline(filteredGroups);
}

// Smooth Number Counter Animation
function animateCounter(id, targetValue) {
    const el = document.getElementById(id);
    if (!el) return;
    
    const startValue = parseInt(el.textContent) || 0;
    if (startValue === targetValue) return;
    
    const duration = 800; // ms
    const startTime = performance.now();
    
    function update(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        // Easing function outQuad
        const easeProgress = progress * (2 - progress);
        
        const currentValue = Math.floor(startValue + (targetValue - startValue) * easeProgress);
        el.textContent = currentValue;
        
        if (progress < 1) {
            requestAnimationFrame(update);
        } else {
            el.textContent = targetValue;
        }
    }
    
    requestAnimationFrame(update);
}

// Render the Timeline Release Notes HTML
function renderTimeline(groups) {
    if (groups.length === 0) {
        timelineFeed.innerHTML = '';
        emptyState.style.display = 'flex';
        return;
    }
    
    emptyState.style.display = 'none';
    
    let html = '';
    let globalIndex = 0; // for staggered animation delays
    
    groups.forEach(group => {
        html += `
            <div class="date-group">
                <div class="date-node"></div>
                <div class="date-header">
                    <h2>${group.formatted_date}</h2>
                    ${group.link ? `
                        <a class="feed-link-icon" href="${group.link}" target="_blank" rel="noopener noreferrer" title="View official release section">
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                                <path d="M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/>
                            </svg>
                        </a>
                    ` : ''}
                </div>
                <div class="updates-list">
        `;
        
        group.updates.forEach(up => {
            const delay = (globalIndex % 8) * 0.05; // Cap delay to keep initial load snappy
            const badgeClass = up.type.toLowerCase();
            
            // Format HTML contents - Ensure target links open in new tab
            let processedBody = up.body;
            processedBody = processedBody.replace(/<a /g, '<a target="_blank" rel="noopener noreferrer" ');
            
            // Apply text highlighting if search is active
            if (state.searchQuery.trim()) {
                processedBody = highlightText(processedBody, state.searchQuery);
            }
            
            html += `
                <div class="update-card animate-slide-up" data-type="${up.type}" style="animation-delay: ${delay}s">
                    <div class="update-card-header">
                        <span class="type-badge ${badgeClass}">
                            <span class="pill-dot"></span>
                            ${up.type}
                        </span>
                        <button class="share-tweet-btn" onclick="shareOnTwitter(this)" title="Tweet this update" aria-label="Tweet this update">
                            <svg class="twitter-icon" viewBox="0 0 24 24" width="12" height="12" fill="currentColor">
                                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                            </svg>
                            <span>Tweet</span>
                        </button>
                    </div>
                    <div class="update-body">${processedBody}</div>
                </div>
            `;
            globalIndex++;
        });
        
        html += `
                </div>
            </div>
        `;
    });
    
    timelineFeed.innerHTML = html;
}

// Highlight keywords for search matches without breaking HTML tags
function highlightText(htmlContent, query) {
    if (!query) return htmlContent;
    
    // Escape regex characters
    const escapedQuery = query.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    
    // Match only outside of HTML tags (ignoring attributes, tag names)
    // Using a regex helper: replace matching text that is not inside tag brackets
    const regex = new RegExp(`(${escapedQuery})(?=[^>]*<)`, 'gi');
    
    // We add a dummy wrapping tag to ensure matches at the end are processed
    const wrappedHtml = htmlContent + '<span style="display:none"></span>';
    const highlighted = wrappedHtml.replace(regex, '<mark>$1</mark>');
    
    // Strip our dummy tag back
    return highlighted.substring(0, highlighted.length - 35);
}

// Event Handlers Setup
function setupEventListeners() {
    // Theme Toggle
    themeToggle.addEventListener('click', toggleTheme);
    
    // Refresh Button
    refreshBtn.addEventListener('click', () => {
        fetchReleases(true);
    });
    
    // Search Bar
    searchInput.addEventListener('input', (e) => {
        state.searchQuery = e.target.value;
        if (state.searchQuery.trim().length > 0) {
            clearSearchBtn.style.display = 'block';
        } else {
            clearSearchBtn.style.display = 'none';
        }
        filterAndRender();
    });
    
    clearSearchBtn.addEventListener('click', () => {
        searchInput.value = '';
        state.searchQuery = '';
        clearSearchBtn.style.display = 'none';
        filterAndRender();
        searchInput.focus();
    });
    
    // Reset Filters from Empty state
    resetFiltersBtn.addEventListener('click', resetAllFilters);
    
    // Filter Pills Tabs
    filterPills.forEach(pill => {
        pill.addEventListener('click', () => {
            // Remove active class from all pills
            filterPills.forEach(p => {
                p.classList.remove('active');
                p.setAttribute('aria-selected', 'false');
            });
            
            // Add active class to clicked pill
            pill.classList.add('active');
            pill.setAttribute('aria-selected', 'true');
            
            // Set active filter
            state.activeFilter = pill.dataset.filter;
            
            // Sync active state on Stat Cards if matching
            syncStatCardActiveState(state.activeFilter);
            
            filterAndRender();
        });
    });
    
    // Dashboard Stats Cards Click
    statCards.forEach(card => {
        card.addEventListener('click', () => {
            const filterType = card.dataset.stat;
            let filterVal = filterType;
            
            // If clicking general "all" card
            if (filterType === 'all') {
                filterVal = 'all';
            }
            
            // Toggle filter: if click same filter again, reset to 'all'
            if (state.activeFilter === filterVal) {
                resetAllFilters();
                return;
            }
            
            state.activeFilter = filterVal;
            
            // Highlight matching filter pill
            filterPills.forEach(p => {
                if (p.dataset.filter === filterVal) {
                    p.classList.add('active');
                    p.setAttribute('aria-selected', 'true');
                } else {
                    p.classList.remove('active');
                    p.setAttribute('aria-selected', 'false');
                }
            });
            
            syncStatCardActiveState(filterVal);
            filterAndRender();
        });
    });
}

function syncStatCardActiveState(filter) {
    statCards.forEach(card => {
        if (card.dataset.stat === filter) {
            card.classList.add('active-filter');
        } else {
            card.classList.remove('active-filter');
        }
    });
}

function resetAllFilters() {
    searchInput.value = '';
    state.searchQuery = '';
    clearSearchBtn.style.display = 'none';
    state.activeFilter = 'all';
    
    filterPills.forEach(p => {
        if (p.dataset.filter === 'all') {
            p.classList.add('active');
            p.setAttribute('aria-selected', 'true');
        } else {
            p.classList.remove('active');
            p.setAttribute('aria-selected', 'false');
        }
    });
    
    syncStatCardActiveState('all');
    filterAndRender();
}

// Share Update to Twitter/X
function shareOnTwitter(btn) {
    const card = btn.closest('.update-card');
    const bodyEl = card.querySelector('.update-body');
    const dateEl = btn.closest('.date-group').querySelector('.date-header h2');
    const linkEl = btn.closest('.date-group').querySelector('.feed-link-icon');
    
    const type = card.dataset.type;
    const date = dateEl.textContent.trim();
    const bodyText = bodyEl.textContent.trim(); // strips HTML tags automatically
    const link = linkEl ? linkEl.href : '';
    
    // Construct Tweet
    const prefix = `BigQuery [${type}] (${date}): `;
    const suffix = link ? `\n\nRead more: ${link}` : '';
    
    // Twitter/X 280 character limit (links wrap to 23 characters automatically via t.co)
    const linkLength = 23;
    const newlineLength = 2;
    const labelLength = 11; // "Read more: "
    const suffixLength = link ? (newlineLength + labelLength + linkLength) : 0;
    
    const availableLength = 280 - prefix.length - suffixLength - 5; // buffer
    
    let text = bodyText;
    if (text.length > availableLength) {
        text = text.substring(0, availableLength - 3) + '...';
    }
    
    const tweetText = `${prefix}${text}${suffix}`;
    const twitterUrl = `https://x.com/intent/tweet?text=${encodeURIComponent(tweetText)}`;
    
    window.open(twitterUrl, '_blank', 'noopener,noreferrer');
}
