// Tournament Selection Page
import { requireAuth, getCurrentUsername, logout } from './auth/auth.js';
import { logger } from './logger.js';

// Check authentication
if (!requireAuth()) {
    // Will redirect to login
} else {
    // User is authenticated
    const username = getCurrentUsername();
    document.getElementById('username-display').textContent = username;
    logger.log('Authenticated user:', username);
    
    // Make logout available globally
    window.logout = logout;
}

// Current view mode
let currentView = 'grid';
let currentYear = new Date().getFullYear();
let tournaments = [];

// Sport icons mapping
const sportIcons = {
    'futsal': '⚽',
    'football': '🏈',
    'basketball': '🏀',
    'volleyball': '🏐',
    'tennis': '🎾',
    'default': '🏆'
};

/**
 * Initialize the page
 */
async function init() {
    logger.log('Initializing tournaments page');
    
    // Populate year selector
    await populateYearSelector();
    
    // Load tournaments for current year
    await loadTournamentsForYear();
}

/**
 * Populate year selector with available years
 */
async function populateYearSelector() {
    try {
        const yearSelect = document.getElementById('year-select');
        
        // Detect available years by checking for tournaments
        const years = await getAvailableYears();
        
        yearSelect.innerHTML = '';
        
        if (years.length === 0) {
            // Fallback to current year if no years detected
            const option = document.createElement('option');
            option.value = currentYear;
            option.textContent = currentYear;
            option.selected = true;
            yearSelect.appendChild(option);
        } else {
            years.forEach(year => {
                const option = document.createElement('option');
                option.value = year;
                option.textContent = year;
                if (year === currentYear) {
                    option.selected = true;
                }
                yearSelect.appendChild(option);
            });
        }
        
        logger.log('Year selector populated with years:', years);
    } catch (error) {
        logger.error('Error populating year selector:', error);
    }
}

/**
 * Get available years from data folder
 */
async function getAvailableYears() {
    const potentialYears = [];
    const startYear = currentYear - 5;
    const endYear = currentYear + 2;
    
    for (let year = startYear; year <= endYear; year++) {
        potentialYears.push(year);
    }
    
    const availableYears = [];
    
    for (const year of potentialYears) {
        const hasData = await checkYearHasData(year);
        if (hasData) {
            availableYears.push(year);
        }
    }
    
    // Sort in descending order (newest first)
    return availableYears.sort((a, b) => b - a);
}

/**
 * Check if a year has any tournament data
 */
async function checkYearHasData(year) {
    const knownSports = ['futsal', 'football', 'basketball', 'volleyball', 'tennis'];
    
    for (const sport of knownSports) {
        try {
            const response = await fetch(`/data/${year}/${sport}/tournament-settings.json`);
            if (response.ok) {
                return true;
            }
        } catch (error) {
            // Continue checking
        }
    }
    
    return false;
}

/**
 * Load tournaments for selected year
 */
async function loadTournamentsForYear() {
    const yearSelect = document.getElementById('year-select');
    const selectedYear = yearSelect.value;
    
    logger.log('Loading tournaments for year:', selectedYear);
    
    showLoading();
    
    try {
        // Get list of sport types in the year folder
        const sportTypes = await getSportTypesForYear(selectedYear);
        
        if (sportTypes.length === 0) {
            showEmpty();
            return;
        }
        
        // Load tournament data for each sport
        tournaments = [];
        for (const sportType of sportTypes) {
            try {
                const tournamentData = await loadTournamentData(selectedYear, sportType);
                if (tournamentData) {
                    tournaments.push({
                        year: selectedYear,
                        sportType: sportType,
                        ...tournamentData
                    });
                }
            } catch (error) {
                logger.warn(`Failed to load tournament data for ${sportType}:`, error);
            }
        }
        
        if (tournaments.length === 0) {
            showEmpty();
        } else {
            renderTournaments();
        }
        
    } catch (error) {
        logger.error('Error loading tournaments:', error);
        showError();
    }
}

/**
 * Get sport types available for a given year
 */
async function getSportTypesForYear(year) {
    // Try to detect available sport types by attempting to load known sports
    const knownSports = ['futsal', 'football', 'basketball', 'volleyball', 'tennis'];
    const availableSports = [];
    
    for (const sport of knownSports) {
        try {
            const response = await fetch(`/data/${year}/${sport}/tournament-settings.json`);
            if (response.ok) {
                availableSports.push(sport);
            }
        } catch (error) {
            // Sport doesn't exist, continue
        }
    }
    
    return availableSports;
}

/**
 * Load tournament data for a specific year and sport
 */
async function loadTournamentData(year, sportType) {
    try {
        // Load tournament settings
        const settingsResponse = await fetch(`/data/${year}/${sportType}/tournament-settings.json`);
        if (!settingsResponse.ok) {
            throw new Error('Failed to load tournament settings');
        }
        const settings = await settingsResponse.json();
        
        // Load groups to count them
        const groupsResponse = await fetch(`/data/${year}/${sportType}/groups.json`);
        let groupCount = 0;
        if (groupsResponse.ok) {
            const groups = await groupsResponse.json();
            groupCount = groups.length;
        }
        
        // Load teams to count teams, players, and associations
        const teamsResponse = await fetch(`/data/${year}/${sportType}/teams.json`);
        let teamCount = 0;
        let playerCount = 0;
        let associationSet = new Set();
        let teamsData = [];
        
        if (teamsResponse.ok) {
            teamsData = await teamsResponse.json();
            teamCount = teamsData.length;
            
            teamsData.forEach(team => {
                if (team.players && Array.isArray(team.players)) {
                    playerCount += team.players.length;
                }
                if (team.association && team.association.name) {
                    associationSet.add(team.association.name);
                }
            });
        }
        
        // Load knockout results to get winner
        const knockoutResponse = await fetch(`/data/${year}/${sportType}/knockout-stage-results.json`);
        let winner = null;
        
        if (knockoutResponse.ok) {
            const knockoutResults = await knockoutResponse.json();
            if (knockoutResults.final && knockoutResults.final.winner) {
                const winnerTeam = teamsData.find(t => t.id === knockoutResults.final.winner);
                winner = winnerTeam ? winnerTeam.name : knockoutResults.final.winner;
            }
        }
        
        // Calculate status based on dates
        const status = calculateTournamentStatus(settings);
        
        return {
            title: settings.tournamentTitle || 'Untitled Tournament',
            subtitle: settings.tournamentSubTitle || '',
            startDate: settings.groupStage?.startDate || settings.knockout?.date || 'TBD',
            endDate: settings.knockout?.date || settings.groupStage?.endDate || 'TBD',
            groupCount: groupCount,
            teamCount: teamCount,
            playerCount: playerCount,
            associationCount: associationSet.size,
            winner: winner,
            status: status,
            settings: settings
        };
    } catch (error) {
        logger.error(`Error loading tournament data for ${year}/${sportType}:`, error);
        return null;
    }
}

/**
 * Calculate tournament status based on dates
 */
function calculateTournamentStatus(settings) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Parse dates from settings
    const startDateStr = settings.groupStage?.startDate;
    const endDateStr = settings.knockout?.date || settings.groupStage?.endDate;
    
    if (!startDateStr || !endDateStr) {
        return 'not-started';
    }
    
    // Parse dates (format: "September 23rd, 2025")
    const startDate = parseSettingsDate(startDateStr);
    const endDate = parseSettingsDate(endDateStr);
    
    if (!startDate || !endDate) {
        return 'not-started';
    }
    
    if (today < startDate) {
        return 'not-started';
    } else if (today >= startDate && today <= endDate) {
        return 'in-progress';
    } else {
        return 'ended';
    }
}

/**
 * Parse date string from tournament settings
 * Format: "September 23rd, 2025" or "November 7th, 2025"
 */
function parseSettingsDate(dateStr) {
    try {
        // Remove ordinal suffixes (st, nd, rd, th)
        const cleanStr = dateStr.replace(/(\d+)(st|nd|rd|th)/, '$1');
        const date = new Date(cleanStr);
        
        if (isNaN(date.getTime())) {
            return null;
        }
        
        date.setHours(0, 0, 0, 0);
        return date;
    } catch (error) {
        logger.error('Error parsing date:', dateStr, error);
        return null;
    }
}

/**
 * Render tournaments in current view
 */
function renderTournaments() {
    if (currentView === 'grid') {
        renderGridView();
    } else {
        renderTableView();
    }
}

/**
 * Render grid view
 */
function renderGridView() {
    const gridView = document.getElementById('grid-view');
    const tableView = document.getElementById('table-view');
    
    // Clear and hide all states first
    hideAllStates();
    
    gridView.innerHTML = '';
    
    tournaments.forEach(tournament => {
        const card = createTournamentCard(tournament);
        gridView.appendChild(card);
    });
    
    gridView.style.display = 'grid';
    tableView.style.display = 'none';
}

/**
 * Hide all state displays
 */
function hideAllStates() {
    document.getElementById('loading-state').style.display = 'none';
    document.getElementById('error-state').style.display = 'none';
    document.getElementById('empty-state').style.display = 'none';
    document.getElementById('grid-view').style.display = 'none';
    document.getElementById('table-view').style.display = 'none';
}

/**
 * Create tournament card element
 */
function createTournamentCard(tournament) {
    const card = document.createElement('div');
    card.className = `tournament-card ${tournament.status}`;
    
    const statusText = {
        'not-started': 'Not Started',
        'in-progress': 'In Progress',
        'ended': 'Ended'
    }[tournament.status];
    
    const icon = sportIcons[tournament.sportType] || sportIcons['default'];
    const currentUsername = getCurrentUsername();
    const isAdmin = currentUsername === 'admin';
    
    // Determine if card should be clickable and what button to show
    const canOpen = tournament.status !== 'ended' || isAdmin;
    const buttonHtml = isAdmin && tournament.status === 'ended' 
        ? `<button class="open-btn archive-btn" onclick="event.stopPropagation(); openTournament('${tournament.year}', '${tournament.sportType}')">View Archive</button>`
        : tournament.status !== 'ended'
        ? `<button class="open-btn" onclick="event.stopPropagation(); openTournament('${tournament.year}', '${tournament.sportType}')">Open Tournament</button>`
        : '';
    
    card.innerHTML = `
        <div class="card-header">
            <div class="sport-icon">${icon}</div>
            <div class="status-badge ${tournament.status}">${statusText}</div>
        </div>
        <div class="card-title">
            <h3>${tournament.title}</h3>
            <p>${tournament.subtitle}</p>
        </div>
        <div class="card-details">
            <div class="detail-row">
                <span class="icon">📅</span>
                <span class="label">Start:</span>
                <span>${tournament.startDate}</span>
            </div>
            <div class="detail-row">
                <span class="icon">🏁</span>
                <span class="label">End:</span>
                <span>${tournament.endDate}</span>
            </div>
            <div class="detail-row">
                <span class="icon">🏆</span>
                <span class="label">Sport:</span>
                <span style="text-transform: capitalize;">${tournament.sportType}</span>
            </div>
            <div class="detail-row winner-row">
                <span class="icon">🥇</span>
                <span class="label">Winner:</span>
                <span>${tournament.winner || 'TBD'}</span>
            </div>
        </div>
        <div class="card-stats">
            <div class="stat-item">
                <span class="icon">⚽</span>
                <span class="value">${tournament.teamCount || 0}</span>
                <span class="label">Teams</span>
            </div>
            <div class="stat-item">
                <span class="icon">👥</span>
                <span class="value">${tournament.playerCount || 0}</span>
                <span class="label">Players</span>
            </div>
            <div class="stat-item">
                <span class="icon">🤝</span>
                <span class="value">${tournament.associationCount || 0}</span>
                <span class="label">Associations</span>
            </div>
            <div class="stat-item">
                <span class="icon">🎯</span>
                <span class="value">${tournament.groupCount}</span>
                <span class="label">Groups</span>
            </div>
        </div>
        <div class="card-footer">
            ${buttonHtml}
        </div>
    `;
    
    // Make card clickable only for non-ended tournaments or admin
    if (canOpen) {
        card.style.cursor = 'pointer';
        card.addEventListener('click', (e) => {
            // Don't trigger if clicking the button
            if (!e.target.classList.contains('open-btn') && !e.target.closest('.open-btn')) {
                openTournament(tournament.year, tournament.sportType);
            }
        });
    }
    
    return card;
}

/**
 * Render table view
 */
function renderTableView() {
    const gridView = document.getElementById('grid-view');
    const tableView = document.getElementById('table-view');
    const tableBody = document.getElementById('table-body');
    
    // Clear and hide all states first
    hideAllStates();
    
    tableBody.innerHTML = '';
    
    tournaments.forEach(tournament => {
        const row = createTournamentRow(tournament);
        tableBody.appendChild(row);
    });
    
    gridView.style.display = 'none';
    tableView.style.display = 'block';
}

/**
 * Create tournament table row
 */
function createTournamentRow(tournament) {
    const row = document.createElement('tr');
    row.className = tournament.status;
    
    const statusText = {
        'not-started': 'Not Started',
        'in-progress': 'In Progress',
        'ended': 'Ended'
    }[tournament.status];
    
    const icon = sportIcons[tournament.sportType] || sportIcons['default'];
    const currentUsername = getCurrentUsername();
    const isAdmin = currentUsername === 'admin';
    
    // Determine if row should be clickable and what button to show
    const canOpen = tournament.status !== 'ended' || isAdmin;
    const buttonHtml = isAdmin && tournament.status === 'ended'
        ? `<button class="action-btn archive-btn" onclick="event.stopPropagation(); openTournament('${tournament.year}', '${tournament.sportType}')">View Archive</button>`
        : tournament.status !== 'ended'
        ? `<button class="action-btn" onclick="event.stopPropagation(); openTournament('${tournament.year}', '${tournament.sportType}')">Open</button>`
        : '';
    
    row.innerHTML = `
        <td data-label="Sport">
            <div class="sport-cell">
                <span class="icon">${icon}</span>
                <span class="name">${tournament.sportType}</span>
            </div>
        </td>
        <td data-label="Title">
            <div class="title-cell">
                <h4>${tournament.title}</h4>
                <p>${tournament.subtitle}</p>
            </div>
        </td>
        <td data-label="Status">
            <span class="status-badge ${tournament.status}">${statusText}</span>
        </td>
        <td data-label="Winner">${tournament.winner || 'TBD'}</td>
        <td data-label="Start Date">${tournament.startDate}</td>
        <td data-label="End Date">${tournament.endDate}</td>
        <td data-label="Teams">${tournament.teamCount || 0}</td>
        <td data-label="Players">${tournament.playerCount || 0}</td>
        <td data-label="Associations">${tournament.associationCount || 0}</td>
        <td data-label="Groups">${tournament.groupCount}</td>
        <td data-label="Action">
            ${buttonHtml}
        </td>
    `;
    
    // Make row clickable only for non-ended tournaments or admin
    if (canOpen) {
        row.style.cursor = 'pointer';
        row.addEventListener('click', (e) => {
            // Don't trigger if clicking the button
            if (!e.target.classList.contains('action-btn') && !e.target.closest('.action-btn')) {
                openTournament(tournament.year, tournament.sportType);
            }
        });
    }
    
    return row;
}

/**
 * Toggle between grid and table view
 */
function toggleView(view) {
    currentView = view;
    
    // Update button states
    document.querySelectorAll('.view-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.view === view);
    });
    
    // Render in new view
    renderTournaments();
    
    logger.log('View toggled to:', view);
}

/**
 * Open tournament
 */
function openTournament(year, sportType) {
    logger.log('Opening tournament:', year, sportType);
    
    // Store tournament selection in sessionStorage
    sessionStorage.setItem('selectedTournamentYear', year);
    sessionStorage.setItem('selectedTournamentSport', sportType);
    
    // Redirect to app
    window.location.href = '/pages/app.html#/overview';
}

/**
 * Show loading state
 */
function showLoading() {
    document.getElementById('loading-state').style.display = 'flex';
    document.getElementById('error-state').style.display = 'none';
    document.getElementById('empty-state').style.display = 'none';
    document.getElementById('grid-view').style.display = 'none';
    document.getElementById('table-view').style.display = 'none';
}

/**
 * Hide loading state
 */
function hideLoading() {
    document.getElementById('loading-state').style.display = 'none';
}

/**
 * Show error state
 */
function showError() {
    document.getElementById('loading-state').style.display = 'none';
    document.getElementById('error-state').style.display = 'block';
    document.getElementById('empty-state').style.display = 'none';
    document.getElementById('grid-view').style.display = 'none';
    document.getElementById('table-view').style.display = 'none';
}

/**
 * Show empty state
 */
function showEmpty() {
    document.getElementById('loading-state').style.display = 'none';
    document.getElementById('error-state').style.display = 'none';
    document.getElementById('empty-state').style.display = 'block';
    document.getElementById('grid-view').style.display = 'none';
    document.getElementById('table-view').style.display = 'none';
}

// Make functions available globally
window.toggleView = toggleView;
window.openTournament = openTournament;
window.loadTournamentsForYear = loadTournamentsForYear;

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', init);
