// Global variables to store data
let groups = [];
let teams = [];
let fixtures = [];
let results = [];
let goals = [];
let defaults = {}; // Add defaults configuration
let selectedGroupId = null;

// Forecast-specific variables
let selectedForecastGroupId = null;

// Admin configuration
const ADMIN_CONFIG = {
    role: 'admin',
    validateTime: false // Enable/disable time validation for adding results
};

// Configuration for simulation type
const SIMULATION_CONFIG = {
    useOpenAI: false, // Switch to enable/disable OpenAI analysis (default off)
    pointsGapLimit: 3 // Only analyze teams within this points gap - will be updated from defaults.json
};

// OpenRouter API configuration (formerly OpenAI)
const OPENAI_CONFIG = {
    apiKey: null, // API key will be loaded from .env file
    baseURL: 'https://openrouter.ai/api/v1',
    model: 'openai/gpt-oss-20b:free', //'openai/gpt-4o'
    maxTokens: 500, // Limit response length to optimize costs
    temperature: 0.7,
    retryAttempts: 3,
    retryDelay: 1000, // Base delay in ms (will use exponential backoff)
    timeoutMs: 30000 // 30 second timeout
};

let openaiInitialized = false; // Track initialization status

// Load API key from config.json file
async function loadOpenAIKeyFromConfig() {
    try {
        const response = await fetch('config.json');
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const config = await response.json();
        const apiKey = config.OPENAI_API_KEY;
        
        if (apiKey && apiKey !== 'your-api-key-here' && apiKey.trim()) {
            OPENAI_CONFIG.apiKey = apiKey.trim();
            initializeOpenAI(OPENAI_CONFIG.apiKey);
            console.log('✅ OpenRouter API key loaded from config.json');
            return;
        } else {
            console.warn('⚠️ No valid OpenRouter API key found in config.json');
        }
    } catch (error) {
        console.warn('⚠️ Could not load config.json:', error.message);
        console.info('💡 Create a config.json file with: {"OPENAI_API_KEY": "your-openrouter-key-here"}');
    }
}

// Fallback: Load API key from .env file (if config.json fails)
async function loadOpenAIKeyFromEnv() {
    try {
        const response = await fetch('.env');
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const envContent = await response.text();
        const envLines = envContent.split('\n');
        
        for (const line of envLines) {
            if (line.startsWith('OPENAI_API_KEY=')) {
                const apiKey = line.split('=')[1].trim();
                if (apiKey && apiKey !== 'your-api-key-here') {
                    OPENAI_CONFIG.apiKey = apiKey;
                    initializeOpenAI(apiKey);
                    console.log('✅ OpenRouter API key loaded from .env file');
                    return;
                }
            }
        }
        console.warn('⚠️ No valid OpenRouter API key found in .env file');
    } catch (error) {
        // Don't log .env errors since it's expected to fail often
        console.debug('.env file not accessible via HTTP (this is normal)');
    }
}

// Initialize OpenAI client
function initializeOpenAI(apiKey) {
    if (!apiKey) {
        console.warn('⚠️ No API key provided for OpenRouter initialization');
        return;
    }
    
    try {
        OPENAI_CONFIG.apiKey = apiKey;
        console.log('✅ OpenRouter client initialized successfully');
    } catch (error) {
        console.error('❌ Failed to initialize OpenRouter client:', error);
    }
}

// Set OpenAI API key manually (fallback)
function setOpenAIKey(apiKey) {
    if (apiKey && apiKey.trim()) {
        OPENAI_CONFIG.apiKey = apiKey.trim();
        initializeOpenAI(OPENAI_CONFIG.apiKey);
        // Store in sessionStorage for session persistence
        sessionStorage.setItem('openai_session_key', OPENAI_CONFIG.apiKey);
    }
}

// Load API key from sessionStorage (fallback)
function loadOpenAIKeyFromSession() {
    const savedKey = sessionStorage.getItem('openai_session_key');
    if (savedKey && savedKey.trim()) {
        OPENAI_CONFIG.apiKey = savedKey;
        initializeOpenAI(savedKey);
    }
}

// Note: localStorage persistence removed to avoid overriding default settings
// Configuration is now purely based on code defaults and API key availability

// Show loading mask
function showLoadingMask() {
    const mask = document.getElementById('openai-loading-mask');
    if (mask) {
        mask.classList.remove('hide', 'hidden');
        mask.style.display = 'flex';
        
        // Simulate loading progress with messages
        let progress = 0;
        let step = 0;
        const progressFill = document.getElementById('loading-progress-fill');
        const progressText = document.getElementById('loading-progress-text');
        const loadingTextP = mask.querySelector('.loading-text p');
        
        const loadingMessages = [
            'Initializing OpenRouter connection...',
            'Initializing AI models...',
            'Preparing championship analysis engine...',
            'Setting up intelligent predictions...',
            'Almost ready for AI-powered insights...'
        ];
        
        const updateProgress = () => {
            progress += Math.random() * 12 + 8; // Random increment between 8-20%
            if (progress > 95) progress = 95; // Don't complete until actually loaded
            
            // Update message based on progress
            const messageIndex = Math.floor((progress / 100) * loadingMessages.length);
            if (messageIndex < loadingMessages.length && loadingTextP) {
                loadingTextP.textContent = loadingMessages[messageIndex];
            }
            
            if (progressFill) progressFill.style.width = progress + '%';
            if (progressText) progressText.textContent = Math.round(progress) + '%';
            
            if (progress < 95) {
                setTimeout(updateProgress, 300 + Math.random() * 400); // Random delay 300-700ms
            }
        };
        
        updateProgress();
    }
}

// Hide loading mask
function hideLoadingMask() {
    const mask = document.getElementById('openai-loading-mask');
    if (mask) {
        // Complete the progress bar
        const progressFill = document.getElementById('loading-progress-fill');
        const progressText = document.getElementById('loading-progress-text');
        if (progressFill) progressFill.style.width = '100%';
        if (progressText) progressText.textContent = '100%';
        
        // Hide after a brief delay to show completion
        setTimeout(() => {
            mask.classList.add('hidden');
            setTimeout(() => {
                mask.style.display = 'none';
            }, 300); // Wait for fade out animation
        }, 500);
    }
}

// Initialize OpenAI system (only called if enabled)
// Initialize OpenRouter system on page load
async function initializeOpenRouterSystem() {
    try {
        console.log('🔄 Initializing OpenRouter system...');
        
        // Try to load API key in order of preference
        await loadOpenAIKeyFromConfig(); // Try config.json first
        if (!OPENAI_CONFIG.apiKey) {
            await loadOpenAIKeyFromEnv(); // Fallback to .env
        }
        if (!OPENAI_CONFIG.apiKey) {
            loadOpenAIKeyFromSession(); // Final fallback to session storage
        }

        // Show success or error toast
        if (OPENAI_CONFIG.apiKey) {
            showToast('🤖 OpenRouter Engine Ready - Advanced analysis available!', 'success', 5000);
            console.log('✅ OpenRouter system fully initialized');
        } else {
            showToast('⚠️ OpenRouter Engine unavailable - Using standard analysis', 'warning', 5000);
            console.log('⚠️ OpenRouter system initialization incomplete - no API key');
        }
        
    } catch (error) {
        showToast('❌ OpenRouter Engine failed to initialize - Using standard analysis', 'error', 5000);
        console.error('❌ OpenRouter system initialization failed:', error);
    }
}

// Load data when page loads
document.addEventListener('DOMContentLoaded', async function() {
    console.log('Using default OpenAI configuration:', {
        useOpenAI: SIMULATION_CONFIG.useOpenAI,
        maxTokens: OPENAI_CONFIG.maxTokens,
        retryAttempts: OPENAI_CONFIG.retryAttempts,
        model: OPENAI_CONFIG.model
    });
    
    // Load data first (non-blocking)
    await loadData();
    
    // Load any pending results from session storage (mobile)
    loadPendingResults();
    
    showTab('standings');
    
    // Initialize OpenRouter only if enabled
    if (SIMULATION_CONFIG.useOpenAI) {
        initializeOpenRouterSystem();
    } else {
        console.log('ℹ️ OpenRouter feature disabled, skipping initialization');
    }
});

// Load JSON data
async function loadData() {
    try {
        const [defaultsResponse, groupsResponse, teamsResponse, fixturesResponse, resultsResponse, goalsResponse] = await Promise.all([
            fetch('data/defaults.json'),
            fetch('data/groups.json'),
            fetch('data/teams.json'),
            fetch('data/fixtures.json'),
            fetch('data/results.json'),
            fetch('data/goals.json')
        ]);
        
        defaults = await defaultsResponse.json();
        groups = await groupsResponse.json();
        teams = await teamsResponse.json();
        fixtures = await fixturesResponse.json();
        results = await resultsResponse.json();
        goals = await goalsResponse.json();
        
        // Set default group based on defaults.json
        selectedGroupId = defaults.defaultGroup || (groups.length > 0 ? groups[0].id : null);
        
        // Update simulation config from defaults
        if (defaults.simulation) {
            SIMULATION_CONFIG.pointsGapLimit = defaults.simulation.pointsGapLimit || 3;
        }
        
        console.log('Data loaded successfully');
        
        // Apply tab visibility settings
        applyTabVisibilitySettings();
        
        populateGroupSelector();
        updateTeamSelectorForGroup();
        updateAllTabs();
        
        // Load team player data for Teams tab
        await loadPlayersData();
    } catch (error) {
        console.error('Error loading data:', error);
    }
}

// Populate group selector dropdown
function populateGroupSelector() {
    const groupSelect = document.getElementById('selected-group');
    if (!groupSelect) return;
    
    groupSelect.innerHTML = '';
    
    groups.forEach(group => {
        const option = document.createElement('option');
        option.value = group.id;
        option.textContent = `${group.name} - ${group.description}`;
        if (group.id === selectedGroupId) {
            option.selected = true;
        }
        groupSelect.appendChild(option);
    });
}

// Update standings when group changes
function updateStandingsForGroup() {
    const groupSelect = document.getElementById('selected-group');
    if (groupSelect) {
        selectedGroupId = groupSelect.value;
        updateStandings();
        updateTeamSelectorForGroup(); // Update simulator team options
    }
}

// Update team selector options based on current group
function updateTeamSelectorForGroup() {
    const teamSelect = document.getElementById('selected-team');
    if (!teamSelect) return;
    
    const currentSelection = teamSelect.value;
    
    teamSelect.innerHTML = '';
    
    // Create hierarchical structure with optgroups for all groups (like Teams tab)
    groups.forEach(group => {
        const groupTeams = teams.filter(team => team.groupId === group.id);
        
        if (groupTeams.length > 0) {
            const optgroup = document.createElement('optgroup');
            optgroup.label = group.name;
            
            groupTeams.forEach(team => {
                const option = document.createElement('option');
                option.value = team.id;
                option.textContent = team.name;
                optgroup.appendChild(option);
            });
            
            teamSelect.appendChild(optgroup);
        }
    });
    
    // Try to maintain current selection if team exists
    const allTeams = teams;
    if (allTeams.some(team => team.id === currentSelection)) {
        teamSelect.value = currentSelection;
    } else if (allTeams.length > 0) {
        // Use default team from defaults.json, fallback to team marked as default, otherwise first team
        const defaultTeamId = defaults.defaultTeam;
        const defaultTeamFromConfig = allTeams.find(team => team.id === defaultTeamId);
        const defaultTeamFromData = allTeams.find(team => team.isDefault === true);
        
        if (defaultTeamFromConfig) {
            teamSelect.value = defaultTeamFromConfig.id;
        } else if (defaultTeamFromData) {
            teamSelect.value = defaultTeamFromData.id;
        } else {
            teamSelect.value = allTeams[0].id;
        }
    }
}

// Get filtered data for current group
function getTeamsForGroup(groupId = selectedGroupId) {
    return teams.filter(team => team.groupId === groupId);
}

function getFixturesForGroup(groupId = selectedGroupId) {
    return fixtures.filter(fixture => fixture.groupId === groupId);
}

function getResultsForGroup(groupId = selectedGroupId) {
    return results.filter(result => result.groupId === groupId);
}

function getGoalsForGroup(groupId = selectedGroupId) {
    return goals.filter(goal => goal.groupId === groupId);
}

// Calculate goal statistics by team and player for current group
function calculateGoalStatistics() {
    const groupGoals = getGoalsForGroup();
    const teamStats = {};
    
    // Initialize stats for each team
    const groupTeams = getTeamsForGroup();
    groupTeams.forEach(team => {
        teamStats[team.id] = {
            teamName: team.name,
            totalGoals: 0,
            players: {},
            topScorer: null
        };
        
        // Initialize player stats
        if (team.players) {
            team.players.forEach(player => {
                teamStats[team.id].players[player.id] = {
                    playerName: player.name,
                    goals: 0,
                    matches: []
                };
            });
        }
    });
    
    // Count goals by player and team
    groupGoals.forEach(goal => {
        if (teamStats[goal.teamId]) {
            // Use totalGoals if available, otherwise count as 1
            const goalCount = goal.totalGoals || 1;
            teamStats[goal.teamId].totalGoals += goalCount;
            
            if (!teamStats[goal.teamId].players[goal.playerId]) {
                teamStats[goal.teamId].players[goal.playerId] = {
                    playerName: goal.playerName,
                    goals: 0,
                    matches: []
                };
            }
            
            teamStats[goal.teamId].players[goal.playerId].goals += goalCount;
            teamStats[goal.teamId].players[goal.playerId].matches.push({
                matchId: goal.matchId,
                goalType: goal.goalType,
                totalGoals: goalCount
            });
        }
    });
    
    // Find top scorer for each team
    Object.keys(teamStats).forEach(teamId => {
        const players = teamStats[teamId].players;
        let topScorer = null;
        let maxGoals = 0;
        
        Object.keys(players).forEach(playerId => {
            if (players[playerId].goals > maxGoals) {
                maxGoals = players[playerId].goals;
                topScorer = {
                    playerId: playerId,
                    playerName: players[playerId].playerName,
                    goals: maxGoals
                };
            }
        });
        
        teamStats[teamId].topScorer = topScorer;
    });
    
    return teamStats;
}

// Show goal tooltip on hover (desktop) or click (mobile)
function showGoalTooltip(event, teamId) {
    const goalStats = calculateGoalStatistics();
    const teamStats = goalStats[teamId];
    
    if (!teamStats || teamStats.totalGoals === 0) return;
    
    // Check if this is a mobile device
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || window.innerWidth <= 768;
    
    // Create tooltip if it doesn't exist
    let tooltip = document.getElementById('goal-tooltip');
    if (!tooltip) {
        tooltip = document.createElement('div');
        tooltip.id = 'goal-tooltip';
        tooltip.className = 'goal-tooltip';
        document.body.appendChild(tooltip);
    }
    
    // If mobile and tooltip is already visible for this team, hide it
    if (isMobile && tooltip.style.display === 'block' && tooltip.dataset.currentTeam === teamId) {
        hideGoalTooltip();
        return;
    }
    
    // Sort players by goals scored (descending)
    const sortedPlayers = Object.keys(teamStats.players)
        .map(playerId => ({
            playerId,
            ...teamStats.players[playerId]
        }))
        .filter(player => player.goals > 0)
        .sort((a, b) => b.goals - a.goals);
    
    if (sortedPlayers.length === 0) {
        tooltip.style.display = 'none';
        return;
    }
    
    // Generate tooltip content
    let content = `
        <div class="tooltip-header">
            <strong>${teamStats.teamName}</strong><br>
            Top Scorers
        </div>
        <div class="tooltip-content">
    `;
    
    sortedPlayers.forEach((player, index) => {
        const isTopScorer = teamStats.topScorer && player.playerId === teamStats.topScorer.playerId;
        const championIcon = isTopScorer ? ' <span class="champion-icon">👑</span>' : '';
        
        content += `
            <div class="player-goal-stat ${isTopScorer ? 'top-scorer' : ''}">
                <span class="player-name">${player.playerName}${championIcon}</span>
                <span class="player-goals">${player.goals} goal${player.goals !== 1 ? 's' : ''}</span>
            </div>
        `;
    });
    
    content += '</div>';
    tooltip.innerHTML = content;
    tooltip.dataset.currentTeam = teamId; // Track which team tooltip is showing
    
    // Position tooltip
    if (isMobile) {
        // Center the tooltip on mobile
        tooltip.style.display = 'block';
        tooltip.style.left = '50%';
        tooltip.style.top = '50%';
        tooltip.style.transform = 'translate(-50%, -50%)';
        tooltip.classList.add('mobile-tooltip');
    } else {
        // Desktop positioning (original behavior)
        const rect = event.target.getBoundingClientRect();
        tooltip.style.display = 'block';
        tooltip.style.left = (rect.left + window.scrollX + rect.width + 10) + 'px';
        tooltip.style.top = (rect.top + window.scrollY) + 'px';
        tooltip.style.transform = 'none';
        tooltip.classList.remove('mobile-tooltip');
        
        // Adjust if tooltip goes off screen
        const tooltipRect = tooltip.getBoundingClientRect();
        if (tooltipRect.right > window.innerWidth) {
            tooltip.style.left = (rect.left + window.scrollX - tooltipRect.width - 10) + 'px';
        }
        if (tooltipRect.bottom > window.innerHeight) {
            tooltip.style.top = (rect.top + window.scrollY - tooltipRect.height) + 'px';
        }
    }
}

// Hide goal tooltip
function hideGoalTooltip() {
    const tooltip = document.getElementById('goal-tooltip');
    if (tooltip) {
        tooltip.style.display = 'none';
        tooltip.classList.remove('mobile-tooltip');
        delete tooltip.dataset.currentTeam;
    }
}

// Add global click handler for mobile tooltip dismissal
document.addEventListener('click', function(event) {
    const tooltip = document.getElementById('goal-tooltip');
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || window.innerWidth <= 768;
    
    // Only handle on mobile and if tooltip is visible
    if (!isMobile || !tooltip || tooltip.style.display !== 'block') {
        return;
    }
    
    // Check if the click was on a goals cell or inside the tooltip
    const clickedOnGoalsCell = event.target.closest('.goals-cell');
    const clickedOnTooltip = event.target.closest('#goal-tooltip');
    
    if (!clickedOnGoalsCell && !clickedOnTooltip) {
        hideGoalTooltip();
    }
});

// Prevent mouseout from hiding tooltip on mobile
function handleTooltipMouseOut(event, teamId) {
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || window.innerWidth <= 768;
    
    // Don't hide on mobile (only click-to-dismiss)
    if (!isMobile) {
        hideGoalTooltip();
    }
}

// Tab switching functionality
function showTab(tabName) {
    // Hide all tab contents
    const tabContents = document.querySelectorAll('.tab-content');
    tabContents.forEach(tab => tab.classList.remove('active'));
    
    // Remove active class from all tab buttons
    const tabButtons = document.querySelectorAll('.tab-button');
    tabButtons.forEach(button => button.classList.remove('active'));
    
    // Show selected tab content
    document.getElementById(tabName).classList.add('active');
    
    // Add active class to clicked button
    const activeButton = document.querySelector(`[onclick="showTab('${tabName}')"]`);
    if (activeButton) {
        activeButton.classList.add('active');
    }
    
    // Update content based on tab
    switch(tabName) {
        case 'standings':
            updateStandings();
            break;
        case 'fixtures':
            updateFixtures();
            break;
        case 'simulator':
            updateSimulation();
            break;
        case 'forecast':
            updateForecast();
            break;
    }
}

// Apply tab visibility settings from defaults.json
function applyTabVisibilitySettings() {
    if (!defaults.tabVisibility) return;
    
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');
    
    // Map of tab names to their selectors
    const tabMapping = {
        'forecast': { button: 'button[onclick="showTab(\'forecast\')"]', content: '#forecast' },
        'standings': { button: 'button[onclick="showTab(\'standings\')"]', content: '#standings' },
        'teams': { button: 'button[onclick="showTab(\'teams\')"]', content: '#teams' },
        'fixtures': { button: 'button[onclick="showTab(\'fixtures\')"]', content: '#fixtures' },
        'simulator': { button: 'button[onclick="showTab(\'simulator\')"]', content: '#simulator' }
    };
    
    // Apply visibility settings
    Object.keys(tabMapping).forEach(tabName => {
        const isVisible = defaults.tabVisibility[tabName] !== false; // Default to visible if not specified
        const button = document.querySelector(tabMapping[tabName].button);
        const content = document.querySelector(tabMapping[tabName].content);
        
        if (button) {
            button.style.display = isVisible ? '' : 'none';
        }
        if (content && !isVisible) {
            content.style.display = 'none';
        }
    });
    
    // Show first visible tab by default
    const firstVisibleTab = Object.keys(defaults.tabVisibility).find(tab => defaults.tabVisibility[tab] !== false);
    if (firstVisibleTab) {
        showTab(firstVisibleTab);
    }
    
    // Apply sub-tab configurations if they exist in defaults
    if (defaults.subTabs && defaults.subTabs.standings) {
        const subTabConfig = defaults.subTabs.standings;
        const subTabsContainer = document.querySelector('.sub-tabs');
        
        // Hide/show sub-tabs container based on configuration
        if (subTabsContainer) {
            subTabsContainer.style.display = subTabConfig.enabled !== false ? '' : 'none';
        }
        
        // Configure individual sub-tab buttons
        if (subTabConfig.knockoutStage !== undefined) {
            const knockoutButton = document.querySelector('button[onclick="showStandingsSubTab(\'knockout-stage\')"]');
            if (knockoutButton) {
                knockoutButton.style.display = subTabConfig.knockoutStage !== false ? '' : 'none';
            }
        }
        
        if (subTabConfig.leagueStandings !== undefined) {
            const leagueButton = document.querySelector('button[onclick="showStandingsSubTab(\'league-standings\')"]');
            if (leagueButton) {
                leagueButton.style.display = subTabConfig.leagueStandings !== false ? '' : 'none';
            }
        }
    }
}

// Calculate standings with tie-breaker rules
function calculateStandings() {
    const standings = [];
    
    // Get teams and results for the selected group
    const groupTeams = getTeamsForGroup();
    const groupResults = getResultsForGroup();
    
    // Initialize standings for each team in the group
    groupTeams.forEach(team => {
        standings.push({
            id: team.id,
            name: team.name,
            fullName: team.fullName,
            played: 0,
            wins: 0,
            losses: 0,
            draws: 0,
            goalsFor: 0,
            goalsAgainst: 0,
            goalDifference: 0,
            points: 0,
            matchHistory: [],
            headToHeadWins: {} // Store wins against each opponent
        });
    });
    
    // Process results for the group
    groupResults.forEach(result => {
        if (result.played) {
            const homeTeam = standings.find(team => team.id === result.homeTeam);
            const awayTeam = standings.find(team => team.id === result.awayTeam);
            
            if (homeTeam && awayTeam) {
                // Initialize head-to-head records if not exists
                if (!homeTeam.headToHeadWins[awayTeam.id]) homeTeam.headToHeadWins[awayTeam.id] = 0;
                if (!awayTeam.headToHeadWins[homeTeam.id]) awayTeam.headToHeadWins[homeTeam.id] = 0;
                
                // Update match counts
                homeTeam.played++;
                awayTeam.played++;
                
                // Update goals
                homeTeam.goalsFor += result.homeScore;
                homeTeam.goalsAgainst += result.awayScore;
                awayTeam.goalsFor += result.awayScore;
                awayTeam.goalsAgainst += result.homeScore;
                
                // Determine result and update wins/losses/draws
                if (result.homeScore > result.awayScore) {
                    // Home team wins
                    homeTeam.wins++;
                    homeTeam.points += 3;
                    homeTeam.matchHistory.push('W');
                    homeTeam.headToHeadWins[awayTeam.id]++;
                    awayTeam.losses++;
                    awayTeam.matchHistory.push('L');
                } else if (result.homeScore < result.awayScore) {
                    // Away team wins
                    awayTeam.wins++;
                    awayTeam.points += 3;
                    awayTeam.matchHistory.push('W');
                    awayTeam.headToHeadWins[homeTeam.id]++;
                    homeTeam.losses++;
                    homeTeam.matchHistory.push('L');
                } else {
                    // Draw
                    homeTeam.draws++;
                    homeTeam.points += 1;
                    homeTeam.matchHistory.push('D');
                    awayTeam.draws++;
                    awayTeam.points += 1;
                    awayTeam.matchHistory.push('D');
                }
                
                // Calculate goal difference
                homeTeam.goalDifference = homeTeam.goalsFor - homeTeam.goalsAgainst;
                awayTeam.goalDifference = awayTeam.goalsFor - awayTeam.goalsAgainst;
            }
        }
    });
    
    // Sort standings with tie-breaker rules
    standings.sort((a, b) => {
        // 1st: Points
        if (a.points !== b.points) {
            return b.points - a.points;
        }
        
        // 2nd: Goal difference (goals scored - goals conceded)
        if (a.goalDifference !== b.goalDifference) {
            return b.goalDifference - a.goalDifference;
        }
        
        // 3rd: Total goals scored
        if (a.goalsFor !== b.goalsFor) {
            return b.goalsFor - a.goalsFor;
        }
        
        // 4th: Head-to-head wins (TB - highest number of points obtained by tied teams against each other)
        const aHeadToHeadWins = Object.values(a.headToHeadWins).reduce((sum, wins) => sum + wins, 0);
        const bHeadToHeadWins = Object.values(b.headToHeadWins).reduce((sum, wins) => sum + wins, 0);
        
        if (aHeadToHeadWins !== bHeadToHeadWins) {
            return bHeadToHeadWins - aHeadToHeadWins;
        }
        
        // Final tie-breaker: alphabetical order
        return a.name.localeCompare(b.name);
    });
    
    return standings;
}

// Calculate standings excluding results from a specific gameweek (for prediction purposes)
function calculateStandingsExcludingGameweek(excludeGameweek) {
    const standings = [];
    
    // Get teams and results for the selected group
    const groupTeams = getTeamsForGroup();
    const groupResults = getResultsForGroup();
    
    // Initialize standings for each team in the group
    groupTeams.forEach(team => {
        standings.push({
            id: team.id,
            name: team.name,
            fullName: team.fullName,
            played: 0,
            wins: 0,
            losses: 0,
            draws: 0,
            goalsFor: 0,
            goalsAgainst: 0,
            goalDifference: 0,
            points: 0,
            matchHistory: [],
            headToHeadWins: {} // Store wins against each opponent
        });
    });
    
    // Process results for the group, excluding the specified gameweek
    groupResults.forEach(result => {
        if (result.played && result.gameweek !== excludeGameweek) {
            const homeTeam = standings.find(team => team.id === result.homeTeam);
            const awayTeam = standings.find(team => team.id === result.awayTeam);
            
            if (homeTeam && awayTeam) {
                // Initialize head-to-head records if not exists
                if (!homeTeam.headToHeadWins[awayTeam.id]) homeTeam.headToHeadWins[awayTeam.id] = 0;
                if (!awayTeam.headToHeadWins[homeTeam.id]) awayTeam.headToHeadWins[homeTeam.id] = 0;
                
                // Update match counts
                homeTeam.played++;
                awayTeam.played++;
                
                // Update goals
                homeTeam.goalsFor += result.homeScore;
                homeTeam.goalsAgainst += result.awayScore;
                awayTeam.goalsFor += result.awayScore;
                awayTeam.goalsAgainst += result.homeScore;
                
                // Determine result and update wins/losses/draws
                if (result.homeScore > result.awayScore) {
                    // Home team wins
                    homeTeam.wins++;
                    homeTeam.points += 3;
                    homeTeam.matchHistory.push('W');
                    homeTeam.headToHeadWins[awayTeam.id]++;
                    awayTeam.losses++;
                    awayTeam.matchHistory.push('L');
                } else if (result.homeScore < result.awayScore) {
                    // Away team wins
                    awayTeam.wins++;
                    awayTeam.points += 3;
                    awayTeam.matchHistory.push('W');
                    awayTeam.headToHeadWins[homeTeam.id]++;
                    homeTeam.losses++;
                    homeTeam.matchHistory.push('L');
                } else {
                    // Draw
                    homeTeam.draws++;
                    homeTeam.points += 1;
                    homeTeam.matchHistory.push('D');
                    awayTeam.draws++;
                    awayTeam.points += 1;
                    awayTeam.matchHistory.push('D');
                }
                
                // Calculate goal difference
                homeTeam.goalDifference = homeTeam.goalsFor - homeTeam.goalsAgainst;
                awayTeam.goalDifference = awayTeam.goalsFor - awayTeam.goalsAgainst;
            }
        }
    });
    
    // Sort standings with tie-breaker rules (same as calculateStandings)
    standings.sort((a, b) => {
        // 1st: Points
        if (a.points !== b.points) {
            return b.points - a.points;
        }
        
        // 2nd: Goal difference
        if (a.goalDifference !== b.goalDifference) {
            return b.goalDifference - a.goalDifference;
        }
        
        // 3rd: Total goals scored
        if (a.goalsFor !== b.goalsFor) {
            return b.goalsFor - a.goalsFor;
        }
        
        // 4th: Head-to-head wins
        const aHeadToHeadWins = Object.values(a.headToHeadWins).reduce((sum, wins) => sum + wins, 0);
        const bHeadToHeadWins = Object.values(b.headToHeadWins).reduce((sum, wins) => sum + wins, 0);
        
        if (aHeadToHeadWins !== bHeadToHeadWins) {
            return bHeadToHeadWins - aHeadToHeadWins;
        }
        
        // Final tie-breaker: alphabetical order
        return a.name.localeCompare(b.name);
    });
    
    return standings;
}

// Update standings table
function updateStandings() {
    const standings = calculateStandings();
    const tbody = document.getElementById('standings-body');
    tbody.innerHTML = '';
    
    // Determine first place teams (all teams with same points as leader)
    const firstPlacePoints = standings[0].points;
    const firstPlaceTeams = standings.filter(team => team.points === firstPlacePoints);
    
    standings.forEach((team, index) => {
        const row = document.createElement('tr');

        // TB3 logic: show '-' by default, only show head-to-head points if two teams are tied on points
        let tb3Value = '-';
        // Find all teams with the same points
        const tiedTeams = standings.filter(t => t.points === team.points);
        if (tiedTeams.length === 2) {
            // Only two teams tied, show head-to-head points for the other team
            const otherTeam = tiedTeams.find(t => t.id !== team.id);
            if (otherTeam) {
                // Find the result of the match between these two teams
                let headToHeadPoints = 0;
                let foundHeadToHeadMatch = false;
                results.forEach(result => {
                    if (
                        ((result.homeTeam === team.id && result.awayTeam === otherTeam.id) ||
                        (result.homeTeam === otherTeam.id && result.awayTeam === team.id)) &&
                        result.played
                    ) {
                        foundHeadToHeadMatch = true;
                        if (result.homeTeam === team.id) {
                            if (result.homeScore > result.awayScore) headToHeadPoints += 3;
                            else if (result.homeScore === result.awayScore) headToHeadPoints += 1;
                            // If homeScore < awayScore, headToHeadPoints remains 0 (loss)
                        } else if (result.awayTeam === team.id) {
                            if (result.awayScore > result.homeScore) headToHeadPoints += 3;
                            else if (result.homeScore === result.awayScore) headToHeadPoints += 1;
                            // If awayScore < homeScore, headToHeadPoints remains 0 (loss)
                        }
                    }
                });
                // Only show TB3 value if a head-to-head match was found between the tied teams
                if (foundHeadToHeadMatch) {
                    tb3Value = headToHeadPoints;
                }
            }
        }

        // Check if this team is in first place (tied for first)
        const isFirstPlace = firstPlaceTeams.includes(team);
        
        // Add first place class to row if team is tied for first
        if (isFirstPlace) {
            row.classList.add('first-place');
        }

        // Rank and goal difference colors
        const rankClass = index === 0 ? 'first' : index === 1 ? 'second' : index === 2 ? 'third' : '';
        const goalDiffClass = team.goalDifference > 0 ? 'goal-diff-positive' : 
                             team.goalDifference < 0 ? 'goal-diff-negative' : 'goal-diff-zero';

        // Get goal statistics for this team
        const goalStats = calculateGoalStatistics();
        const teamGoalStats = goalStats[team.id];
        
        row.innerHTML = `
            <td class="rank ${rankClass}">${index + 1}</td>
            <td class="team-name">${team.name}</td>
            <td class="stats">${team.played}</td>
            <td class="stats">${team.wins}-${team.losses}-${team.draws}</td>
            <td class="stats ${goalDiffClass}">${team.goalDifference > 0 ? '+' : ''}${team.goalDifference}</td>
            <td class="stats goals-cell" 
                onclick="showGoalTooltip(event, '${team.id}')" 
                onmouseover="showGoalTooltip(event, '${team.id}')" 
                onmouseout="handleTooltipMouseOut(event, '${team.id}')">${team.goalsFor}</td>
            <td class="stats">${tb3Value}</td>
            <td class="match-history">${generateMatchHistoryHTML(team.matchHistory)}</td>
            <td class="stats points">${team.points}</td>
        `;

        tbody.appendChild(row);
    });
    
    // Update knockout stage bracket with current group winners
    updateKnockoutStage();
}

// Generate match history HTML
function generateMatchHistoryHTML(history) {
    return history.map(result => {
        let className = '';
        switch(result) {
            case 'W': className = 'win'; break;
            case 'L': className = 'loss'; break;
            case 'D': className = 'draw'; break;
        }
        return `<span class="match-card ${className}">${result}</span>`;
    }).join('');
}

// Update all tabs
function updateAllTabs() {
    updateStandings();
    updateFixtures();
    updateStatistics();
    
    // Initialize forecast controls
    populateForecastControls();
}

// Update fixtures (merged calendar and results)
// Update fixtures with new enhanced functionality
function updateFixtures() {
    populateFixturesGroupSelector();
    updateTodaysGamesHeader();
    renderFixtures();
}

// Populate group selector for fixtures
function populateFixturesGroupSelector() {
    const groupSelect = document.getElementById('fixtures-group-select');
    if (!groupSelect) return;
    
    groupSelect.innerHTML = '';
    
    groups.forEach(group => {
        const option = document.createElement('option');
        option.value = group.id;
        option.textContent = `${group.name} - ${group.description}`;
        if (group.id === selectedGroupId) {
            option.selected = true;
        }
        groupSelect.appendChild(option);
    });
}

// Update today's games header
function updateTodaysGamesHeader() {
    const todaysGamesHeader = document.getElementById('todays-games-header');
    const todaysGamesList = document.getElementById('todays-games-list');
    
    const today = new Date();
    const todayStr = today.getFullYear() + '-' + 
                   String(today.getMonth() + 1).padStart(2, '0') + '-' + 
                   String(today.getDate()).padStart(2, '0');
    
    // Find all matches scheduled for today
    const todaysMatches = [];
    fixtures.forEach(gameweek => {
        gameweek.matches.forEach(match => {
            if (match.date === todayStr) {
                const homeTeam = teams.find(t => t.id === match.homeTeam);
                const awayTeam = teams.find(t => t.id === match.awayTeam);
                const group = groups.find(g => g.id === gameweek.groupId);
                todaysMatches.push({
                    ...match,
                    homeTeam,
                    awayTeam,
                    group,
                    gameweek: gameweek.gameweek
                });
            }
        });
    });
    
    if (todaysMatches.length > 0) {
        todaysGamesList.innerHTML = '';
        todaysMatches.forEach(match => {
            const matchItem = document.createElement('div');
            matchItem.className = 'todays-match-item';
            matchItem.innerHTML = `
                <div class="todays-match-teams">
                    ${match.homeTeam.name} vs ${match.awayTeam.name}
                    <span class="fixture-group-indicator">${match.group.name}</span>
                </div>
                <div class="todays-match-time">${match.time}</div>
            `;
            todaysGamesList.appendChild(matchItem);
        });
        todaysGamesHeader.style.display = 'block';
    } else {
        todaysGamesHeader.style.display = 'none';
    }
}

// Toggle between all fixtures and group-specific fixtures
function toggleAllFixtures() {
    const showAllCheckbox = document.getElementById('show-all-fixtures');
    const groupSelect = document.getElementById('fixtures-group-select');
    
    if (showAllCheckbox.checked) {
        groupSelect.disabled = true;
    } else {
        groupSelect.disabled = false;
    }
    
    renderFixtures();
}

// Update fixtures when group changes
function updateFixturesForGroup() {
    const showAllCheckbox = document.getElementById('show-all-fixtures');
    if (!showAllCheckbox.checked) {
        renderFixtures();
    }
}

// Render fixtures based on current settings
function renderFixtures() {
    const fixturesContent = document.getElementById('fixtures-content');
    const showAllCheckbox = document.getElementById('show-all-fixtures');
    const groupSelect = document.getElementById('fixtures-group-select');
    
    fixturesContent.innerHTML = '';
    
    let fixturesToShow = [];
    
    if (showAllCheckbox && showAllCheckbox.checked) {
        // Show all fixtures ordered by date
        fixtures.forEach(gameweek => {
            gameweek.matches.forEach(match => {
                fixturesToShow.push({
                    ...match,
                    gameweek: gameweek.gameweek,
                    groupId: gameweek.groupId
                });
            });
        });
        
        // Sort by date
        fixturesToShow.sort((a, b) => new Date(a.date) - new Date(b.date));
        
        // Group by date for display
        const matchesByDate = {};
        fixturesToShow.forEach(match => {
            if (!matchesByDate[match.date]) {
                matchesByDate[match.date] = [];
            }
            matchesByDate[match.date].push(match);
        });
        
        Object.keys(matchesByDate).forEach(date => {
            renderDateSection(date, matchesByDate[date], true);
        });
        
    } else {
        // Show fixtures for selected group only
        const selectedGroupId = groupSelect ? groupSelect.value : this.selectedGroupId;
        const groupFixtures = fixtures.filter(gameweek => gameweek.groupId === selectedGroupId);
        
        groupFixtures.forEach(gameweek => {
            renderGameweekSection(gameweek, false);
        });
    }
}

// Render a date section (for all fixtures view)
function renderDateSection(date, matches, showGroupIndicator) {
    const fixturesContent = document.getElementById('fixtures-content');
    
    const dateDiv = document.createElement('div');
    dateDiv.className = 'gameweek-section';
    
    const headerDiv = document.createElement('div');
    headerDiv.className = 'gameweek-header';
    
    const dateObj = new Date(date);
    const formattedDate = dateObj.toLocaleDateString('en-US', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
    });
    
    headerDiv.textContent = formattedDate;
    
    const matchesDiv = document.createElement('div');
    matchesDiv.className = 'gameweek-matches';
    
    matches.forEach(match => {
        const matchDiv = createMatchElement(match, showGroupIndicator);
        matchesDiv.appendChild(matchDiv);
    });
    
    dateDiv.appendChild(headerDiv);
    dateDiv.appendChild(matchesDiv);
    fixturesContent.appendChild(dateDiv);
}

// Render a gameweek section (for group-specific view)
function renderGameweekSection(gameweek, showGroupIndicator) {
    const fixturesContent = document.getElementById('fixtures-content');
    
    const gameweekDiv = document.createElement('div');
    gameweekDiv.className = 'gameweek-section';
    
    const headerDiv = document.createElement('div');
    headerDiv.className = 'gameweek-header';
    headerDiv.textContent = `Gameweek ${gameweek.gameweek}`;
    
    const matchesDiv = document.createElement('div');
    matchesDiv.className = 'gameweek-matches';
    
    gameweek.matches.forEach(match => {
        const matchWithGameweek = {
            ...match,
            gameweek: gameweek.gameweek,
            groupId: gameweek.groupId
        };
        const matchDiv = createMatchElement(matchWithGameweek, showGroupIndicator);
        matchesDiv.appendChild(matchDiv);
    });
    
    gameweekDiv.appendChild(headerDiv);
    gameweekDiv.appendChild(matchesDiv);
    fixturesContent.appendChild(gameweekDiv);
}

// Create a match element
function createMatchElement(match, showGroupIndicator) {
    const homeTeam = teams.find(t => t.id === match.homeTeam);
    const awayTeam = teams.find(t => t.id === match.awayTeam);
    const result = results.find(r => r.matchId === match.id && r.played);
    const group = groups.find(g => g.id === match.groupId);
    
    const matchDiv = document.createElement('div');
    matchDiv.className = 'match-item';
    
    const date = new Date(match.date);
    const formattedDate = date.toLocaleDateString('en-US', { 
        weekday: 'short', 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric' 
    });
    
    const scoreDisplay = result ? 
        `${result.homeScore} - ${result.awayScore}` : 
        ` - `;
    
    // Check if match is today
    const today = new Date();
    const todayStr = today.getFullYear() + '-' + 
                   String(today.getMonth() + 1).padStart(2, '0') + '-' + 
                   String(today.getDate()).padStart(2, '0');
    
    const isToday = match.date === todayStr;
    
    let matchIndicator = '';
    if (!result && isToday) {
        matchIndicator = '<span class="match-indicator today">Today</span>';
    }
    
    const scoreClass = result ? 'completed' : 'upcoming';
    
    // Group indicator (only show in all fixtures view)
    const groupIndicator = showGroupIndicator ? 
        `<span class="fixture-group-indicator">${group.name}</span>` : '';
    
    // Admin add result button (only for today's matches without results)
    const addResultButton = (!result && ADMIN_CONFIG.role === 'admin') ? 
        `<button class="add-result-btn" onclick="showAddResultModal('${match.id}', '${homeTeam.name}', '${awayTeam.name}', '${match.date}', '${match.time}')">+</button>` : '';
    
    // Edit result button (only for today's matches with results, until midnight)
    const editResultButton = (result && isToday && ADMIN_CONFIG.role === 'admin') ? 
        `<button class="edit-result-btn" onclick="showEditResultModal('${match.id}', '${homeTeam.name}', '${awayTeam.name}', '${match.date}', '${match.time}', ${result.homeScore}, ${result.awayScore})">Edit</button>` : '';
    
    matchDiv.innerHTML = `
        <div class="match-teams">
            ${homeTeam.name} <span class="match-vs">vs</span> ${awayTeam.name}
            ${matchIndicator}
            ${groupIndicator}
        </div>
        <div class="match-datetime-container">
            ${addResultButton}
            ${editResultButton}
            <div class="match-datetime">${formattedDate} - ${match.time}</div>
        </div>
        <div class="match-score ${scoreClass}">${scoreDisplay}</div>
    `;
    
    return matchDiv;
}

// AI-Powered Simulator functionality
async function updateSimulation() {
    const selectedTeamId = document.getElementById('selected-team').value;
    const selectedTeam = teams.find(t => t.id === selectedTeamId); // Use all teams, not just group teams
    
    if (!selectedTeam) return;
    
    const simulationResults = document.getElementById('simulation-results');
    simulationResults.innerHTML = '<div class="loading">⚽ Analyzing championship scenarios...</div>';
    
    try {
        // Debug logging for OpenAI configuration
        console.log('🔍 OpenAI Debug Info:', {
            useOpenAI: SIMULATION_CONFIG.useOpenAI,
            openaiClientExists: !!OPENAI_CONFIG.apiKey,
            apiKeyExists: !!OPENAI_CONFIG.apiKey,
            apiKeyPrefix: OPENAI_CONFIG.apiKey ? OPENAI_CONFIG.apiKey.substring(0, 12) + '...' : 'none'
        });
        
        // Check if OpenRouter is enabled and configured
        if (SIMULATION_CONFIG.useOpenAI && OPENAI_CONFIG.apiKey) {
            console.log('✅ Using OpenRouter for simulation analysis');
            try {
                const aiAnalysis = await generateAISimulation(selectedTeamId, selectedTeam);
                simulationResults.innerHTML = aiAnalysis;
            } catch (aiError) {
                console.warn('AI analysis failed, falling back to custom analysis:', aiError.message);
                
                // Show error message and fallback to custom analysis
                const errorMessage = `
                    <div class="ai-powered-badge" style="background: linear-gradient(135deg, #ff6b6b, #ee5a24); color: white; margin-bottom: 15px;">
                        <small>⚠️ AI Analysis Failed: ${aiError.message}</small>
                    </div>
                    <div class="ai-powered-badge" style="margin-bottom: 20px;">
                        <small>🔄 Showing enhanced analysis instead</small>
                    </div>
                `;
                const customAnalysis = generateCustomSimulation(selectedTeamId, selectedTeam);
                simulationResults.innerHTML = errorMessage + customAnalysis;
            }
        } else {
            // Use custom championship analysis
            const reason = !SIMULATION_CONFIG.useOpenAI ? 'OpenAI disabled' : 
                          !OPENAI_CONFIG.apiKey ? 'OpenRouter client not initialized' : 
                          !OPENAI_CONFIG.apiKey ? 'No API key available' : 'Unknown';
                          
            console.log('⚠️ Using fallback analysis because:', {
                useOpenAI: SIMULATION_CONFIG.useOpenAI,
                openaiClient: !!OPENAI_CONFIG.apiKey,
                hasApiKey: !!OPENAI_CONFIG.apiKey,
                reason: reason
            });
            
            const customAnalysis = generateCustomSimulation(selectedTeamId, selectedTeam);
            simulationResults.innerHTML = customAnalysis;
        }
    } catch (error) {
        console.error('Simulation error:', error);
        // Final fallback to basic simulation on any error
        const errorMessage = `
            <div class="ai-powered-badge" style="background: linear-gradient(135deg, #dc3545, #c82333); color: white; margin-bottom: 15px;">
                <small>⚠️ Analysis temporarily unavailable: ${error.message}</small>
            </div>
        `;
        simulationResults.innerHTML = errorMessage + generateFallbackSimulation(selectedTeamId, selectedTeam);
    }
}

async function generateAISimulation(teamId, team) {
    // Check if OpenAI client is initialized
    if (!OPENAI_CONFIG.apiKey) {
        throw new Error('OpenAI client not initialized');
    }

    // Set the selected group to the team's group for proper calculations
    const teamData = teams.find(t => t.id === teamId);
    if (!teamData) throw new Error('Team not found');
    
    const originalGroupId = selectedGroupId;
    selectedGroupId = teamData.groupId; // Temporarily switch to team's group

    const currentStandings = calculateStandings();
    const teamStanding = currentStandings.find(t => t.id === teamId);
    const currentPosition = currentStandings.findIndex(t => t.id === teamId) + 1;
    const remainingMatches = getRemainingMatches(teamId);
    const nextGameweek = findNextGameweek();
    
    // Prepare data for AI analysis
    const contextData = prepareAIContext(teamId, team, currentStandings, nextGameweek);
    
    try {
        const aiInsights = await queryOpenAI(contextData);
        const result = generateAISimulationHTML(teamId, team, currentStandings, remainingMatches, aiInsights);
        
        // Restore original group selection
        selectedGroupId = originalGroupId;
        return result;
    } catch (error) {
        // Restore original group selection on error
        selectedGroupId = originalGroupId;
        console.error('OpenAI API error:', error);
        throw error;
    }
}

function generateAPIKeyPrompt() {
    return `
        <div class="api-key-prompt">
            <div class="simulation-header">🔑 OpenAI Configuration</div>
            <div class="simulation-content">
                <p><strong>Option 1:</strong> Create a <code>config.json</code> file:</p>
                <pre style="background: #f5f5f5; padding: 10px; border-radius: 4px; font-family: monospace;">{"OPENAI_API_KEY": "your-api-key-here"}</pre>
                
                <p style="margin-top: 15px;"><strong>Option 2:</strong> Add to <code>.env</code> file (may not work in all servers):</p>
                <pre style="background: #f5f5f5; padding: 10px; border-radius: 4px; font-family: monospace;">OPENAI_API_KEY=your-api-key-here</pre>
                
                <p style="margin-top: 15px;"><strong>Option 3:</strong> Enter your API key manually:</p>
                <div style="margin: 15px 0;">
                    <input type="password" id="openai-key-input" placeholder="Enter your OpenAI API key" style="width: 300px; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
                    <button onclick="saveAPIKey()" style="margin-left: 10px; padding: 8px 15px; background: #3498db; color: white; border: none; border-radius: 4px; cursor: pointer;">Save Key</button>
                </div>
                <p style="font-size: 0.9em; color: #666;">Get your API key at <a href="https://platform.openai.com/api-keys" target="_blank">OpenAI Platform</a>. Keys are stored securely and never sent to our servers.</p>
            </div>
        </div>
    `;
}

function saveAPIKey() {
    const keyInput = document.getElementById('openai-key-input');
    const apiKey = keyInput.value.trim();
    
    if (apiKey) {
        setOpenAIKey(apiKey);
        updateSimulation(); // Refresh simulation with AI
    } else {
        alert('Please enter a valid API key');
    }
}

function prepareAIContext(teamId, team, standings, nextGameweek) {
    const teamPosition = standings.findIndex(t => t.id === teamId) + 1;
    const teamsAbove = standings.slice(0, teamPosition - 1);
    const teamsBelow = standings.slice(teamPosition);
    
    // Get next gameweek matches involving top teams
    const relevantMatches = nextGameweek ? nextGameweek.matches.filter(match => {
        const topTeamIds = standings.slice(0, Math.min(4, standings.length)).map(t => t.id);
        return topTeamIds.includes(match.homeTeam) || topTeamIds.includes(match.awayTeam);
    }) : [];
    
    // Format matches with team names
    const formattedMatches = relevantMatches.map(match => {
        const groupTeams = getTeamsForGroup();
        const homeTeam = groupTeams.find(t => t.id === match.homeTeam);
        const awayTeam = groupTeams.find(t => t.id === match.awayTeam);
        return {
            home: homeTeam ? homeTeam.name : match.homeTeam,
            away: awayTeam ? awayTeam.name : match.awayTeam,
            date: match.date,
            time: match.time,
            isTeamInvolved: match.homeTeam === teamId || match.awayTeam === teamId
        };
    });
    
    return {
        selectedTeam: {
            name: team.name,
            position: teamPosition,
            points: standings.find(t => t.id === teamId).points,
            goalDifference: standings.find(t => t.id === teamId).goalDifference,
            goalsFor: standings.find(t => t.id === teamId).goalsFor,
            matchHistory: standings.find(t => t.id === teamId).matchHistory.slice(-5)
        },
        currentStandings: standings.slice(0, 6).map((team, index) => ({
            position: index + 1,
            name: team.name,
            points: team.points,
            goalDifference: team.goalDifference,
            goalsFor: team.goalsFor
        })),
        nextGameweek: nextGameweek ? {
            gameweek: nextGameweek.gameweek,
            matches: formattedMatches
        } : null,
        remainingMatches: getRemainingMatches(teamId).length
    };
}

async function queryOpenAI(contextData) {
    const prompt = generateAIPrompt(contextData);
    
    // Validate API key is available
    if (!OPENAI_CONFIG.apiKey) {
        throw new Error('OpenRouter API key not available. Please check your configuration.');
    }
    
    // Retry logic with exponential backoff
    let lastError;
    for (let attempt = 1; attempt <= OPENAI_CONFIG.retryAttempts; attempt++) {
        try {
            console.log(`OpenRouter API attempt ${attempt}/${OPENAI_CONFIG.retryAttempts}`);
            
            // Create abort controller for timeout
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), OPENAI_CONFIG.timeoutMs);
            
            const requestBody = {
                model: OPENAI_CONFIG.model,
                messages: [
                    {
                        role: 'system',
                        content: 'You are an expert football championship analyst. Provide concise strategic insights about championship scenarios. Focus on key points and be brief.'
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                max_tokens: OPENAI_CONFIG.maxTokens,
                temperature: OPENAI_CONFIG.temperature,
                stop: ["\n\n\n", "---"]
            };

            const response = await fetch(`${OPENAI_CONFIG.baseURL}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${OPENAI_CONFIG.apiKey}`
                },
                body: JSON.stringify(requestBody),
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(`HTTP ${response.status}: ${errorData.error?.message || response.statusText}`);
            }
            
            const data = await response.json();
            
            // Log and track token usage for cost monitoring
            if (data.usage) {
                console.log('Token usage:', {
                    prompt_tokens: data.usage.prompt_tokens,
                    completion_tokens: data.usage.completion_tokens,
                    total_tokens: data.usage.total_tokens,
                    estimated_cost: '$' + ((data.usage.total_tokens / 1000) * 0.002).toFixed(4)
                });
                updateCostEstimate(data.usage);
            }
            
            return data.choices[0].message.content;
            
        } catch (error) {
            lastError = error;
            console.warn(`OpenRouter API attempt ${attempt} failed:`, error.message);
            
            // Extract status code from error message for HTTP errors
            const httpStatusMatch = error.message.match(/HTTP (\d+)/);
            const statusCode = httpStatusMatch ? parseInt(httpStatusMatch[1]) : null;
            
            // Don't retry on certain errors
            if (statusCode === 401 || statusCode === 403 || statusCode === 400) {
                break; // Authentication or bad request errors shouldn't be retried
            }
            
            // Handle rate limiting with longer delays
            if (statusCode === 429) {
                const isRateLimit = error.message && error.message.toLowerCase().includes('rate limit');
                const baseDelay = isRateLimit ? OPENAI_CONFIG.retryDelay * 2 : OPENAI_CONFIG.retryDelay;
                const delay = baseDelay * Math.pow(2, attempt - 1); // Exponential backoff
                
                if (attempt < OPENAI_CONFIG.retryAttempts) {
                    console.log(`Rate limited. Waiting ${delay}ms before retry...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    continue;
                }
            }
            
            // For other errors, use exponential backoff
            if (attempt < OPENAI_CONFIG.retryAttempts) {
                const delay = OPENAI_CONFIG.retryDelay * Math.pow(2, attempt - 1);
                console.log(`Retrying in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }
    
    // All retries exhausted, throw the last error with context
    throw handleOpenAIError(lastError);
}

// Enhanced error handling with user-friendly messages
function handleOpenAIError(error) {
    console.error('OpenAI API error after retries:', error);
    
    if (error.status === 401) {
        return new Error('❌ Invalid API key. Please check your OpenAI API key in the .env file.');
    } else if (error.status === 429) {
        return new Error('⏱️ Rate limit exceeded. Please wait a moment and try again.');
    } else if (error.status === 400) {
        return new Error('⚠️ Bad request. Please check your API configuration.');
    } else if (error.status === 403) {
        return new Error('🚫 Access forbidden. Please check your API key permissions.');
    } else if (error.status === 500 || error.status === 502 || error.status === 503) {
        return new Error('🔧 OpenAI service temporarily unavailable. Please try again later.');
    } else if (error.message && error.message.includes('timeout')) {
        return new Error('⏰ Request timeout. Please check your internet connection and try again.');
    } else if (error.message && (error.message.includes('fetch') || error.message.includes('network'))) {
        return new Error('🌐 Network error. Please check your internet connection.');
    } else {
        return new Error(`🤖 OpenAI API error: ${error.message || 'Unknown error occurred'}`);
    }
}

function generateAIPrompt(contextData) {
    const { selectedTeam, currentStandings, nextGameweek } = contextData;
    
    return `
Analyze the championship scenario for ${selectedTeam.name} and provide strategic insights.

CURRENT STANDINGS:
${currentStandings.map(team => 
    `${team.position}. ${team.name} - ${team.points} pts (GD: ${team.goalDifference > 0 ? '+' : ''}${team.goalDifference})`
).join('\n')}

SELECTED TEAM: ${selectedTeam.name}
- Current Position: ${selectedTeam.position}${getOrdinalSuffix(selectedTeam.position)}
- Points: ${selectedTeam.points}
- Goal Difference: ${selectedTeam.goalDifference > 0 ? '+' : ''}${selectedTeam.goalDifference}
- Recent Form: ${selectedTeam.matchHistory.join('-')}
- Remaining Matches: ${contextData.remainingMatches}

${nextGameweek ? `
NEXT GAMEWEEK ${nextGameweek.gameweek} FIXTURES:
${nextGameweek.matches.map(match => 
    `${match.home} vs ${match.away}${match.isTeamInvolved ? ' ⭐ (YOUR TEAM)' : ''}`
).join('\n')}
` : 'No upcoming fixtures scheduled.'}

Please provide a comprehensive analysis in the following JSON format:
{
    "toReachFirst": {
        "yourTeamNeeds": "What your team must do (win/draw/lose scenarios)",
        "otherTeamsNeeds": "What other teams need to do to help you",
        "probability": "high/medium/low",
        "keyFactors": ["factor1", "factor2", "factor3"]
    },
    "toMaintainFirst": {
        "applicable": true/false,
        "requirements": "What's needed to stay 1st (if currently 1st)",
        "threats": ["threat1", "threat2"]
    },
    "toAvoidDrop": {
        "dangerousScenarios": ["scenario1", "scenario2"],
        "safetyRequirements": "What you need to avoid dropping",
        "riskLevel": "high/medium/low"
    },
    "strategicInsights": [
        "insight1",
        "insight2", 
        "insight3"
    ],
    "summary": "Brief 2-3 sentence summary of the championship situation"
}

Focus on realistic match outcomes and strategic implications. Consider tie-breakers (goal difference, goals scored, head-to-head).
`;
}

function generateAISimulationHTML(teamId, team, standings, remainingMatches, aiInsights) {
    const teamStanding = standings.find(t => t.id === teamId);
    const currentPosition = standings.findIndex(t => t.id === teamId) + 1;
    
    let parsedInsights;
    try {
        // Try to parse JSON response
        const jsonMatch = aiInsights.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            parsedInsights = JSON.parse(jsonMatch[0]);
        } else {
            throw new Error('No JSON found in response');
        }
    } catch (error) {
        // Fallback to text analysis
        parsedInsights = parseTextInsights(aiInsights);
    }
    
    return `
        <div class="simulation-section">
            <div class="simulation-header">
                🤖 AI Championship Analysis for <span class="selected-team-highlight">${team.name}</span>
            </div>
            <div class="simulation-content">
                <div class="current-position">
                    <h4>Current Standing: ${currentPosition}${getOrdinalSuffix(currentPosition)} Place</h4>
                    <div class="position-stats">
                        <div class="stat-item">
                            <div class="stat-value">${teamStanding.points}</div>
                            <div class="stat-label">Points</div>
                        </div>
                        <div class="stat-item">
                            <div class="stat-value ${getGoalDiffClass(teamStanding.goalDifference)}">${teamStanding.goalDifference > 0 ? '+' : ''}${teamStanding.goalDifference}</div>
                            <div class="stat-label">Goal Diff</div>
                        </div>
                        <div class="stat-item">
                            <div class="stat-value">${teamStanding.goalsFor}</div>
                            <div class="stat-label">Total Goals</div>
                        </div>
                        <div class="stat-item">
                            <div class="stat-value">${teamStanding.played}</div>
                            <div class="stat-label">Matches</div>
                        </div>
                    </div>
                </div>
                
                ${remainingMatches.length > 0 ? `
                <div class="remaining-matches">
                    <h4>Remaining Matches (${remainingMatches.length})</h4>
                    <div class="match-list">
                        ${remainingMatches.map(match => generateRemainingMatchHTML(match)).join('')}
                    </div>
                </div>
                ` : '<div class="remaining-matches"><h4>All matches completed for this team</h4></div>'}
            </div>
        </div>
        
        <div class="simulation-section">
            <div class="simulation-header">
                🏆 Championship Scenarios
            </div>
            <div class="simulation-content">
                ${generateAIInsightsHTML(parsedInsights, currentPosition)}
            </div>
        </div>
        
        <div class="simulation-section">
            <div class="simulation-header">
                📊 Strategic Summary
            </div>
            <div class="simulation-content">
                <div class="ai-summary">
                    ${parsedInsights.summary || 'Championship analysis complete.'}
                </div>
                <div class="ai-powered-badge">
                    <small>🤖 Powered by OpenAI GPT-4</small>
                </div>
            </div>
        </div>
    `;
}

function generateAIInsightsHTML(insights, currentPosition) {
    let html = '';
    
    // To Reach First Place
    if (currentPosition > 1 && insights.toReachFirst) {
        const probabilityClass = `probability-${insights.toReachFirst.probability || 'medium'}`;
        html += `
            <div class="ai-scenario result-good">
                <div class="scenario-title">🥇 Path to 1st Place</div>
                <div class="scenario-description">${insights.toReachFirst.yourTeamNeeds || 'Win your matches and hope for favorable results.'}</div>
                <div style="margin-top: 10px;">
                    <strong>Requirements:</strong>
                    <ul style="margin: 5px 0 0 20px;">
                        <li>Your team: ${insights.toReachFirst.yourTeamNeeds || 'Strong performance needed'}</li>
                        <li>Other teams: ${insights.toReachFirst.otherTeamsNeeds || 'Need competitors to drop points'}</li>
                        ${insights.toReachFirst.keyFactors ? insights.toReachFirst.keyFactors.map(factor => `<li>${factor}</li>`).join('') : ''}
                    </ul>
                </div>
                <span class="scenario-probability ${probabilityClass}">
                    ${insights.toReachFirst.probability ? insights.toReachFirst.probability.charAt(0).toUpperCase() + insights.toReachFirst.probability.slice(1) : 'Medium'} Probability
                </span>
            </div>
        `;
    }
    
    // To Maintain First Place
    if (currentPosition === 1 && insights.toMaintainFirst && insights.toMaintainFirst.applicable) {
        html += `
            <div class="ai-scenario result-good">
                <div class="scenario-title">👑 Maintaining Leadership</div>
                <div class="scenario-description">${insights.toMaintainFirst.requirements || 'Keep performing well to stay on top.'}</div>
                ${insights.toMaintainFirst.threats && insights.toMaintainFirst.threats.length > 0 ? `
                    <div style="margin-top: 10px;">
                        <strong>Threats to Watch:</strong>
                        <ul style="margin: 5px 0 0 20px;">
                            ${insights.toMaintainFirst.threats.map(threat => `<li>${threat}</li>`).join('')}
                        </ul>
                    </div>
                ` : ''}
                <span class="scenario-probability probability-high">High Priority</span>
            </div>
        `;
    }
    
    // To Avoid Dropping
    if (insights.toAvoidDrop) {
        const riskClass = insights.toAvoidDrop.riskLevel === 'high' ? 'result-bad' : 
                         insights.toAvoidDrop.riskLevel === 'medium' ? 'result-neutral' : 'result-good';
        html += `
            <div class="ai-scenario ${riskClass}">
                <div class="scenario-title">🛡️ Avoiding Position Drop</div>
                <div class="scenario-description">${insights.toAvoidDrop.safetyRequirements || 'Maintain current form to avoid dropping.'}</div>
                ${insights.toAvoidDrop.dangerousScenarios && insights.toAvoidDrop.dangerousScenarios.length > 0 ? `
                    <div style="margin-top: 10px;">
                        <strong>Dangerous Scenarios:</strong>
                        <ul style="margin: 5px 0 0 20px;">
                            ${insights.toAvoidDrop.dangerousScenarios.map(scenario => `<li>${scenario}</li>`).join('')}
                        </ul>
                    </div>
                ` : ''}
                <span class="scenario-probability probability-${insights.toAvoidDrop.riskLevel || 'medium'}">
                    ${insights.toAvoidDrop.riskLevel ? insights.toAvoidDrop.riskLevel.charAt(0).toUpperCase() + insights.toAvoidDrop.riskLevel.slice(1) : 'Medium'} Risk
                </span>
            </div>
        `;
    }
    
    // Strategic Insights
    if (insights.strategicInsights && insights.strategicInsights.length > 0) {
        html += `
            <div class="ai-scenario result-neutral">
                <div class="scenario-title">💡 Strategic Insights</div>
                <div class="scenario-description">Key factors that could influence your championship chances:</div>
                <div style="margin-top: 10px;">
                    <ul style="margin: 5px 0 0 20px;">
                        ${insights.strategicInsights.map(insight => `<li>${insight}</li>`).join('')}
                    </ul>
                </div>
                <span class="scenario-probability probability-medium">Expert Analysis</span>
            </div>
        `;
    }
    
    return html || '<p>AI analysis in progress...</p>';
}

function parseTextInsights(aiText) {
    // Fallback text parser for when JSON parsing fails
    return {
        toReachFirst: {
            yourTeamNeeds: extractTextBetween(aiText, 'your team', ['other teams', 'maintain', 'avoid']),
            probability: aiText.toLowerCase().includes('high') ? 'high' : 
                        aiText.toLowerCase().includes('low') ? 'low' : 'medium',
            keyFactors: []
        },
        toMaintainFirst: {
            applicable: aiText.toLowerCase().includes('maintain') || aiText.toLowerCase().includes('stay'),
            requirements: extractTextBetween(aiText, 'maintain', ['avoid', 'drop', 'insight']),
            threats: []
        },
        toAvoidDrop: {
            dangerousScenarios: [],
            safetyRequirements: extractTextBetween(aiText, 'avoid', ['insight', 'summary']),
            riskLevel: aiText.toLowerCase().includes('high risk') ? 'high' : 'medium'
        },
        strategicInsights: aiText.split('\n').filter(line => 
            line.includes('•') || line.includes('-') || line.includes('*')
        ).slice(0, 3),
        summary: aiText.split('\n').slice(-3).join(' ').substring(0, 200) + '...'
    };
}

function extractTextBetween(text, startKeyword, endKeywords) {
    const startIndex = text.toLowerCase().indexOf(startKeyword.toLowerCase());
    if (startIndex === -1) return '';
    
    let endIndex = text.length;
    endKeywords.forEach(keyword => {
        const keywordIndex = text.toLowerCase().indexOf(keyword.toLowerCase(), startIndex + startKeyword.length);
        if (keywordIndex !== -1 && keywordIndex < endIndex) {
            endIndex = keywordIndex;
        }
    });
    
    return text.substring(startIndex, endIndex).substring(startKeyword.length).trim();
}

function generateCustomSimulation(teamId, team) {
    // Custom championship analysis within points gap
    // First, set the selected group to the team's group for proper calculations
    const teamData = teams.find(t => t.id === teamId);
    if (!teamData) return '<div class="error">Team not found</div>';
    
    const originalGroupId = selectedGroupId;
    selectedGroupId = teamData.groupId; // Temporarily switch to team's group
    
    const currentStandings = calculateStandings();
    const teamStanding = currentStandings.find(t => t.id === teamId);
    const currentPosition = currentStandings.findIndex(t => t.id === teamId) + 1;
    const remainingMatches = getRemainingMatches(teamId);
    
    // Get teams within 3-point gap
    const relevantTeams = getTeamsWithinGap(currentStandings, teamId, SIMULATION_CONFIG.pointsGapLimit);
    
    // Calculate all possible scenarios
    const scenarios = calculateAdvancedScenarios(teamId, currentStandings, relevantTeams);
    
    // Restore original group selection
    selectedGroupId = originalGroupId;
    
    return `
        <div class="simulation-section">
            <div class="simulation-header">
                🏆 Next Gameweek Analysis for <span class="selected-team-highlight">${team.name}</span>
            </div>
            <div class="simulation-content">
                <div class="current-position">
                    <h4>Current Standing: ${currentPosition}${getOrdinalSuffix(currentPosition)} Place</h4>
                    <div class="position-stats">
                        <div class="stat-item">
                            <div class="stat-value">${teamStanding.points}</div>
                            <div class="stat-label">Points</div>
                        </div>
                        <div class="stat-item">
                            <div class="stat-value ${getGoalDiffClass(teamStanding.goalDifference)}">${teamStanding.goalDifference > 0 ? '+' : ''}${teamStanding.goalDifference}</div>
                            <div class="stat-label">Goal Diff</div>
                        </div>
                        <div class="stat-item">
                            <div class="stat-value">${teamStanding.goalsFor}</div>
                            <div class="stat-label">Total Goals</div>
                        </div>
                        <div class="stat-item">
                            <div class="stat-value">${teamStanding.played}</div>
                            <div class="stat-label">Matches</div>
                        </div>
                    </div>
                </div>
                
                <div class="relevant-teams">
                    <h4>Teams Within ${SIMULATION_CONFIG.pointsGapLimit}-Point Gap (Next Gameweek Focus)</h4>
                    <div class="teams-list">
                        ${relevantTeams.map(team => {
                            const nextGameweek = findNextGameweek();
                            const hasMatch = nextGameweek ? nextGameweek.matches.some(match => 
                                match.homeTeam === team.id || match.awayTeam === team.id
                            ) : false;
                            const matchIndicator = hasMatch ? '⚽' : '🚫';
                            
                            return `
                            <div class="team-item ${team.id === teamId ? 'current-team' : ''}">
                                <span class="team-position">${team.position}</span>
                                <span class="team-name">${team.name} ${matchIndicator}</span>
                                <span class="team-points">${team.points} pts</span>
                                <span class="team-gap">${team.gap > 0 ? '+' : ''}${team.gap}</span>
                            </div>
                        `;}).join('')}
                    </div>
                    <p style="font-size: 0.8rem; margin-top: 10px; color: #666;">
                        ⚽ = Plays next gameweek | 🚫 = No match scheduled
                    </p>
                </div>
                
                ${remainingMatches.length > 0 ? `
                <div class="remaining-matches">
                    <h4>Remaining Matches (${remainingMatches.length})</h4>
                    <div class="match-list">
                        ${remainingMatches.map(match => generateRemainingMatchHTML(match)).join('')}
                    </div>
                </div>
                ` : '<div class="remaining-matches"><h4>All matches completed for this team</h4></div>'}
            </div>
        </div>
        
        <div class="simulation-section">
            <div class="simulation-header">
                📊 Next Gameweek Scenario Analysis for <span class="selected-team-highlight">${team.name}</span>
            </div>
            <div class="simulation-content">
                ${generateAdvancedScenariosHTML(scenarios, currentPosition)}
            </div>
        </div>
        
        <div class="simulation-section">
            <div class="simulation-header">
                📈 Strategic Summary
            </div>
            <div class="simulation-content">
                <div class="strategic-summary">
                    <p><strong>Next Gameweek Focus:</strong> Immediate impact scenarios only</p>
                    <p><strong>Teams in Analysis:</strong> ${relevantTeams.length - 1} competitors within ${SIMULATION_CONFIG.pointsGapLimit}-point gap</p>
                    <p><strong>Scenarios for Next Round:</strong> ${scenarios.length} possible outcomes</p>
                    <p><strong>Analysis Type:</strong> Win/Draw/Loss impact on position</p>
                </div>
            </div>
        </div>
    `;
}

function generateFallbackSimulation(teamId, team) {
    // Fallback simulation when AI is not available
    const currentStandings = calculateStandings();
    const teamStanding = currentStandings.find(t => t.id === teamId);
    const currentPosition = currentStandings.findIndex(t => t.id === teamId) + 1;
    const remainingMatches = getRemainingMatches(teamId);
    const scenarios = calculateBasicScenarios(teamId, currentStandings);
    
    return `
        <div class="simulation-section">
            <div class="simulation-header">
                Current Position: ${team.name}
            </div>
            <div class="simulation-content">
                <div class="current-position">
                    <h4>Current Standing: ${currentPosition}${getOrdinalSuffix(currentPosition)} Place</h4>
                    <div class="position-stats">
                        <div class="stat-item">
                            <div class="stat-value">${teamStanding.points}</div>
                            <div class="stat-label">Points</div>
                        </div>
                        <div class="stat-item">
                            <div class="stat-value ${getGoalDiffClass(teamStanding.goalDifference)}">${teamStanding.goalDifference > 0 ? '+' : ''}${teamStanding.goalDifference}</div>
                            <div class="stat-label">Goal Diff</div>
                        </div>
                        <div class="stat-item">
                            <div class="stat-value">${teamStanding.goalsFor}</div>
                            <div class="stat-label">Total Goals</div>
                        </div>
                        <div class="stat-item">
                            <div class="stat-value">${teamStanding.played}</div>
                            <div class="stat-label">Matches</div>
                        </div>
                    </div>
                </div>
                
                ${remainingMatches.length > 0 ? `
                <div class="remaining-matches">
                    <h4>Remaining Matches (${remainingMatches.length})</h4>
                    <div class="match-list">
                        ${remainingMatches.map(match => generateRemainingMatchHTML(match)).join('')}
                    </div>
                </div>
                ` : '<div class="remaining-matches"><h4>All matches completed for this team</h4></div>'}
            </div>
        </div>
        
        <div class="simulation-section">
            <div class="simulation-header">
                Basic Championship Scenarios for <span class="selected-team-highlight">${team.name}</span>
            </div>
            <div class="simulation-content">
                ${scenarios.length > 0 ? `
                    <ul class="scenarios-list">
                        ${scenarios.map(scenario => `
                            <li class="scenario-item result-${scenario.resultType || 'neutral'}">
                                <div class="scenario-title">${scenario.title}</div>
                                <div class="scenario-description">${scenario.description}</div>
                                ${scenario.requirements.length > 0 ? `
                                    <div style="margin-top: 10px;">
                                        <strong>Requirements:</strong>
                                        <ul style="margin: 5px 0 0 20px;">
                                            ${scenario.requirements.map(req => `<li>${req}</li>`).join('')}
                                        </ul>
                                    </div>
                                ` : ''}
                                <span class="scenario-probability probability-${scenario.probability}">
                                    ${scenario.probability === 'none' ? 'Not Possible' : scenario.probability.charAt(0).toUpperCase() + scenario.probability.slice(1) + ' Probability'}
                                </span>
                            </li>
                        `).join('')}
                    </ul>
                ` : '<p>No viable championship scenarios available for next gameweek with current standings and remaining matches.</p>'}
                <div style="margin-top: 20px; padding: 15px; background: #f8f9fa; border-radius: 8px; text-align: center;">
                    <p><strong>💡 Want AI-powered insights?</strong></p>
                    <p>Add your OpenAI API key above to get intelligent championship analysis!</p>
                </div>
            </div>
        </div>
    `;
}

function generateRemainingMatchHTML(match) {
    const date = new Date(match.date);
    const formattedDate = date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric' 
    });
    
    return `
        <div class="remaining-match">
            <div class="match-teams-sim">
                <span class="team-home">${match.homeTeamName}</span>
                <span class="vs-separator">vs</span>
                <span class="team-away">${match.awayTeamName}</span>
            </div>
            <div class="match-date-sim">${formattedDate} - ${match.time}</div>
        </div>
    `;
}

function getTeamsWithinGap(standings, selectedTeamId, pointsGap) {
    const selectedTeam = standings.find(t => t.id === selectedTeamId);
    const selectedPosition = standings.findIndex(t => t.id === selectedTeamId) + 1;
    
    return standings.map((team, index) => ({
        ...team,
        position: index + 1,
        gap: team.points - selectedTeam.points
    })).filter(team => {
        const gap = Math.abs(team.points - selectedTeam.points);
        return gap <= pointsGap;
    });
}

function calculateAdvancedScenarios(selectedTeamId, standings, relevantTeams) {
    const scenarios = [];
    const selectedTeam = standings.find(t => t.id === selectedTeamId);
    const currentPosition = standings.findIndex(t => t.id === selectedTeamId) + 1;
    
    // Get next gameweek instead of all remaining matches
    const nextGameweek = findNextGameweek();
    if (!nextGameweek) {
        return [{
            type: 'no-matches',
            title: 'No Upcoming Matches',
            description: 'No matches scheduled for the next gameweek.',
            requirements: [],
            probability: 'none',
            resultType: 'neutral'
        }];
    }
    
    // Find selected team's match
    const selectedMatch = nextGameweek.matches.find(match => 
        match.homeTeam === selectedTeamId || match.awayTeam === selectedTeamId
    );
    
    if (!selectedMatch) {
        // Team doesn't play - analyze other teams' results only
        const nextGameweekMatches = getNextGameweekMatchesForTeams(relevantTeams, nextGameweek);
        return calculateRestGameweekScenarios(selectedTeamId, standings, relevantTeams, nextGameweek, nextGameweekMatches);
    }
    
    // Get opponent info
    const opponentId = selectedMatch.homeTeam === selectedTeamId ? selectedMatch.awayTeam : selectedMatch.homeTeam;
    const groupTeams = getTeamsForGroup();
    const opponent = groupTeams.find(t => t.id === opponentId);
    const isHome = selectedMatch.homeTeam === selectedTeamId;
    const venue = isHome ? 'vs' : 'at';
    
    // For each possible result of selected team (WIN, DRAW, LOSS)
    const teamResults = ['win', 'draw', 'loss'];
    
    teamResults.forEach(result => {
        const scenario = calculateComprehensiveScenarios(
            selectedTeamId, result, opponent, venue, 
            standings, relevantTeams, nextGameweek
        );
        scenarios.push(scenario);
    });
    
    return scenarios;
}

function getNextGameweekMatchesForTeams(relevantTeams, nextGameweek) {
    const teamIds = relevantTeams.map(t => t.id);
    const relevantMatches = {};
    
    relevantTeams.forEach(team => {
        relevantMatches[team.id] = nextGameweek.matches.find(match => 
            match.homeTeam === team.id || match.awayTeam === team.id
        );
    });
    
    return relevantMatches;
}

function calculateNextGameweekResultScenarios(selectedTeamId, standings, relevantTeams, nextGameweek, nextGameweekMatches, result, opponent, isHome) {
    const scenarios = [];
    
    // Safety checks
    if (!selectedTeamId || !standings || !opponent) {
        return scenarios;
    }
    
    const selectedTeam = standings.find(t => t.id === selectedTeamId);
    if (!selectedTeam) {
        return scenarios;
    }
    
    const currentPosition = standings.findIndex(t => t.id === selectedTeamId) + 1;
    const venue = isHome ? 'vs' : 'at';
    
    // Simulate the result and see what happens
    const projectedStandings = simulateNextGameweekResult(selectedTeamId, result, opponent.id, standings, relevantTeams, nextGameweekMatches);
    const newPosition = projectedStandings.findIndex(t => t.id === selectedTeamId) + 1;
    
    // Determine scenario type and description
    let scenarioType, resultType, title, description, requirements;
    
    if (newPosition < currentPosition) {
        // Moving up
        scenarioType = 'advance';
        resultType = 'good';
        title = `🥇 If You ${result.toUpperCase()} ${venue} ${opponent.name}`;
        description = `You would move up to ${newPosition}${getOrdinalSuffix(newPosition)} place!`;
        requirements = [
            `${result === 'win' ? 'Win' : result === 'draw' ? 'Draw' : 'Even with a loss'} against ${opponent.name}`,
            `Other results work in your favor`,
            `Take advantage of competitors dropping points`
        ];
    } else if (newPosition > currentPosition) {
        // Moving down
        scenarioType = 'drop';
        resultType = 'bad';
        title = `⚠️ If You ${result.toUpperCase()} ${venue} ${opponent.name}`;
        description = `You could drop to ${newPosition}${getOrdinalSuffix(newPosition)} place.`;
        requirements = [
            `Avoid ${result === 'loss' ? 'losing' : result === 'draw' ? 'drawing' : 'this result'} against ${opponent.name}`,
            `Need better performance to maintain position`,
            `Watch competitors' results closely`
        ];
    } else {
        // Staying same
        scenarioType = 'maintain';
        resultType = 'neutral';
        title = `🛡️ If You ${result.toUpperCase()} ${venue} ${opponent.name}`;
        description = `You would maintain your ${currentPosition}${getOrdinalSuffix(currentPosition)} place position.`;
        requirements = [
            `${result === 'win' ? 'Win' : result === 'draw' ? 'Draw with' : 'Minimize damage against'} ${opponent.name}`,
            `Current form sufficient to maintain position`,
            `Stay consistent with performance`
        ];
    }
    
    // Calculate probability based on team strength and venue
    const probability = calculateResultProbability(result, selectedTeam, opponent, isHome, standings);
    
    scenarios.push({
        type: scenarioType,
        title: title,
        description: description,
        requirements: requirements,
        probability: probability,
        resultType: resultType,
        newPosition: newPosition,
        currentPosition: currentPosition
    });
    
    return scenarios;
}

function calculateRestGameweekScenarios(selectedTeamId, standings, relevantTeams, nextGameweek, nextGameweekMatches) {
    const scenarios = [];
    const selectedTeam = standings.find(t => t.id === selectedTeamId);
    const currentPosition = standings.findIndex(t => t.id === selectedTeamId) + 1;
    
    // Find which relevant teams are playing
    const playingTeams = relevantTeams.filter(team => nextGameweekMatches[team.id]);
    
    if (playingTeams.length === 0) {
        scenarios.push({
            type: 'no-action',
            title: '🚫 Rest Gameweek - No Relevant Matches',
            description: `You don't play in Gameweek ${nextGameweek.gameweek}, and no teams within the 3-point gap are playing either.`,
            requirements: ['Wait for next gameweek', 'Position remains unchanged'],
            probability: 'high',
            resultType: 'neutral'
        });
    } else {
        scenarios.push({
            type: 'watch-others',
            title: `👀 Rest Gameweek - Watch Competitors`,
            description: `You don't play in Gameweek ${nextGameweek.gameweek}. ${playingTeams.length} relevant team(s) are playing: ${playingTeams.map(t => t.name).join(', ')}.`,
            requirements: [
                'Monitor competitors\' results carefully',
                'Position could change based on their performance',
                'Prepare for next gameweek matches'
            ],
            probability: 'high',
            resultType: 'neutral'
        });
    }
    
    return scenarios;
}

function simulateNextGameweekResult(selectedTeamId, result, opponentId, standings, relevantTeams, nextGameweekMatches) {
    // Safety checks
    if (!standings || !selectedTeamId || !result) {
        return standings || [];
    }
    
    // Create a copy of standings to simulate
    const simStandings = JSON.parse(JSON.stringify(standings));
    
    // Apply the selected team's result
    const selectedTeamStanding = simStandings.find(t => t.id === selectedTeamId);
    const opponentStanding = opponentId ? simStandings.find(t => t.id === opponentId) : null;
    
    if (selectedTeamStanding) {
        if (result === 'win') {
            selectedTeamStanding.points = (selectedTeamStanding.points || 0) + 3;
            selectedTeamStanding.wins = (selectedTeamStanding.wins || 0) + 1;
            if (opponentStanding) {
                opponentStanding.losses = (opponentStanding.losses || 0) + 1;
            }
        } else if (result === 'draw') {
            selectedTeamStanding.points = (selectedTeamStanding.points || 0) + 1;
            selectedTeamStanding.draws = (selectedTeamStanding.draws || 0) + 1;
            if (opponentStanding) {
                opponentStanding.points = (opponentStanding.points || 0) + 1;
                opponentStanding.draws = (opponentStanding.draws || 0) + 1;
            }
        } else if (result === 'loss') {
            selectedTeamStanding.losses = (selectedTeamStanding.losses || 0) + 1;
            if (opponentStanding) {
                opponentStanding.points = (opponentStanding.points || 0) + 3;
                opponentStanding.wins = (opponentStanding.wins || 0) + 1;
            }
        }
    }
    
    // Simulate other relevant teams with average results (assume draws for simplicity)
    if (relevantTeams && nextGameweekMatches) {
        relevantTeams.forEach(team => {
            if (team.id !== selectedTeamId && team.id !== opponentId && nextGameweekMatches[team.id]) {
                const teamStanding = simStandings.find(t => t.id === team.id);
                if (teamStanding) {
                    teamStanding.points = (teamStanding.points || 0) + 1; // Assume draw
                    teamStanding.draws = (teamStanding.draws || 0) + 1;
                }
            }
        });
    }
    
    // Re-sort standings
    simStandings.sort((a, b) => {
        if (a.points !== b.points) return b.points - a.points;
        if (a.goalDifference !== b.goalDifference) return b.goalDifference - a.goalDifference;
        return b.goalsFor - a.goalsFor;
    });
    
    return simStandings;
}

function calculateResultProbability(result, selectedTeam, opponent, isHome, standings) {
    const selectedPos = standings.findIndex(t => t.id === selectedTeam.id) + 1;
    const opponentPos = standings.findIndex(t => t.id === opponent.id) + 1;
    
    let baseProbability;
    if (selectedPos < opponentPos) {
        // Playing against lower-ranked team
        baseProbability = result === 'win' ? 'high' : result === 'draw' ? 'medium' : 'low';
    } else if (selectedPos > opponentPos) {
        // Playing against higher-ranked team
        baseProbability = result === 'win' ? 'low' : result === 'draw' ? 'medium' : 'high';
    } else {
        // Similar ranked teams
        baseProbability = 'medium';
    }
    
    // Adjust for home advantage
    if (isHome && result === 'win') {
        return baseProbability === 'low' ? 'medium' : baseProbability === 'medium' ? 'high' : 'high';
    }
    
    return baseProbability;
}

function calculateComprehensiveScenarios(selectedTeamId, result, opponent, venue, standings, relevantTeams, nextGameweek) {
    const selectedTeam = standings.find(t => t.id === selectedTeamId);
    const currentPosition = standings.findIndex(t => t.id === selectedTeamId) + 1;
    const isCurrentlyFirst = currentPosition === 1;
    
    // Calculate selected team's new points
    let selectedNewPoints = selectedTeam.points;
    if (result === 'win') selectedNewPoints += 3;
    else if (result === 'draw') selectedNewPoints += 1;
    
    // Find other relevant teams that play in this gameweek
    const otherTeamsMatches = [];
    relevantTeams.forEach(team => {
        if (team.id !== selectedTeamId) {
            const match = nextGameweek.matches.find(m => 
                m.homeTeam === team.id || m.awayTeam === team.id
            );
            if (match) {
                otherTeamsMatches.push({
                    teamId: team.id,
                    team: team,
                    match: match,
                    isHome: match.homeTeam === team.id
                });
            }
        }
    });
    
    // Generate all possible combinations of results for other teams
    const allCombinations = generateAllResultCombinations(otherTeamsMatches);
    
    // Analyze each combination
    const scenarios = {
        canReachFirst: [],
        maintainFirst: [],
        maintainPosition: [],
        dropPosition: [],
        tieBreakScenarios: []
    };
    
    allCombinations.forEach(combination => {
        const finalStandings = simulateGameweekResults(
            standings, selectedTeamId, selectedNewPoints, combination
        );
        
        const newPosition = finalStandings.findIndex(t => t.id === selectedTeamId) + 1;
        const selectedTeamFinal = finalStandings.find(t => t.id === selectedTeamId);
        
        // Check for ties at first place and create detailed description
        let combinationDesc = describeCombination(combination);
        
        // Check for ties and provide tie-breaker analysis
        const firstPlacePoints = finalStandings[0].points;
        const teamsWithSamePoints = finalStandings.filter(t => t.points === firstPlacePoints);
        
        if (teamsWithSamePoints.length > 1 && selectedTeamFinal.points === firstPlacePoints) {
            // There's a tie for first place - explain tie-breaker
            const otherTiedTeams = teamsWithSamePoints.filter(t => t.id !== selectedTeamId);
            if (otherTiedTeams.length > 0) {
                const tieBreakInfo = analyzeTieBreaker(selectedTeamFinal, otherTiedTeams);
                combinationDesc += ` (${tieBreakInfo})`;
            }
        }
        
        // Special case: if tied for 1st place but loses on tie-breaker, show what's needed
        if (teamsWithSamePoints.length > 1 && selectedTeamFinal.points === firstPlacePoints && newPosition > 1) {
            // Team tied for points but lost on tie-breaker - add to special tie-breaker scenarios
            if (!scenarios.tieBreakScenarios) scenarios.tieBreakScenarios = [];
            scenarios.tieBreakScenarios.push(combinationDesc);
        } else if (newPosition === 1 && !isCurrentlyFirst) {
            scenarios.canReachFirst.push(combinationDesc);
        } else if (newPosition === 1 && isCurrentlyFirst) {
            scenarios.maintainFirst.push(combinationDesc);
        } else if (newPosition === currentPosition) {
            scenarios.maintainPosition.push(combinationDesc);
        } else {
            scenarios.dropPosition.push(combinationDesc);
        }
    });
    
    // Generate the final scenario description
    return generateScenarioDescription(
        result, opponent.name, venue, selectedNewPoints, currentPosition,
        scenarios, isCurrentlyFirst
    );
}

function generateAllResultCombinations(teamMatches) {
    if (teamMatches.length === 0) return [[]];
    
    const results = ['win', 'draw', 'loss'];
    const combinations = [];
    
    function generateCombos(index, currentCombo) {
        if (index >= teamMatches.length) {
            combinations.push([...currentCombo]);
            return;
        }
        
        results.forEach(result => {
            currentCombo[index] = {
                teamId: teamMatches[index].teamId,
                result: result,
                points: result === 'win' ? 3 : result === 'draw' ? 1 : 0
            };
            generateCombos(index + 1, currentCombo);
        });
    }
    
    generateCombos(0, new Array(teamMatches.length));
    return combinations;
}

function simulateGameweekResults(originalStandings, selectedTeamId, selectedNewPoints, otherResults) {
    // Create copy of standings
    const newStandings = originalStandings.map(team => ({...team}));
    
    // Update selected team points and estimate goal changes
    const selectedIndex = newStandings.findIndex(t => t.id === selectedTeamId);
    if (selectedIndex !== -1) {
        const pointsGained = selectedNewPoints - newStandings[selectedIndex].points;
        newStandings[selectedIndex].points = selectedNewPoints;
        
        // Estimate goal changes based on typical results
        if (pointsGained === 3) {
            // Win - estimate 2-goal margin (could be 1-0, 2-0, 3-1, etc.)
            newStandings[selectedIndex].goalsFor += 2;
            newStandings[selectedIndex].goalDifference += 2;
            newStandings[selectedIndex].goalsAgainst = newStandings[selectedIndex].goalsFor - newStandings[selectedIndex].goalDifference;
        } else if (pointsGained === 1) {
            // Draw - estimate 1-1
            newStandings[selectedIndex].goalsFor += 1;
            newStandings[selectedIndex].goalsAgainst += 1;
        }
        // Loss = 0 points gained, assume opponent scored more
    }
    
    // Update other teams' points and estimate goal changes
    otherResults.forEach(result => {
        const teamIndex = newStandings.findIndex(t => t.id === result.teamId);
        if (teamIndex !== -1) {
            const oldPoints = newStandings[teamIndex].points;
            newStandings[teamIndex].points += result.points;
            
            // Estimate goal changes based on result
            if (result.points === 3) {
                // Win - estimate 2-goal margin
                newStandings[teamIndex].goalsFor += 2;
                newStandings[teamIndex].goalDifference += 2;
                newStandings[teamIndex].goalsAgainst = newStandings[teamIndex].goalsFor - newStandings[teamIndex].goalDifference;
            } else if (result.points === 1) {
                // Draw - estimate 1-1
                newStandings[teamIndex].goalsFor += 1;
                newStandings[teamIndex].goalsAgainst += 1;
            }
            // Loss = 0 points, estimate conceding goals but not as precise without opponent info
        }
    });
    
    // Sort by points, then goal difference, then goals for
    newStandings.sort((a, b) => {
        if (a.points !== b.points) return b.points - a.points;
        if (a.goalDifference !== b.goalDifference) return b.goalDifference - a.goalDifference;
        return b.goalsFor - a.goalsFor;
    });
    
    return newStandings;
}

function describeCombination(combination) {
    if (combination.length === 0) return "No other relevant matches";
    
    return combination.map(result => {
        const team = teams.find(t => t.id === result.teamId);
        const resultText = result.result === 'win' ? 'wins' : result.result === 'draw' ? 'draws' : 'loses';
        return `${team.name} ${resultText}`;
    }).join(', ');
}

function analyzeTieBreaker(selectedTeam, otherTiedTeams) {
    // Analyze tie-breaker situation with specific examples
    const tieBreakReasons = [];
    
    otherTiedTeams.forEach(otherTeam => {
        if (selectedTeam.goalDifference > otherTeam.goalDifference) {
            tieBreakReasons.push(`wins on GD vs ${otherTeam.name} (${selectedTeam.goalDifference > 0 ? '+' : ''}${selectedTeam.goalDifference} vs ${otherTeam.goalDifference > 0 ? '+' : ''}${otherTeam.goalDifference})`);
        } else if (selectedTeam.goalDifference === otherTeam.goalDifference) {
            if (selectedTeam.goalsFor > otherTeam.goalsFor) {
                tieBreakReasons.push(`wins on goals vs ${otherTeam.name} (${selectedTeam.goalsFor} vs ${otherTeam.goalsFor})`);
            } else if (selectedTeam.goalsFor === otherTeam.goalsFor) {
                tieBreakReasons.push(`tied with ${otherTeam.name} on GD & goals`);
            } else {
                tieBreakReasons.push(`loses on goals to ${otherTeam.name} (${selectedTeam.goalsFor} vs ${otherTeam.goalsFor})`);
            }
        } else {
            // Selected team has worse goal difference - provide examples of what they need
            const gdGap = otherTeam.goalDifference - selectedTeam.goalDifference;
            const currentSelectedGF = selectedTeam.goalsFor;
            const currentSelectedGA = selectedTeam.goalsAgainst;
            
            // Calculate what SCE needs to overcome the GD gap
            const minGoalsNeeded = gdGap + 1; // Need to be at least 1 better
            
            if (otherTeam.name === "Ctrl+Shift+Golo") {
                // Specific examples for the main competitor
                if (gdGap === 5) { // +7 vs +2 = 5 gap
                    tieBreakReasons.push(`needs 6+ goals vs opponent (e.g., 6-0, 7-0) to overtake ${otherTeam.name} on GD`);
                } else {
                    tieBreakReasons.push(`needs ${minGoalsNeeded}+ goal margin to overtake ${otherTeam.name} (GD: ${selectedTeam.goalDifference > 0 ? '+' : ''}${selectedTeam.goalDifference} vs ${otherTeam.goalDifference > 0 ? '+' : ''}${otherTeam.goalDifference})`);
                }
            } else {
                tieBreakReasons.push(`loses on GD to ${otherTeam.name} (${selectedTeam.goalDifference > 0 ? '+' : ''}${selectedTeam.goalDifference} vs ${otherTeam.goalDifference > 0 ? '+' : ''}${otherTeam.goalDifference})`);
            }
        }
    });
    
    return tieBreakReasons.join(', ');
}

function generateScenarioDescription(result, opponentName, venue, newPoints, currentPosition, scenarios, isCurrentlyFirst) {
    const resultAction = result === 'win' ? 'WIN' : result === 'draw' ? 'DRAW' : 'LOSS';
    const title = `${result === 'win' ? '🥇' : result === 'draw' ? '🛡️' : '⚠️'} If You ${resultAction} ${venue} ${opponentName}`;
    
    let description = '';
    let requirements = [];
    let resultType = 'neutral';
    let probability = 'medium';
    
    // Analyze the scenarios
    const totalScenarios = scenarios.canReachFirst.length + scenarios.maintainFirst.length + 
                          scenarios.maintainPosition.length + scenarios.dropPosition.length +
                          scenarios.tieBreakScenarios.length;
    
    if (scenarios.canReachFirst.length > 0) {
        // Can reach 1st place in some scenarios
        const percentage = Math.round((scenarios.canReachFirst.length / totalScenarios) * 100);
        description = `You could reach 1st place with ${newPoints} points in ${scenarios.canReachFirst.length}/${totalScenarios} scenarios (${percentage}%).`;
        
        requirements.push(`${result === 'win' ? 'Beat' : result === 'draw' ? 'Draw with' : 'Limit damage against'} ${opponentName}`);
        
        requirements.push("Scenarios for 1st place:");
        scenarios.canReachFirst.forEach(scenario => {
            requirements.push(`• ${scenario}`);
        });
        
        // Add tie-breaker scenarios if they exist
        if (scenarios.tieBreakScenarios.length > 0) {
            requirements.push("Tie-breaker scenarios (need superior goal stats):");
            scenarios.tieBreakScenarios.forEach(scenario => {
                requirements.push(`• ${scenario}`);
            });
        }
        
        resultType = 'good';
        probability = result === 'win' ? 'high' : result === 'draw' ? 'medium' : 'low';
        
    } else if (scenarios.maintainFirst.length > 0) {
        // Maintain 1st place
        const percentage = Math.round((scenarios.maintainFirst.length / totalScenarios) * 100);
        description = `You would maintain 1st place with ${newPoints} points in ${scenarios.maintainFirst.length}/${totalScenarios} scenarios (${percentage}%).`;
        
        requirements.push(`${result === 'win' ? 'Beat' : result === 'draw' ? 'Draw with' : 'Limit damage against'} ${opponentName}`);
        requirements.push(`${percentage}% chance to stay 1st`);
        
        resultType = 'good';
        probability = 'high';
        
    } else if (scenarios.maintainPosition.length === totalScenarios) {
        // Always maintain current position
        description = `You would maintain ${currentPosition}${getOrdinalSuffix(currentPosition)} place with ${newPoints} points regardless of other results.`;
        
        requirements.push(`${result === 'win' ? 'Beat' : result === 'draw' ? 'Draw with' : 'Limit damage against'} ${opponentName}`);
        requirements.push('Position secure regardless of other matches');
        
        resultType = 'neutral';
        
    } else {
        // Mixed outcomes or position drops
        const maintainPercentage = Math.round((scenarios.maintainPosition.length / totalScenarios) * 100);
        const dropPercentage = Math.round((scenarios.dropPosition.length / totalScenarios) * 100);
        
        if (scenarios.dropPosition.length > scenarios.maintainPosition.length) {
            description = `You would likely drop position with ${newPoints} points. Drop in ${dropPercentage}% of scenarios, maintain position in ${maintainPercentage}%.`;
            resultType = 'bad';
        } else {
            description = `Mixed outcomes with ${newPoints} points. Maintain position in ${maintainPercentage}% of scenarios, drop in ${dropPercentage}%.`;
            resultType = 'neutral';
        }
        
        requirements.push(`${result === 'win' ? 'Beat' : result === 'draw' ? 'Draw with' : 'Limit damage against'} ${opponentName}`);
        requirements.push(`${maintainPercentage}% chance to maintain position`);
        
        probability = result === 'loss' ? 'medium' : 'low';
    }
    
    return {
        type: `${result}-scenario`,
        title: title,
        description: description,
        requirements: requirements,
        probability: probability,
        resultType: resultType,
        scenarios: scenarios
    };
}

function generateAdvancedScenariosHTML(scenarios, currentPosition) {
    if (scenarios.length === 0) {
        return '<p>No significant scenarios within the 3-point gap range for next gameweek.</p>';
    }
    
    let html = '';
    
    // Process all scenarios regardless of type, in the order they were generated
    scenarios.forEach(scenario => {
        const probabilityClass = `probability-${scenario.probability}`;
        html += `
            <div class="ai-scenario result-${scenario.resultType}">
                <div class="scenario-title">${scenario.title}</div>
                <div class="scenario-description">${scenario.description}</div>
                ${scenario.requirements && scenario.requirements.length > 0 ? `
                    <div style="margin-top: 10px;">
                        <strong>Requirements:</strong>
                        <ul style="margin: 5px 0 0 20px;">
                            ${scenario.requirements.map(req => `<li>${req}</li>`).join('')}
                        </ul>
                    </div>
                ` : ''}
                <span class="scenario-probability ${probabilityClass}">
                    ${scenario.probability === 'none' ? 'Not Possible' : scenario.probability.charAt(0).toUpperCase() + scenario.probability.slice(1) + ' Probability'}
                </span>
            </div>
        `;
    });
    
    return html || '<p>No relevant scenarios found within the specified point gap.</p>';
}

function calculateBasicScenarios(teamId, standings) {
    const currentPosition = standings.findIndex(t => t.id === teamId) + 1;
    const teamStanding = standings.find(t => t.id === teamId);
    const scenarios = [];
    
    if (currentPosition === 1) {
        scenarios.push({
            type: 'current-leader',
            title: '👑 Currently Leading!',
            description: 'You are at the top of the championship. Focus on maintaining your position.',
            probability: 'high',
            requirements: ['Win or draw your matches', 'Maintain goal difference advantage'],
            resultType: 'good'
        });
    } else {
        const pointsGap = standings[0].points - teamStanding.points;
        const remainingMatches = getRemainingMatches(teamId).length;
        const maxPossiblePoints = teamStanding.points + (remainingMatches * 3);
        
        if (maxPossiblePoints >= standings[0].points) {
            scenarios.push({
                type: 'can-reach-first',
                title: '🏆 Championship Still Possible',
                description: `You need ${pointsGap + 1} more points than the current leader to reach 1st place.`,
                probability: pointsGap <= 3 ? 'high' : pointsGap <= 6 ? 'medium' : 'low',
                requirements: [
                    'Win most remaining matches',
                    'Hope current leader drops points',
                    'Focus on goal difference for tie-breakers'
                ],
                resultType: 'good'
            });
        } else {
            scenarios.push({
                type: 'mathematical-elimination',
                title: '📊 Championship Mathematically Difficult',
                description: 'Reaching 1st place is very challenging with current points gap.',
                probability: 'low',
                requirements: [
                    'Win all remaining matches',
                    'Current leader must lose most matches',
                    'Need significant help from other results'
                ],
                resultType: 'neutral'
            });
        }
        
        // Position improvement scenarios
        if (currentPosition > 2) {
            scenarios.push({
                type: 'position-improvement',
                title: '📈 Improve Position',
                description: `Focus on moving up from ${currentPosition}${getOrdinalSuffix(currentPosition)} place.`,
                probability: 'medium',
                requirements: [
                    'Win your next matches',
                    'Teams above you need to drop points',
                    'Maintain consistency'
                ],
                resultType: 'neutral'
            });
        }
    }
    
    return scenarios;
}

// Keep all the original functions but simplify calculateChampionshipScenarios
function calculateChampionshipScenarios(teamId, standings) {
    return calculateBasicScenarios(teamId, standings);
}

function calculateTeamStrength(teamStanding, standings) {
    // Safety checks
    if (!teamStanding || !standings || standings.length === 0) {
        return 0.5; // Default neutral strength
    }
    
    const position = standings.findIndex(t => t.id === teamStanding.id) + 1;
    const totalTeams = standings.length;
    
    // Factor in multiple strength indicators with safety checks
    const positionStrength = (totalTeams - position + 1) / totalTeams; // Higher for better position
    const goalsStrength = Math.min((teamStanding.goalsFor || 0) / 20, 1); // Normalized goal scoring
    const defenseStrength = Math.max(0, 1 - ((teamStanding.goalsAgainst || 0) / 15)); // Better defense = higher
    const formStrength = calculateRecentForm(teamStanding); // Recent match history
    const efficiencyStrength = (teamStanding.played || 0) > 0 ? (teamStanding.points || 0) / ((teamStanding.played || 1) * 3) : 0; // Points per game
    
    return (positionStrength * 0.25 + goalsStrength * 0.2 + defenseStrength * 0.2 + formStrength * 0.2 + efficiencyStrength * 0.15);
}

function calculateRecentForm(teamStanding) {
    // Check if matchHistory exists and is an array
    if (!teamStanding || !teamStanding.matchHistory || !Array.isArray(teamStanding.matchHistory)) {
        return 0.5; // Default neutral form
    }
    
    const recentMatches = teamStanding.matchHistory.slice(-3); // Last 3 matches
    if (recentMatches.length === 0) return 0.5;
    
    const formPoints = recentMatches.reduce((total, result) => {
        if (result === 'W') return total + 1;
        if (result === 'D') return total + 0.5;
        return total;
    }, 0);
    
    return formPoints / recentMatches.length;
}

function calculateSmartProbability(result, teamStrength, opponentStrength, isHome) {
    const homeAdvantage = isHome ? 0.1 : -0.1;
    const strengthDiff = teamStrength - opponentStrength + homeAdvantage;
    
    let baseProbability;
    if (result === 'win') {
        baseProbability = 0.33 + strengthDiff * 0.4;
    } else if (result === 'draw') {
        baseProbability = 0.33 - Math.abs(strengthDiff) * 0.2;
    } else { // loss
        baseProbability = 0.33 - strengthDiff * 0.4;
    }
    
    // Clamp between realistic bounds
    baseProbability = Math.max(0.1, Math.min(0.8, baseProbability));
    
    if (baseProbability > 0.55) return 'high';
    if (baseProbability > 0.35) return 'medium';
    return 'low';
}

function findNextGameweek() {
    // Find the first gameweek with unplayed matches
    for (const gameweek of fixtures) {
        const hasUnplayedMatches = gameweek.matches.some(match => {
            const result = results.find(r => r.matchId === match.id && r.played);
            return !result;
        });
        if (hasUnplayedMatches) {
            return gameweek;
        }
    }
    return null;
}

function calculateProjectedStandings(currentStandings, matchResults) {
    // Create a copy of current standings
    const projectedStandings = currentStandings.map(team => ({
        ...team,
        played: team.played,
        wins: team.wins,
        losses: team.losses,
        draws: team.draws,
        goalsFor: team.goalsFor,
        goalsAgainst: team.goalsAgainst,
        goalDifference: team.goalDifference,
        points: team.points,
        matchHistory: [...team.matchHistory],
        headToHeadWins: {...team.headToHeadWins}
    }));
    
    // Apply match results
    matchResults.forEach(matchResult => {
        const homeTeam = projectedStandings.find(t => t.id === matchResult.match.homeTeam);
        const awayTeam = projectedStandings.find(t => t.id === matchResult.match.awayTeam);
        
        if (homeTeam && awayTeam) {
            // Update match counts
            homeTeam.played++;
            awayTeam.played++;
            
            // Update goals
            homeTeam.goalsFor += matchResult.homeScore;
            homeTeam.goalsAgainst += matchResult.awayScore;
            awayTeam.goalsFor += matchResult.awayScore;
            awayTeam.goalsAgainst += matchResult.homeScore;
            
            // Update results
            if (matchResult.homeScore > matchResult.awayScore) {
                homeTeam.wins++;
                homeTeam.points += 3;
                homeTeam.matchHistory.push('W');
                if (!homeTeam.headToHeadWins[awayTeam.id]) homeTeam.headToHeadWins[awayTeam.id] = 0;
                homeTeam.headToHeadWins[awayTeam.id]++;
                awayTeam.losses++;
                awayTeam.matchHistory.push('L');
            } else if (matchResult.homeScore < matchResult.awayScore) {
                awayTeam.wins++;
                awayTeam.points += 3;
                awayTeam.matchHistory.push('W');
                if (!awayTeam.headToHeadWins[homeTeam.id]) awayTeam.headToHeadWins[homeTeam.id] = 0;
                awayTeam.headToHeadWins[homeTeam.id]++;
                homeTeam.losses++;
                homeTeam.matchHistory.push('L');
            } else {
                homeTeam.draws++;
                homeTeam.points += 1;
                homeTeam.matchHistory.push('D');
                awayTeam.draws++;
                awayTeam.points += 1;
                awayTeam.matchHistory.push('D');
            }
            
            // Update goal difference
            homeTeam.goalDifference = homeTeam.goalsFor - homeTeam.goalsAgainst;
            awayTeam.goalDifference = awayTeam.goalsFor - awayTeam.goalsAgainst;
        }
    });
    
    // Sort with same tie-breaker rules
    projectedStandings.sort((a, b) => {
        if (a.points !== b.points) return b.points - a.points;
        if (a.goalDifference !== b.goalDifference) return b.goalDifference - a.goalDifference;
        if (a.goalsFor !== b.goalsFor) return b.goalsFor - a.goalsFor;
        const aHeadToHeadWins = Object.values(a.headToHeadWins).reduce((sum, wins) => sum + wins, 0);
        const bHeadToHeadWins = Object.values(b.headToHeadWins).reduce((sum, wins) => sum + wins, 0);
        if (aHeadToHeadWins !== bHeadToHeadWins) return bHeadToHeadWins - aHeadToHeadWins;
        return a.name.localeCompare(b.name);
    });
    
    return projectedStandings;
}

function getOrdinalSuffix(number) {
    const j = number % 10;
    const k = number % 100;
    if (j == 1 && k != 11) return "st";
    if (j == 2 && k != 12) return "nd";
    if (j == 3 && k != 13) return "rd";
    return "th";
}

function getGoalDiffClass(goalDifference) {
    if (goalDifference > 0) return 'goal-diff-positive';
    if (goalDifference < 0) return 'goal-diff-negative';
    return 'goal-diff-zero';
}

// Forecast functionality
function updateForecast() {
    const forecastContent = document.getElementById('forecast-content');
    forecastContent.innerHTML = '<div class="loading">🔮 Analyzing team performance and generating predictions...</div>';
    
    // Initialize forecast controls if not done yet
    if (!selectedForecastGroupId) {
        populateForecastControls();
    }
    
    try {
        const forecast = generateForecast();
        forecastContent.innerHTML = forecast;
    } catch (error) {
        console.error('Forecast error:', error);
        forecastContent.innerHTML = '<div class="error">Error generating forecast. Please try again.</div>';
    }
}

// Populate forecast controls (group selector only)
function populateForecastControls() {
    populateForecastGroupSelector();
}

// Populate group selector for forecast
function populateForecastGroupSelector() {
    const selector = document.getElementById('forecast-group-select');
    if (!selector) return;
    
    selector.innerHTML = '';
    
    groups.forEach(group => {
        const option = document.createElement('option');
        option.value = group.id;
        option.textContent = group.name;
        selector.appendChild(option);
    });
    
    // Set default group (current selected group or first group)
    selectedForecastGroupId = selectedGroupId || (groups.length > 0 ? groups[0].id : null);
    if (selectedForecastGroupId) {
        selector.value = selectedForecastGroupId;
    }
}

// Handle group selection change
function updateForecastForGroup() {
    const selector = document.getElementById('forecast-group-select');
    selectedForecastGroupId = selector.value;
    
    // Regenerate forecast
    updateForecast();
}

function generateForecast() {
    // Use forecast-specific group selection for calculations
    const originalGroupId = selectedGroupId;
    if (selectedForecastGroupId) {
        selectedGroupId = selectedForecastGroupId;
    }
    
    const currentStandings = calculateStandings();
    const teamAnalysis = analyzeAllTeams(currentStandings);
    
    // Always get the current gameweek for the selected group
    const currentGameweek = findCurrentGameweekForGroup(selectedForecastGroupId);
    
    const matchPredictions = currentGameweek ? generateMatchPredictionsForGameweek(currentGameweek, teamAnalysis) : null;
    const championshipForecast = generateChampionshipForecast(currentStandings, teamAnalysis);
    
    // Get group name before using it
    const groupName = groups.find(g => g.id === selectedForecastGroupId)?.name || 'Selected Group';
    
    // Determine if we're showing completed matches for review or upcoming predictions
    const now = new Date();
    const currentDayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday, etc.
    const isNextMondayOrLater = currentDayOfWeek === 1; // Only Monday, not the whole week
    
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const currentDayName = dayNames[currentDayOfWeek];
    
    let headerText = '';
    let statusMessage = '';
    
    if (currentGameweek) {
        const groupResults = results.filter(r => r.groupId === selectedForecastGroupId);
        const allMatchesCompleted = currentGameweek.matches.every(match => {
            return groupResults.some(result => 
                result.gameweek === currentGameweek.gameweek &&
                result.homeTeam === match.homeTeam &&
                result.awayTeam === match.awayTeam
            );
        });
        
        if (allMatchesCompleted && !isNextMondayOrLater) {
            headerText = `🔍 Prediction Review for ${groupName} - Gameweek ${currentGameweek.gameweek}`;
            statusMessage = `<div class="status-message review-mode">📈 All matches completed! Reviewing prediction accuracy until Monday (today is ${currentDayName}).</div>`;
        } else if (allMatchesCompleted && isNextMondayOrLater) {
            headerText = `⚽ Match Predictions for ${groupName} - Gameweek ${currentGameweek.gameweek}`;
            statusMessage = `<div class="status-message archive-mode">📚 Previous gameweek results (today is ${currentDayName} - review period ended).</div>`;
        } else {
            headerText = `⚽ Match Predictions for ${groupName} - Gameweek ${currentGameweek.gameweek}`;
            statusMessage = `<div class="status-message prediction-mode">🔮 Live predictions for upcoming matches (today is ${currentDayName}).</div>`;
        }
    }
    
    // Restore original group selection
    selectedGroupId = originalGroupId;
    
    return `
        ${matchPredictions ? `
        <div class="forecast-section">
            <div class="forecast-header">
                ${headerText}
            </div>
            ${statusMessage}
            <div class="forecast-content">
                ${generateMatchPredictionsHTML(matchPredictions, currentGameweek)}
            </div>
        </div>
        ` : ''}
        
        <div class="forecast-section">
            <div class="forecast-header">
                🏆 Championship Forecast
            </div>
            <div class="forecast-content">
                ${generateChampionshipForecastHTML(championshipForecast)}
            </div>
        </div>
    `;
}

function analyzeAllTeams(standings) {
    return standings.map(team => {
        const teamData = analyzeTeamPerformance(team, standings);
        return {
            ...team,
            ...teamData
        };
    });
}

function analyzeTeamPerformance(team, standings) {
    const position = standings.findIndex(t => t.id === team.id) + 1;
    
    // Form analysis (recent 3 matches)
    const recentForm = calculateRecentForm(team);
    const formDescription = getFormDescription(recentForm);
    
    // Consistency analysis
    const consistency = calculateConsistency(team);
    
    // Attacking strength
    const attackingStrength = team.played > 0 ? (team.goalsFor / team.played).toFixed(1) : 0;
    
    // Defensive strength  
    const defensiveStrength = team.played > 0 ? (team.goalsAgainst / team.played).toFixed(1) : 0;
    
    // Points per game
    const pointsPerGame = team.played > 0 ? (team.points / team.played).toFixed(1) : 0;
    
    // Win percentage
    const winPercentage = team.played > 0 ? Math.round((team.wins / team.played) * 100) : 0;
    
    // Performance rating (0-10 scale)
    const performanceRating = calculatePerformanceRating(team, standings);
    
    // Momentum (recent trend)
    const momentum = calculateMomentum(team);
    
    return {
        position,
        recentForm,
        formDescription,
        consistency,
        attackingStrength: parseFloat(attackingStrength),
        defensiveStrength: parseFloat(defensiveStrength),
        pointsPerGame: parseFloat(pointsPerGame),
        winPercentage,
        performanceRating,
        momentum
    };
}

function getFormDescription(formScore) {
    if (formScore >= 0.8) return { text: "Excellent", color: "#27ae60", icon: "🔥" };
    if (formScore >= 0.6) return { text: "Good", color: "#2ecc71", icon: "📈" };
    if (formScore >= 0.4) return { text: "Average", color: "#f39c12", icon: "➡️" };
    if (formScore >= 0.2) return { text: "Poor", color: "#e67e22", icon: "📉" };
    return { text: "Very Poor", color: "#e74c3c", icon: "🔴" };
}

function calculateConsistency(team) {
    if (!team.matchHistory || team.matchHistory.length < 2) return 0.5;
    
    // Calculate how consistent the results are
    const results = team.matchHistory;
    let consistencyScore = 0;
    
    // Check for patterns and consistency in results
    const wins = results.filter(r => r === 'W').length;
    const draws = results.filter(r => r === 'D').length;
    const losses = results.filter(r => r === 'L').length;
    
    const total = results.length;
    const dominantResult = Math.max(wins, draws, losses);
    
    // Higher consistency if one result type dominates
    consistencyScore = dominantResult / total;
    
    return Math.min(consistencyScore, 1);
}

function calculatePerformanceRating(team, standings) {
    const totalTeams = standings.length;
    const position = standings.findIndex(t => t.id === team.id) + 1;
    
    // Position score (0-3)
    const positionScore = ((totalTeams - position + 1) / totalTeams) * 3;
    
    // Points efficiency (0-2)
    const maxPossiblePoints = team.played * 3;
    const pointsEfficiency = maxPossiblePoints > 0 ? (team.points / maxPossiblePoints) * 2 : 0;
    
    // Goal difference score (0-2)
    const goalDiffScore = Math.max(0, Math.min(2, (team.goalDifference + 10) / 10));
    
    // Form score (0-2)
    const formScore = calculateRecentForm(team) * 2;
    
    // Win rate score (0-1)
    const winRateScore = team.played > 0 ? (team.wins / team.played) : 0;
    
    const totalScore = positionScore + pointsEfficiency + goalDiffScore + formScore + winRateScore;
    return Math.min(10, Math.max(0, totalScore));
}

function calculateMomentum(team) {
    if (!team.matchHistory || team.matchHistory.length < 2) {
        return { direction: "Stable", strength: "Neutral", color: "#95a5a6", icon: "➡️" };
    }
    
    const recent = team.matchHistory.slice(-3);
    const earlier = team.matchHistory.slice(-6, -3);
    
    if (recent.length === 0) return { direction: "Stable", strength: "Neutral", color: "#95a5a6", icon: "➡️" };
    
    const recentPoints = recent.reduce((sum, result) => {
        return sum + (result === 'W' ? 3 : result === 'D' ? 1 : 0);
    }, 0) / recent.length;
    
    const earlierPoints = earlier.length > 0 ? earlier.reduce((sum, result) => {
        return sum + (result === 'W' ? 3 : result === 'D' ? 1 : 0);
    }, 0) / earlier.length : recentPoints;
    
    const momentum = recentPoints - earlierPoints;
    
    if (momentum > 0.5) return { direction: "Rising", strength: "Strong", color: "#27ae60", icon: "📈" };
    if (momentum > 0) return { direction: "Rising", strength: "Slight", color: "#2ecc71", icon: "⬆️" };
    if (momentum < -0.5) return { direction: "Declining", strength: "Strong", color: "#e74c3c", icon: "📉" };
    if (momentum < 0) return { direction: "Declining", strength: "Slight", color: "#e67e22", icon: "⬇️" };
    
    return { direction: "Stable", strength: "Neutral", color: "#95a5a6", icon: "➡️" };
}

// Helper function to find current gameweek for a specific group
function findCurrentGameweekForGroup(groupId) {
    if (!groupId) return null;
    
    console.log('DEBUG: Finding current gameweek for group:', groupId);
    
    // Get all gameweek objects for this group
    const groupGameweeks = fixtures.filter(gw => gw.groupId === groupId);
    const groupResults = results.filter(r => r.groupId === groupId);
    
    console.log('DEBUG: Available gameweeks:', groupGameweeks.map(gw => gw.gameweek));
    console.log('DEBUG: Results count:', groupResults.length);
    
    if (groupGameweeks.length === 0) return null;
    
    // Sort gameweeks by number
    groupGameweeks.sort((a, b) => a.gameweek - b.gameweek);
    
    // Get current date and calculate if we're past Sunday 23:59
    const now = new Date();
    const currentDayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday, etc.
    
    // Only consider it "after week end" if it's Monday AND we've completed the current gameweek
    // The idea is: complete gameweek on any day = stay for review until next Monday
    const isNextMondayOrLater = currentDayOfWeek === 1; // Only Monday, not the whole week
    
    console.log('DEBUG: Current day of week:', currentDayOfWeek, 'isNextMondayOrLater:', isNextMondayOrLater);
    
    // Find the most advanced gameweek that has had any matches played
    let actualCurrentGameweek = null;
    let nextAvailableGameweek = null;
    
    // Find the highest gameweek number that has at least one match played
    for (let i = groupGameweeks.length - 1; i >= 0; i--) {
        const gameweekObj = groupGameweeks[i];
        const hasAnyMatchPlayed = gameweekObj.matches.some(match => {
            return groupResults.some(result => 
                result.gameweek === gameweekObj.gameweek &&
                result.homeTeam === match.homeTeam &&
                result.awayTeam === match.awayTeam
            );
        });
        
        console.log('DEBUG: Checking gameweek', gameweekObj.gameweek, 'hasAnyMatchPlayed:', hasAnyMatchPlayed);
        
        if (hasAnyMatchPlayed) {
            // This is the most advanced gameweek with matches played
            actualCurrentGameweek = gameweekObj;
            console.log('DEBUG: Found actual current gameweek:', actualCurrentGameweek.gameweek);
            break;
        }
    }
    
    // If no gameweek has matches played yet, use the first gameweek
    if (!actualCurrentGameweek) {
        actualCurrentGameweek = groupGameweeks[0];
        console.log('DEBUG: No played gameweeks found, using first:', actualCurrentGameweek.gameweek);
    }
    
    // Find the next gameweek after the actual current one
    const currentGameweekIndex = groupGameweeks.findIndex(gw => gw.gameweek === actualCurrentGameweek.gameweek);
    if (currentGameweekIndex < groupGameweeks.length - 1) {
        nextAvailableGameweek = groupGameweeks[currentGameweekIndex + 1];
    }
    
    // Decision logic based on completion and day of week
    let currentGameweek = null;
    
    const currentGameweekAllComplete = actualCurrentGameweek.matches.every(match => {
        return groupResults.some(result => 
            result.gameweek === actualCurrentGameweek.gameweek &&
            result.homeTeam === match.homeTeam &&
            result.awayTeam === match.awayTeam
        );
    });
    
    console.log('DEBUG: actualCurrentGameweek:', actualCurrentGameweek.gameweek, 'allComplete:', currentGameweekAllComplete);
    console.log('DEBUG: nextAvailableGameweek:', nextAvailableGameweek?.gameweek || 'none');
    
    if (!currentGameweekAllComplete) {
        // Current gameweek has unplayed matches - always show it
        currentGameweek = actualCurrentGameweek;
        console.log('DEBUG: Showing current gameweek (has unplayed matches):', currentGameweek.gameweek);
    } else if (currentGameweekAllComplete && !isNextMondayOrLater) {
        // Current gameweek is complete but it's not Monday yet - stay for review
        currentGameweek = actualCurrentGameweek;
        console.log('DEBUG: Showing current gameweek for review (not Monday yet):', currentGameweek.gameweek);
    } else if (currentGameweekAllComplete && isNextMondayOrLater && nextAvailableGameweek) {
        // Current gameweek is complete, it's Monday, and there's a next gameweek - advance
        currentGameweek = nextAvailableGameweek;
        console.log('DEBUG: Advancing to next gameweek (Monday):', currentGameweek.gameweek);
    } else {
        // Fallback: stay on current gameweek
        currentGameweek = actualCurrentGameweek;
        console.log('DEBUG: Fallback to current gameweek:', currentGameweek.gameweek);
    }
    
    // Return the gameweek object with all matches
    return {
        gameweek: currentGameweek.gameweek,
        matches: currentGameweek.matches
    };
}

// Helper function to find gameweek by number
// Generate match predictions for a specific gameweek (including completed games)
function generateMatchPredictionsForGameweek(gameweek, teamAnalysis) {
    // Create team analysis excluding current gameweek results for more accurate predictions
    const currentGameweekNumber = gameweek.gameweek;
    const standingsExcludingCurrentGameweek = calculateStandingsExcludingGameweek(currentGameweekNumber);
    const teamAnalysisForPrediction = analyzeAllTeams(standingsExcludingCurrentGameweek);
    
    return gameweek.matches.map(match => {
        const homeTeam = teamAnalysisForPrediction.find(t => t.id === match.homeTeam);
        const awayTeam = teamAnalysisForPrediction.find(t => t.id === match.awayTeam);
        
        if (!homeTeam || !awayTeam) return null;
        
        // Check if this match has already been played
        // Use the gameweek number from the gameweek object, not from the individual match
        const actualResult = results.find(r => 
            r.homeTeam === match.homeTeam && 
            r.awayTeam === match.awayTeam && 
            r.gameweek === gameweek.gameweek
        );
        
        // Always use prediction based on pre-current-gameweek data
        const prediction = predictMatch(homeTeam, awayTeam);
        
        return {
            match,
            homeTeam,
            awayTeam,
            prediction,
            actualResult
        };
    }).filter(p => p !== null);
}

function generateMatchPredictions(nextGameweek, teamAnalysis) {
    return nextGameweek.matches.map(match => {
        const homeTeam = teamAnalysis.find(t => t.id === match.homeTeam);
        const awayTeam = teamAnalysis.find(t => t.id === match.awayTeam);
        
        if (!homeTeam || !awayTeam) return null;
        
        const prediction = predictMatch(homeTeam, awayTeam);
        
        return {
            match,
            homeTeam,
            awayTeam,
            prediction
        };
    }).filter(p => p !== null);
}

function predictMatch(homeTeam, awayTeam) {
    // Home advantage factor
    const homeAdvantage = 0.3;
    
    // Calculate team strengths
    const homeStrength = homeTeam.performanceRating + homeAdvantage + (homeTeam.recentForm * 2);
    const awayStrength = awayTeam.performanceRating + (awayTeam.recentForm * 2);
    
    const strengthDiff = homeStrength - awayStrength;
    
    // Calculate probabilities
    let homeWinProb, drawProb, awayWinProb;
    
    if (strengthDiff > 2) {
        homeWinProb = 65; drawProb = 25; awayWinProb = 10;
    } else if (strengthDiff > 1) {
        homeWinProb = 55; drawProb = 30; awayWinProb = 15;
    } else if (strengthDiff > 0) {
        homeWinProb = 45; drawProb = 35; awayWinProb = 20;
    } else if (strengthDiff > -1) {
        homeWinProb = 35; drawProb = 35; awayWinProb = 30;
    } else if (strengthDiff > -2) {
        homeWinProb = 25; drawProb = 30; awayWinProb = 45;
    } else {
        homeWinProb = 15; drawProb = 25; awayWinProb = 60;
    }
    
    // Predict most likely result
    let predictedResult, confidence;
    if (homeWinProb > drawProb && homeWinProb > awayWinProb) {
        predictedResult = 'home';
        confidence = homeWinProb;
    } else if (awayWinProb > drawProb) {
        predictedResult = 'away';
        confidence = awayWinProb;
    } else {
        predictedResult = 'draw';
        confidence = drawProb;
    }
    
    // Predict score based on attacking/defensive strengths
    const homeGoals = Math.max(0, Math.round(homeTeam.attackingStrength + (strengthDiff > 0 ? 0.5 : 0)));
    const awayGoals = Math.max(0, Math.round(awayTeam.attackingStrength + (strengthDiff < 0 ? 0.5 : 0)));
    
    return {
        result: predictedResult,
        confidence,
        homeWinProb,
        drawProb,
        awayWinProb,
        predictedScore: `${homeGoals}-${awayGoals}`,
        reasoning: generatePredictionReasoning(homeTeam, awayTeam, strengthDiff)
    };
}

function generatePredictionReasoning(homeTeam, awayTeam, strengthDiff) {
    const reasons = [];
    
    if (Math.abs(strengthDiff) > 1.5) {
        const stronger = strengthDiff > 0 ? homeTeam : awayTeam;
        reasons.push(`${stronger.name} has significantly better form and performance`);
    }
    
    if (homeTeam.recentForm > awayTeam.recentForm + 0.3) {
        reasons.push(`${homeTeam.name} in much better recent form`);
    } else if (awayTeam.recentForm > homeTeam.recentForm + 0.3) {
        reasons.push(`${awayTeam.name} in much better recent form`);
    }
    
    if (homeTeam.attackingStrength > awayTeam.defensiveStrength + 1) {
        reasons.push(`${homeTeam.name}'s attack vs ${awayTeam.name}'s defense favors home team`);
    } else if (awayTeam.attackingStrength > homeTeam.defensiveStrength + 1) {
        reasons.push(`${awayTeam.name}'s attack could exploit ${homeTeam.name}'s defense`);
    }
    
    reasons.push(`Home advantage for ${homeTeam.name}`);
    
    return reasons.slice(0, 3).join('. ') + '.';
}

function generateChampionshipForecast(standings, teamAnalysis) {
    const remainingGameweeks = fixtures.length - (results.filter(r => r.played).length / (standings.length / 2));
    
    // Simulate rest of season
    const projections = teamAnalysis.map(team => {
        const remainingMatches = getRemainingMatches(team.id).length;
        const expectedPoints = team.points + (remainingMatches * team.pointsPerGame * team.recentForm);
        
        return {
            ...team,
            projectedPoints: Math.round(expectedPoints),
            championshipProbability: calculateChampionshipProbability(team, teamAnalysis, remainingMatches)
        };
    });
    
    // Sort by projected points
    projections.sort((a, b) => {
        if (a.projectedPoints !== b.projectedPoints) return b.projectedPoints - a.projectedPoints;
        if (a.goalDifference !== b.goalDifference) return b.goalDifference - a.goalDifference;
        return b.goalsFor - a.goalsFor;
    });
    
    return {
        projections,
        remainingGameweeks: Math.max(0, remainingGameweeks)
    };
}

function calculateChampionshipProbability(team, allTeams, remainingMatches) {
    const currentLeader = allTeams[0];
    const pointsGap = currentLeader.points - team.points;
    
    // Base probability on current position
    let baseProbability = Math.max(0, (6 - team.position) / 6 * 100);
    
    // Adjust for form and performance
    baseProbability *= (team.recentForm + team.performanceRating / 10) / 2;
    
    // Adjust for points gap
    if (pointsGap > remainingMatches * 3) {
        baseProbability = 0; // Mathematically impossible
    } else if (pointsGap > 0) {
        baseProbability *= Math.max(0.1, 1 - (pointsGap / (remainingMatches * 3)));
    }
    
    // Boost for current leader
    if (team.position === 1) {
        baseProbability = Math.max(baseProbability, 25);
    }
    
    return Math.min(95, Math.max(1, Math.round(baseProbability)));
}

// HTML Generation functions for forecast display
function generateTeamAnalysisHTML(teamAnalysis) {
    return `
        <div class="team-analysis-grid">
            ${teamAnalysis.map(team => `
                <div class="team-analysis-card ${team.position <= 2 ? 'top-team' : ''}">
                    <div class="team-header">
                        <div class="team-position">${team.position}</div>
                        <div class="team-info">
                            <h3>${team.name}</h3>
                            <div class="team-record">${team.wins}W-${team.draws}D-${team.losses}L (${team.points} pts)</div>
                        </div>
                        <div class="performance-rating">
                            <div class="rating-circle" style="background: linear-gradient(45deg, ${getRatingColor(team.performanceRating)}, ${getRatingColor(team.performanceRating)}cc)">
                                ${team.performanceRating.toFixed(1)}
                            </div>
                        </div>
                    </div>
                    
                    <div class="team-metrics">
                        <div class="metric">
                            <span class="metric-label">Form:</span>
                            <span class="metric-value" style="color: ${team.formDescription.color}">
                                ${team.formDescription.icon} ${team.formDescription.text}
                            </span>
                        </div>
                        <div class="metric">
                            <span class="metric-label">Momentum:</span>
                            <span class="metric-value" style="color: ${team.momentum.color}">
                                ${team.momentum.icon} ${team.momentum.direction}
                            </span>
                        </div>
                        <div class="metric">
                            <span class="metric-label">Attack:</span>
                            <span class="metric-value">${team.attackingStrength} goals/game</span>
                        </div>
                        <div class="metric">
                            <span class="metric-label">Defense:</span>
                            <span class="metric-value">${team.defensiveStrength} conceded/game</span>
                        </div>
                        <div class="metric">
                            <span class="metric-label">Win Rate:</span>
                            <span class="metric-value">${team.winPercentage}%</span>
                        </div>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

function generateMatchPredictionsHTML(predictions, gameweek) {
    return `
        <div class="match-predictions">
            ${predictions.map(pred => `
                <div class="match-prediction-card ${pred.actualResult ? 'completed-match' : 'upcoming-match'}">
                    <div class="match-header">
                        <div class="match-status">
                            ${pred.actualResult ? 
                                `<span class="completed-badge">✅ Match Played</span>` : 
                                `<span class="upcoming-badge">🕒 Upcoming</span>`
                            }
                        </div>
                    </div>
                    
                    <div class="match-teams">
                        <div class="team-prediction home-team">
                            <h4>${pred.homeTeam.name}</h4>
                            <div class="team-form">Form: ${pred.homeTeam.formDescription.icon} ${pred.homeTeam.formDescription.text}</div>
                            <div class="win-probability">
                                ${pred.actualResult ? 
                                    `Predicted: ${pred.prediction.homeWinProb}%` :
                                    `${pred.prediction.homeWinProb}%`
                                }
                            </div>
                            ${pred.actualResult ? `
                                <div class="actual-result-text">
                                    <span class="actual-score-text">Actual: ${pred.actualResult.homeScore > pred.actualResult.awayScore ? 'Won' : pred.actualResult.homeScore === pred.actualResult.awayScore ? 'Draw' : 'Lost'}</span>
                                </div>
                            ` : ''}
                        </div>
                        
                        <div class="match-center">
                            <div class="vs-divider">VS</div>
                            ${pred.actualResult ? `
                                <div class="match-result-display">
                                    <div class="predicted-vs-actual">
                                        <span class="predicted-score-small">Predicted: ${pred.prediction.predictedScore}</span>
                                    </div>
                                    <div class="actual-score-large">
                                        <span class="actual-score-main">${pred.actualResult.homeScore} - ${pred.actualResult.awayScore}</span>
                                        <small class="actual-label">Actual Result</small>
                                    </div>
                                </div>
                                <div class="prediction-accuracy">
                                    ${getPredictionAccuracy(pred.prediction, pred.actualResult)}
                                </div>
                            ` : `
                                <div class="predicted-score">${pred.prediction.predictedScore}</div>
                                <div class="prediction-confidence">
                                    ${pred.prediction.confidence}% confidence
                                </div>
                            `}
                            <div class="draw-probability">
                                Draw: ${pred.prediction.drawProb}%
                            </div>
                        </div>
                        
                        <div class="team-prediction away-team">
                            <h4>${pred.awayTeam.name}</h4>
                            <div class="team-form">Form: ${pred.awayTeam.formDescription.icon} ${pred.awayTeam.formDescription.text}</div>
                            <div class="win-probability">
                                ${pred.actualResult ? 
                                    `Predicted: ${pred.prediction.awayWinProb}%` :
                                    `${pred.prediction.awayWinProb}%`
                                }
                            </div>
                            ${pred.actualResult ? `
                                <div class="actual-result-text">
                                    <span class="actual-score-text">Actual: ${pred.actualResult.awayScore > pred.actualResult.homeScore ? 'Won' : pred.actualResult.homeScore === pred.actualResult.awayScore ? 'Draw' : 'Lost'}</span>
                                </div>
                            ` : ''}
                        </div>
                    </div>
                    
                    <div class="prediction-reasoning">
                        <strong>Analysis:</strong> ${pred.prediction.reasoning}
                    </div>
                    
                    ${!pred.actualResult ? generateGoalScorerPredictionsHTML(
                        pred.homeTeam.id, 
                        pred.awayTeam.id, 
                        parseInt(pred.prediction.predictedScore.split(' - ')[0]), 
                        parseInt(pred.prediction.predictedScore.split(' - ')[1])
                    ) : ''}
                </div>
            `).join('')}
        </div>
    `;
}

// Get goal scorer statistics for a team
function getTeamGoalScorers(teamId) {
    const teamGoals = goals.filter(goal => goal.teamId === teamId);
    const scorerStats = {};
    
    teamGoals.forEach(goal => {
        if (!scorerStats[goal.playerId]) {
            scorerStats[goal.playerId] = {
                name: goal.playerName,
                goals: 0,
                penalties: 0,
                regularGoals: 0
            };
        }
        
        // Use totalGoals if available, otherwise count as 1
        const goalCount = goal.totalGoals || 1;
        scorerStats[goal.playerId].goals += goalCount;
        
        if (goal.goalType === 'penalti') {
            scorerStats[goal.playerId].penalties += goalCount;
        } else {
            scorerStats[goal.playerId].regularGoals += goalCount;
        }
    });
    
    // Convert to array and sort by goals
    return Object.values(scorerStats).sort((a, b) => b.goals - a.goals);
}

// Check if team has goal scorer data
function hasGoalScorerData(teamId) {
    return goals.some(goal => goal.teamId === teamId);
}

// Predict likely goal scorers for a match
function predictGoalScorers(homeTeamId, awayTeamId, predictedHomeScore, predictedAwayScore) {
    const predictions = {
        home: [],
        away: []
    };
    
    // Home team predictions
    if (hasGoalScorerData(homeTeamId) && predictedHomeScore > 0) {
        const homeScorers = getTeamGoalScorers(homeTeamId);
        const totalHomeGoals = homeScorers.reduce((sum, scorer) => sum + scorer.goals, 0);
        
        if (homeScorers.length > 0 && totalHomeGoals > 0) {
            homeScorers.forEach(scorer => {
                const probability = (scorer.goals / totalHomeGoals * 100);
                if (probability >= 15) { // Only show players with decent probability
                    predictions.home.push({
                        name: scorer.name,
                        probability: Math.round(probability),
                        goals: scorer.goals,
                        penalties: scorer.penalties
                    });
                }
            });
        }
    }
    
    // Away team predictions
    if (hasGoalScorerData(awayTeamId) && predictedAwayScore > 0) {
        const awayScorers = getTeamGoalScorers(awayTeamId);
        const totalAwayGoals = awayScorers.reduce((sum, scorer) => sum + scorer.goals, 0);
        
        if (awayScorers.length > 0 && totalAwayGoals > 0) {
            awayScorers.forEach(scorer => {
                const probability = (scorer.goals / totalAwayGoals * 100);
                if (probability >= 15) { // Only show players with decent probability
                    predictions.away.push({
                        name: scorer.name,
                        probability: Math.round(probability),
                        goals: scorer.goals,
                        penalties: scorer.penalties
                    });
                }
            });
        }
    }
    
    return predictions;
}

// Generate goal scorer predictions HTML
function generateGoalScorerPredictionsHTML(homeTeamId, awayTeamId, predictedHomeScore, predictedAwayScore) {
    const scorerPredictions = predictGoalScorers(homeTeamId, awayTeamId, predictedHomeScore, predictedAwayScore);
    
    if (scorerPredictions.home.length === 0 && scorerPredictions.away.length === 0) {
        return '';
    }
    
    // Generate unique ID for this match's scorer predictions
    const uniqueId = `scorer-${homeTeamId}-${awayTeamId}-${Date.now()}`;
    
    return `
        <div class="goal-scorer-predictions">
            <div class="scorer-section">
                <div class="scorer-header" onclick="toggleScorerPredictions('${uniqueId}')">
                    <h5>⚽ Likely Goal Scorers</h5>
                    <span class="scorer-toggle" id="toggle-${uniqueId}">▼</span>
                </div>
                <div class="scorer-predictions-grid collapsed" id="${uniqueId}">
                    ${scorerPredictions.home.length > 0 ? `
                        <div class="team-scorers home-scorers">
                            <h6>Home Team</h6>
                            ${scorerPredictions.home.map(scorer => `
                                <div class="scorer-prediction">
                                    <span class="scorer-name">${scorer.name}</span>
                                    <span class="scorer-probability">${scorer.probability}%</span>
                                    <small class="scorer-stats">${scorer.goals}g${scorer.penalties > 0 ? `, ${scorer.penalties}p` : ''}</small>
                                </div>
                            `).join('')}
                        </div>
                    ` : ''}
                    
                    ${scorerPredictions.away.length > 0 ? `
                        <div class="team-scorers away-scorers">
                            <h6>Away Team</h6>
                            ${scorerPredictions.away.map(scorer => `
                                <div class="scorer-prediction">
                                    <span class="scorer-name">${scorer.name}</span>
                                    <span class="scorer-probability">${scorer.probability}%</span>
                                    <small class="scorer-stats">${scorer.goals}g${scorer.penalties > 0 ? `, ${scorer.penalties}p` : ''}</small>
                                </div>
                            `).join('')}
                        </div>
                    ` : ''}
                </div>
            </div>
        </div>
    `;
}

// Toggle goal scorer predictions visibility
function toggleScorerPredictions(uniqueId) {
    const content = document.getElementById(uniqueId);
    const toggle = document.getElementById(`toggle-${uniqueId}`);
    
    if (!content || !toggle) return;
    
    if (content.classList.contains('collapsed')) {
        // Expand
        content.classList.remove('collapsed');
        content.classList.add('expanded');
        toggle.textContent = '▲';
    } else {
        // Collapse
        content.classList.remove('expanded');
        content.classList.add('collapsed');
        toggle.textContent = '▼';
    }
}

// Helper function to evaluate prediction accuracy
function getPredictionAccuracy(prediction, actualResult) {
    const actualHomeWin = actualResult.homeScore > actualResult.awayScore;
    const actualAwayWin = actualResult.awayScore > actualResult.homeScore;
    const actualDraw = actualResult.homeScore === actualResult.awayScore;
    
    const predictedHomeWin = prediction.homeWinProb > prediction.awayWinProb && prediction.homeWinProb > prediction.drawProb;
    const predictedAwayWin = prediction.awayWinProb > prediction.homeWinProb && prediction.awayWinProb > prediction.drawProb;
    const predictedDraw = prediction.drawProb > prediction.homeWinProb && prediction.drawProb > prediction.awayWinProb;
    
    if ((actualHomeWin && predictedHomeWin) || (actualAwayWin && predictedAwayWin) || (actualDraw && predictedDraw)) {
        return '<span class="prediction-correct">✅ Prediction Correct!</span>';
    } else {
        return '<span class="prediction-wrong">❌ Prediction Wrong</span>';
    }
}

function generateChampionshipForecastHTML(forecast) {
    return `
        <div class="championship-forecast">
            <h3>Final Standings Projection</h3>
            <div class="projected-table">
                ${forecast.projections.map((team, index) => {
                    // Determine border color based on championship probability
                    let borderClass = '';
                    if (team.championshipProbability >= 75) {
                        borderClass = 'high-chance'; // Green
                    } else if (team.championshipProbability >= 50) {
                        borderClass = 'good-chance'; // Yellow
                    } else if (team.championshipProbability >= 25) {
                        borderClass = 'medium-chance'; // Orange
                    }
                    
                    return `
                        <div class="projected-position ${index === 0 ? 'champion' : index < 3 ? 'podium' : ''} ${borderClass}">
                            <div class="proj-rank">${index + 1}</div>
                            <div class="proj-team">${team.name}</div>
                            <div class="proj-points">${team.projectedPoints} pts</div>
                            <div class="proj-probability">${team.championshipProbability}% chance</div>
                        </div>
                    `;
                }).join('')}
            </div>
            
            <div class="forecast-summary">
                <h4>Championship Predictions:</h4>
                <div class="top-candidates">
                    ${forecast.projections.slice(0, 3).map(team => `
                        <div class="candidate">
                            <strong>${team.name}</strong>: ${team.championshipProbability}% chance
                            ${team.position === 1 ? ' (Current Leader)' : ''}
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>
    `;
}

function generateStatisticalInsightsHTML(standings, teamAnalysis) {
    const topScorer = teamAnalysis.reduce((max, team) => team.goalsFor > max.goalsFor ? team : max);
    const bestDefense = teamAnalysis.reduce((min, team) => team.goalsAgainst < min.goalsAgainst ? team : min);
    const bestForm = teamAnalysis.reduce((max, team) => team.recentForm > max.recentForm ? team : max);
    const mostConsistent = teamAnalysis.reduce((max, team) => team.consistency > max.consistency ? team : max);
    
    return `
        <div class="statistical-insights">
            <div class="insight-cards">
                <div class="insight-card">
                    <div class="insight-title">⚽ Top Scorer</div>
                    <div class="insight-team">${topScorer.name}</div>
                    <div class="insight-value">${topScorer.goalsFor} goals (${topScorer.attackingStrength}/game)</div>
                </div>
                
                <div class="insight-card">
                    <div class="insight-title">🛡️ Best Defense</div>
                    <div class="insight-team">${bestDefense.name}</div>
                    <div class="insight-value">${bestDefense.goalsAgainst} conceded (${bestDefense.defensiveStrength}/game)</div>
                </div>
                
                <div class="insight-card">
                    <div class="insight-title">📈 Best Form</div>
                    <div class="insight-team">${bestForm.name}</div>
                    <div class="insight-value">${bestForm.formDescription.icon} ${bestForm.formDescription.text}</div>
                </div>
                
                <div class="insight-card">
                    <div class="insight-title">⚖️ Most Consistent</div>
                    <div class="insight-team">${mostConsistent.name}</div>
                    <div class="insight-value">${Math.round(mostConsistent.consistency * 100)}% consistency</div>
                </div>
            </div>
            
            <div class="league-stats">
                <h4>League Statistics:</h4>
                <div class="stats-grid">
                    <div>Average goals per game: ${(teamAnalysis.reduce((sum, t) => sum + t.goalsFor, 0) / teamAnalysis.reduce((sum, t) => sum + t.played, 0)).toFixed(1)}</div>
                    <div>Most competitive matchup: Teams closest in performance rating</div>
                    <div>Surprise factor: ${teamAnalysis.filter(t => Math.abs(t.position - (7 - t.performanceRating)) > 1).length} teams performing above/below expectations</div>
                </div>
            </div>
        </div>
    `;
}

function getRatingColor(rating) {
    if (rating >= 8) return '#27ae60';
    if (rating >= 6) return '#2ecc71';
    if (rating >= 4) return '#f39c12';
    if (rating >= 2) return '#e67e22';
    return '#e74c3c';
}

// Helper functions for forecast
function calculateRecentForm(team) {
    if (!team.matchHistory || team.matchHistory.length === 0) return 0.5;
    
    const recentMatches = team.matchHistory.slice(-3); // Last 3 matches
    if (recentMatches.length === 0) return 0.5;
    
    const points = recentMatches.reduce((sum, result) => {
        if (result === 'W') return sum + 1;
        if (result === 'D') return sum + 0.5;
        return sum;
    }, 0);
    
    return points / recentMatches.length;
}

function findNextGameweek() {
    const groupFixtures = getFixturesForGroup();
    const groupResults = getResultsForGroup();
    
    for (let gameweek of groupFixtures) {
        const hasUnplayedMatch = gameweek.matches.some(match => {
            return !groupResults.some(result => 
                result.gameweek === gameweek.gameweek &&
                result.homeTeam === match.homeTeam &&
                result.awayTeam === match.awayTeam
            );
        });
        
        if (hasUnplayedMatch) {
            // Only return matches that haven't been played
            const unplayedMatches = gameweek.matches.filter(match => {
                return !groupResults.some(result => 
                    result.gameweek === gameweek.gameweek &&
                    result.homeTeam === match.homeTeam &&
                    result.awayTeam === match.awayTeam
                );
            });
            
            return {
                gameweek: gameweek.gameweek,
                matches: unplayedMatches
            };
        }
    }
    return null; // All matches played
}

function getRemainingMatches(teamId) {
    const remainingMatches = [];
    const groupFixtures = getFixturesForGroup();
    const groupResults = getResultsForGroup();
    const groupTeams = getTeamsForGroup();
    
    for (let gameweek of groupFixtures) {
        for (let match of gameweek.matches) {
            if (match.homeTeam === teamId || match.awayTeam === teamId) {
                // Check if this match hasn't been played
                const isPlayed = groupResults.some(result => 
                    result.gameweek === gameweek.gameweek &&
                    result.homeTeam === match.homeTeam &&
                    result.awayTeam === match.awayTeam
                );
                
                if (!isPlayed) {
                    const homeTeam = groupTeams.find(t => t.id === match.homeTeam);
                    const awayTeam = groupTeams.find(t => t.id === match.awayTeam);
                    
                    remainingMatches.push({
                        ...match,
                        gameweek: gameweek.gameweek,
                        homeTeamName: homeTeam ? homeTeam.name : match.homeTeam,
                        awayTeamName: awayTeam ? awayTeam.name : match.awayTeam
                    });
                }
            }
        }
    }
    
    return remainingMatches;
}

// Admin functions for adding results
let currentMatch = null;

function showAddResultModal(matchId, homeTeamName, awayTeamName, matchDate, matchTime) {
    // Find match details from fixtures
    const match = findMatchById(matchId);
    if (!match) return;
    
    currentMatch = {
        id: matchId,
        homeTeam: match.homeTeam,
        awayTeam: match.awayTeam,
        homeTeamName: homeTeamName,
        awayTeamName: awayTeamName,
        date: matchDate,
        time: matchTime,
        gameweek: match.gameweek,
        groupId: match.groupId
    };
    
    // Populate modal
    document.getElementById('modal-teams').textContent = `${homeTeamName} vs ${awayTeamName}`;
    document.getElementById('modal-datetime').textContent = `${matchDate} at ${matchTime}`;
    document.getElementById('homeTeamLabel').textContent = homeTeamName;
    document.getElementById('awayTeamLabel').textContent = awayTeamName;
    
    // Reset form
    document.getElementById('addResultForm').reset();
    
    // Show modal
    document.getElementById('addResultModal').style.display = 'block';
}

function hideAddResultModal() {
    document.getElementById('addResultModal').style.display = 'none';
    currentMatch = null;
}

function showEditResultModal(matchId, homeTeamName, awayTeamName, matchDate, matchTime, homeScore, awayScore) {
    // Find match details from fixtures
    const match = findMatchById(matchId);
    if (!match) return;
    
    currentMatch = {
        id: matchId,
        homeTeam: match.homeTeam,
        awayTeam: match.awayTeam,
        homeTeamName: homeTeamName,
        awayTeamName: awayTeamName,
        date: matchDate,
        time: matchTime,
        gameweek: match.gameweek,
        groupId: match.groupId,
        isEdit: true
    };
    
    // Populate modal
    document.getElementById('modal-teams').textContent = `${homeTeamName} vs ${awayTeamName}`;
    document.getElementById('modal-datetime').textContent = `${matchDate} at ${matchTime}`;
    document.getElementById('homeTeamLabel').textContent = homeTeamName;
    document.getElementById('awayTeamLabel').textContent = awayTeamName;
    
    // Pre-populate form with existing scores
    document.getElementById('homeScore').value = homeScore;
    document.getElementById('awayScore').value = awayScore;
    
    // Change modal title for editing
    document.querySelector('.modal-header h3').textContent = 'Edit Match Result';
    document.querySelector('.btn-primary').textContent = 'Update Result';
    
    // Show modal
    document.getElementById('addResultModal').style.display = 'block';
}

function findMatchById(matchId) {
    for (const gameweek of fixtures) {
        for (const match of gameweek.matches) {
            if (match.id === matchId) {
                return {
                    ...match,
                    gameweek: gameweek.gameweek,
                    groupId: gameweek.groupId
                };
            }
        }
    }
    return null;
}

function validateMatchTime(matchDate, matchTime) {
    if (!ADMIN_CONFIG.validateTime) {
        return true; // Skip validation if disabled
    }
    
    // Create match datetime - using local timezone
    const matchDateTime = new Date(`${matchDate}T${matchTime}:00`);
    const currentDateTime = new Date();
    
    // Debug logging (can be removed later)
    console.log('Match time validation:', {
        matchDate,
        matchTime,
        matchDateTime: matchDateTime.toLocaleString(),
        currentDateTime: currentDateTime.toLocaleString(),
        canAddResult: currentDateTime >= matchDateTime
    });
    
    // Check if current time has reached or passed the match time
    return currentDateTime >= matchDateTime;
}

function submitResult(event) {
    event.preventDefault();
    
    if (!currentMatch) return;
    
    const homeScore = parseInt(document.getElementById('homeScore').value);
    const awayScore = parseInt(document.getElementById('awayScore').value);
    
    // Validate match time
    if (!validateMatchTime(currentMatch.date, currentMatch.time)) {
        showToast('Cannot add result: Match has not started yet!', 'error');
        return;
    }
    
    if (currentMatch.isEdit) {
        // Edit existing result
        const existingResultIndex = results.findIndex(r => r.matchId === currentMatch.id);
        if (existingResultIndex !== -1) {
            results[existingResultIndex].homeScore = homeScore;
            results[existingResultIndex].awayScore = awayScore;
        }
        
        // Trigger download of updated results.json
        downloadUpdatedResults();
        
        // Hide modal and reset title
        hideAddResultModal();
        document.querySelector('.modal-header h3').textContent = 'Add Match Result';
        document.querySelector('.btn-primary').textContent = 'Add Result';
        
        // Show success toast
        if (isMobileDevice()) {
            showToast('Result updated! Data stored in session (will be lost on refresh)', 'success');
        } else {
            showToast('Result updated! Check Downloads → Replace data/results.json → Refresh page', 'success');
        }
    } else {
        // Create new result
        const newResult = {
            matchId: currentMatch.id,
            homeTeam: currentMatch.homeTeam,
            awayTeam: currentMatch.awayTeam,
            homeScore: homeScore,
            awayScore: awayScore,
            gameweek: currentMatch.gameweek,
            groupId: currentMatch.groupId,
            played: true
        };
        
        // Add to results array (only in memory for current session)
        results.push(newResult);
        
        // Trigger download of updated results.json
        downloadUpdatedResults();
        
        // Hide modal
        hideAddResultModal();
        
        // Show success toast with instructions based on device type
        if (isMobileDevice()) {
            showToast('Result added! Data stored in session (will be lost on refresh)', 'success');
        } else {
            showToast('Result added! Check Downloads → Replace data/results.json → Refresh page', 'success');
        }
    }
    
    // Update all displays
    updateAllTabs();
}

function showToast(message, type = 'info', duration = 3000) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    
    toast.textContent = message;
    toast.className = `toast ${type} show`;
    
    // Hide after specified duration
    setTimeout(() => {
        toast.className = 'toast';
    }, duration);
}

// Close modal when clicking outside
window.onclick = function(event) {
    const modal = document.getElementById('addResultModal');
    if (event.target === modal) {
        hideAddResultModal();
    }
}

// Function to enable admin mode (for testing)
function enableAdminMode() {
    ADMIN_CONFIG.role = 'admin';
    updateAllTabs(); // Refresh to show admin buttons
    showToast('Admin mode enabled', 'success');
}

// Function to disable admin mode
function disableAdminMode() {
    ADMIN_CONFIG.role = 'user';
    updateAllTabs(); // Refresh to hide admin buttons
    showToast('Admin mode disabled', 'info');
}

// Function to toggle time validation
function toggleTimeValidation() {
    ADMIN_CONFIG.validateTime = !ADMIN_CONFIG.validateTime;
    const status = ADMIN_CONFIG.validateTime ? 'enabled' : 'disabled';
    showToast(`Time validation ${status}`, 'info');
}

// Function to load pending results from session storage
function loadPendingResults() {
    const pendingResults = sessionStorage.getItem('pendingResults');
    if (pendingResults && isMobileDevice()) {
        try {
            const sessionResults = JSON.parse(pendingResults);
            // Merge session results with loaded results, avoiding duplicates
            sessionResults.forEach(sessionResult => {
                const exists = results.some(result => 
                    result.homeTeam === sessionResult.homeTeam && 
                    result.awayTeam === sessionResult.awayTeam &&
                    result.date === sessionResult.date
                );
                if (!exists) {
                    results.push(sessionResult);
                }
            });
            console.log('Loaded pending results from session');
            showToast('Previous session data restored', 'info');
        } catch (error) {
            console.error('Error loading pending results:', error);
        }
    }
}

// Function to detect if the device is mobile
function isMobileDevice() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || 
           window.innerWidth <= 768;
}

// Function to download updated results.json
function downloadUpdatedResults() {
    // Check if it's a mobile device
    if (isMobileDevice()) {
        // On mobile, just store in session and show different message
        sessionStorage.setItem('pendingResults', JSON.stringify(results));
        console.log('Results stored in session (mobile device)');
        return;
    }
    
    // On desktop, proceed with download
    const dataStr = JSON.stringify(results, null, 2);
    const dataBlob = new Blob([dataStr], {type: 'application/json'});
    
    const link = document.createElement('a');
    link.href = URL.createObjectURL(dataBlob);
    link.download = 'results.json';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// Function to export all current results for manual copying
function exportAllResults() {
    console.log('All Current Results (copy this to results.json):');
    console.log(JSON.stringify(results, null, 2));
    
    if (!isMobileDevice()) {
        downloadUpdatedResults();
    } else {
        // On mobile, just show the data in console and update session
        sessionStorage.setItem('pendingResults', JSON.stringify(results));
        showToast('Results available in browser console (F12)', 'info');
    }
    
    return results;
}

// Function to clear pending session data
function clearSessionData() {
    sessionStorage.removeItem('pendingResults');
    showToast('Session data cleared', 'info');
}

// Cost and usage tracking
let tokenUsageStats = {
    totalTokens: 0,
    totalRequests: 0,
    estimatedCost: 0, // Rough estimate for gpt-3.5-turbo
    lastReset: Date.now()
};

// Calculate estimated cost (approximate rates for gpt-3.5-turbo)
function updateCostEstimate(usage) {
    if (usage && usage.total_tokens) {
        tokenUsageStats.totalTokens += usage.total_tokens;
        tokenUsageStats.totalRequests += 1;
        
        // Rough cost estimate: gpt-3.5-turbo is ~$0.002 per 1K tokens
        const costPer1KTokens = 0.002;
        tokenUsageStats.estimatedCost = (tokenUsageStats.totalTokens / 1000) * costPer1KTokens;
    }
}

// Console helper functions (for testing)
window.footballAdmin = {
    enableAdmin: enableAdminMode,
    disableAdmin: disableAdminMode,
    toggleValidation: toggleTimeValidation,
    getConfig: () => ADMIN_CONFIG,
    showConfig: () => {
        console.log('Current Admin Configuration:', ADMIN_CONFIG);
        console.log('OpenAI Configuration:', {
            clientInitialized: !!OPENAI_CONFIG.apiKey,
            apiKeyLoaded: !!OPENAI_CONFIG.apiKey,
            useOpenAI: SIMULATION_CONFIG.useOpenAI,
            model: OPENAI_CONFIG.model,
            maxTokens: OPENAI_CONFIG.maxTokens,
            retryAttempts: OPENAI_CONFIG.retryAttempts,
            retryDelay: OPENAI_CONFIG.retryDelay
        });
        console.log('Token Usage Stats:', tokenUsageStats);
        return { 
            ADMIN_CONFIG, 
            OPENAI_CONFIG: {
                client: !!OPENAI_CONFIG.apiKey, 
                apiKey: !!OPENAI_CONFIG.apiKey, 
                enabled: SIMULATION_CONFIG.useOpenAI,
                model: OPENAI_CONFIG.model,
                maxTokens: OPENAI_CONFIG.maxTokens
            },
            TOKEN_STATS: tokenUsageStats
        };
    },
    exportResults: exportAllResults,
    downloadResults: downloadUpdatedResults,
    clearSessionData: clearSessionData,
    testDragDrop: testDragAndDrop,
    reloadPage: () => {
        showToast('Reloading page to read from updated file...', 'info');
        setTimeout(() => location.reload(), 1000);
    },
    // OpenAI controls
    enableOpenAI: () => {
        const wasEnabled = SIMULATION_CONFIG.useOpenAI;
        SIMULATION_CONFIG.useOpenAI = true;
        
        if (!wasEnabled) {
            // Initialize OpenAI if it wasn't enabled before
            initializeOpenRouterSystem();
        } else {
            showToast('OpenAI analysis already enabled', 'info', 3000);
        }
        console.log('OpenAI enabled for this session');
    },
    disableOpenAI: () => {
        SIMULATION_CONFIG.useOpenAI = false;
        showToast('OpenAI analysis disabled - Using standard analysis', 'info', 3000);
        console.log('OpenAI disabled for this session');
    },
    checkOpenAI: () => {
        const status = {
            enabled: SIMULATION_CONFIG.useOpenAI,
            clientInitialized: !!OPENAI_CONFIG.apiKey,
            apiKeyLoaded: !!OPENAI_CONFIG.apiKey,
            model: OPENAI_CONFIG.model,
            maxTokens: OPENAI_CONFIG.maxTokens,
            retryAttempts: OPENAI_CONFIG.retryAttempts,
            readyForUse: SIMULATION_CONFIG.useOpenAI && !!OPENAI_CONFIG.apiKey
        };
        console.log('🤖 OpenAI Status:', status);
        
        if (status.readyForUse) {
            console.log('✅ OpenAI is ready for use!');
        } else if (!status.enabled) {
            console.log('⚠️ OpenAI is disabled. Enable with: footballAdmin.enableOpenAI()');
        } else if (!status.clientInitialized) {
            console.log('⚠️ OpenAI client not initialized. Check API key.');
        } else if (!status.apiKeyLoaded) {
            console.log('⚠️ No API key loaded. Check .env file or use manual entry.');
        }
        
        return status.readyForUse;
    },
    // Cost optimization controls
    setMaxTokens: (tokens) => {
        if (tokens >= 50 && tokens <= 2000) {
            OPENAI_CONFIG.maxTokens = tokens;
            showToast(`Max tokens set to ${tokens}`, 'info');
            console.log(`Token limit updated to ${tokens} for this session`);
        } else {
            console.error('Invalid token limit. Must be between 50 and 2000.');
        }
    },
    getTokenStats: () => {
        console.log('Token Usage Statistics:', {
            ...tokenUsageStats,
            averageTokensPerRequest: tokenUsageStats.totalRequests > 0 ? 
                Math.round(tokenUsageStats.totalTokens / tokenUsageStats.totalRequests) : 0,
            sessionDuration: Math.round((Date.now() - tokenUsageStats.lastReset) / 1000 / 60) + ' minutes'
        });
        return tokenUsageStats;
    },
    resetTokenStats: () => {
        tokenUsageStats = {
            totalTokens: 0,
            totalRequests: 0,
            estimatedCost: 0,
            lastReset: Date.now()
        };
        showToast('Token usage stats reset', 'info');
    },
    // Retry configuration
    setRetryAttempts: (attempts) => {
        if (attempts >= 1 && attempts <= 5) {
            OPENAI_CONFIG.retryAttempts = attempts;
            showToast(`Retry attempts set to ${attempts}`, 'info');
        } else {
            console.error('Invalid retry attempts. Must be between 1 and 5.');
        }
    },
    // Configuration management (clears any old localStorage data)
    clearConfig: () => {
        localStorage.removeItem('openai_config');
        sessionStorage.removeItem('openai_session_key');
        // Reset to code defaults
        SIMULATION_CONFIG.useOpenAI = true; // Back to default
        OPENAI_CONFIG.maxTokens = 500;
        OPENAI_CONFIG.retryAttempts = 3;
        OPENAI_CONFIG.model = 'gpt-3.5-turbo';
        showToast('Cleared old config, using code defaults', 'info');
        console.log('🗑️ Cleared localStorage/sessionStorage and reset to code defaults');
    },
    // Debug helpers
    reloadApiKey: async () => {
        console.log('🔄 Reloading API key...');
        OPENAI_CONFIG.apiKey = null;
        openai = null;
        
        await loadOpenAIKeyFromConfig();
        if (!OPENAI_CONFIG.apiKey) {
            await loadOpenAIKeyFromEnv();
        }
        if (!OPENAI_CONFIG.apiKey) {
            loadOpenAIKeyFromSession();
        }
        
        if (OPENAI_CONFIG.apiKey) {
            console.log('✅ API key reloaded successfully');
            showToast('API key reloaded', 'success');
        } else {
            console.log('❌ No API key found');
            showToast('No API key found', 'error');
        }
        
        return !!OPENAI_CONFIG.apiKey;
    },
    debugOpenAI: () => {
        console.log('🔍 Complete OpenAI Debug Report:');
        console.log('window.fetch available:', !!window.fetch);
        console.log('SIMULATION_CONFIG.useOpenAI:', SIMULATION_CONFIG.useOpenAI, '(from code defaults)');
        console.log('openai client exists:', !!openai);
        console.log('OPENAI_CONFIG.apiKey exists:', !!OPENAI_CONFIG.apiKey);
        console.log('API Key prefix:', OPENAI_CONFIG.apiKey ? OPENAI_CONFIG.apiKey.substring(0, 12) + '...' : 'none');
        
        const oldLocalStorage = localStorage.getItem('openai_config');
        if (oldLocalStorage) {
            console.warn('⚠️ Old localStorage config found (no longer used):', oldLocalStorage);
            console.log('💡 Run footballAdmin.clearConfig() to remove old data');
        } else {
            console.log('✅ No localStorage config (good - using code defaults)');
        }
        
        console.log('Current Configuration (from code defaults):', {
            useOpenAI: SIMULATION_CONFIG.useOpenAI,
            model: OPENAI_CONFIG.model,
            maxTokens: OPENAI_CONFIG.maxTokens,
            retryAttempts: OPENAI_CONFIG.retryAttempts
        });
        
        const isReady = SIMULATION_CONFIG.useOpenAI && !!openai && !!OPENAI_CONFIG.apiKey;
        console.log('🎯 OpenAI Ready:', isReady);
        
        if (!isReady) {
            console.log('❌ Issues preventing OpenAI from working:');
            if (!window.fetch) console.log('  - Fetch API not available');
            if (!SIMULATION_CONFIG.useOpenAI) console.log('  - OpenAI disabled in config');
            if (!openai) console.log('  - OpenAI client not initialized');
            if (!OPENAI_CONFIG.apiKey) console.log('  - No API key available');
        }
        
        return {
            ready: isReady,
            sdkLoaded: !!window.fetch,
            clientInitialized: !!openai,
            hasApiKey: !!OPENAI_CONFIG.apiKey,
            enabled: SIMULATION_CONFIG.useOpenAI
        };
    },
    clearConfig: () => {
        localStorage.removeItem('openai_config');
        sessionStorage.removeItem('openai_session_key');
        console.log('🗑️ Cleared all OpenAI configuration from storage');
        console.log('💡 Reload the page to use default settings');
    },
    testConfig: () => {
        console.log('🧪 Testing configuration files...');
        
        // Test config.json
        fetch('config.json')
            .then(response => {
                console.log('config.json status:', response.status, response.ok ? '✅' : '❌');
                return response.json();
            })
            .then(data => console.log('config.json content:', data))
            .catch(err => console.log('config.json error:', err.message));
            
        // Test .env
        fetch('.env')
            .then(response => {
                console.log('.env status:', response.status, response.ok ? '✅' : '❌');
                return response.text();
            })
            .then(data => console.log('.env content available:', !!data))
            .catch(err => console.log('.env error:', err.message));
    }
};

// ===================================
// TEAMS TAB - LINEUP FUNCTIONALITY
// ===================================

let teamsData = [];

// Load team data with player information
async function loadPlayersData() {
    try {
        const response = await fetch('./data/teams.json');
        teamsData = await response.json();
        console.log('Teams data loaded:', teamsData);
        populateTeamLineupSelector();
    } catch (error) {
        console.error('Error loading teams data:', error);
    }
}

// Populate team selector for lineup
function populateTeamLineupSelector() {
    const selector = document.getElementById('selected-team-lineup');
    if (!selector) return;
    
    // Clear existing options
    selector.innerHTML = '<option value="">Select a team...</option>';
    
    // Create hierarchical structure with optgroups for each group
    groups.forEach(group => {
        const groupTeams = teamsData.filter(team => team.groupId === group.id);
        
        if (groupTeams.length > 0) {
            const optgroup = document.createElement('optgroup');
            optgroup.label = group.name;
            
            groupTeams.forEach(team => {
                const option = document.createElement('option');
                option.value = team.id;
                option.textContent = team.name;
                optgroup.appendChild(option);
            });
            
            selector.appendChild(optgroup);
        }
    });
    
    // Set default team if available
    const defaultTeamId = defaults.defaultTeam;
    const defaultTeamFromConfig = teamsData.find(team => team.id === defaultTeamId);
    const defaultTeamFromData = teamsData.find(team => team.isDefault);
    
    if (defaultTeamFromConfig) {
        selector.value = defaultTeamFromConfig.id;
        updateTeamLineup();
    } else if (defaultTeamFromData) {
        selector.value = defaultTeamFromData.id;
        updateTeamLineup();
    }
}

// Update team lineup when team selection changes
function updateTeamLineup() {
    const selectedTeamId = document.getElementById('selected-team-lineup').value;
    if (!selectedTeamId) return;
    
    const team = teamsData.find(t => t.id === selectedTeamId);
    if (!team) return;
    
    console.log('Updating lineup for team:', team.name);
    
    // Populate tactics selector for this team
    populateTacticsSelector(selectedTeamId);
    
    // Update field players
    updateFieldPlayers(team);
    
    // Update bench players
    updateBenchPlayers(team);
}

// Update players on the field
function updateFieldPlayers(team) {
    // Validate and fix formation if needed
    const validatedFormation = validateFutsalFormation(team.formation);
    
    const starters = team.players.filter(player => player.isStarter);
    
    // Update goalkeeper
    const goalkeeper = starters.find(p => p.position === 'goalkeeper');
    if (goalkeeper) {
        updatePlayerIcon('goalkeeper', goalkeeper);
        updatePlayerName('goalkeeper-name', goalkeeper);
    }
    
    // Get formation structure
    const formationParts = validatedFormation.split('-').map(Number);
    const [defenders, midfielders, forwards] = formationParts;
    
    // Clear all field positions first
    clearFieldPositions();
    
    // Get players by position
    const defenderPlayers = starters.filter(p => p.position === 'defender').slice(0, defenders);
    const midfielderPlayers = starters.filter(p => p.position === 'midfielder').slice(0, midfielders);
    const forwardPlayers = starters.filter(p => p.position === 'forward').slice(0, forwards);
    
    // Position defenders
    positionPlayers('defender', defenderPlayers, defenders);
    
    // Position midfielders  
    positionPlayers('midfielder', midfielderPlayers, midfielders);
    
    // Position forwards
    positionPlayers('forward', forwardPlayers, forwards);
}

// Validate futsal formation
function validateFutsalFormation(formation) {
    const validFormations = ['1-1-2', '1-2-1', '2-1-1', '2-2-0', '0-2-2'];
    
    if (validFormations.includes(formation)) {
        return formation;
    }
    
    // Default futsal formation
    return '2-0-2';
}

// Clear all field positions
function clearFieldPositions() {
    // Clear original positions (2-7)
    for (let i = 2; i <= 7; i++) {
        const position = document.getElementById(`position-${i}`);
        if (position) {
            position.style.display = 'none';
        }
    }
    // Clear additional positions (8-13)
    for (let i = 8; i <= 13; i++) {
        const position = document.getElementById(`position-${i}`);
        if (position) {
            position.style.display = 'none';
        }
    }
}

// Position players based on formation and available players
function positionPlayers(positionType, players, maxPlayers) {
    // Early return if no players needed for this position
    if (maxPlayers === 0 || players.length === 0) return;
    
    // Get available positions based on formation
    const availablePositions = getAvailablePositions(positionType, maxPlayers);
    
    // Position players in available spots
    players.slice(0, maxPlayers).forEach((player, index) => {
        if (availablePositions[index]) {
            const positionElement = document.getElementById(availablePositions[index]);
            if (positionElement) {
                positionElement.style.display = 'block';
                updatePlayerIcon(availablePositions[index], player);
            }
        }
    });
}

// Get available positions based on formation needs
function getAvailablePositions(positionType, count) {
    const allPositions = {
        'defender': ['position-2', 'position-3', 'position-8', 'position-9'],     // 4 defensive positions
        'midfielder': ['position-4', 'position-6', 'position-10', 'position-11'], // 4 midfield positions  
        'forward': ['position-5', 'position-7', 'position-12', 'position-13']     // 4 attacking positions
    };
    
    const positions = allPositions[positionType] || [];
    
    // Return the number of positions needed
    return positions.slice(0, count);
}

// Get position IDs for each position type (keeping for compatibility)
function getPositionsForType(positionType) {
    switch (positionType) {
        case 'defender':
            return ['position-2', 'position-3'];
        case 'midfielder':
            return ['position-4'];
        case 'forward':
            return ['position-5'];
        default:
            return [];
    }
}

// Update player icon and information
function updatePlayerIcon(positionId, player) {
    const positionElement = document.getElementById(positionId);
    if (!positionElement) return;
    
    const playerIcon = positionElement.querySelector('.player-icon');
    const playerNumber = positionElement.querySelector('.player-number');
    const playerName = positionElement.querySelector('.player-name');
    
    if (playerIcon && playerNumber && playerName) {
        // Update number
        playerNumber.textContent = player.number;
        
        // Update name
        playerName.textContent = player.name;
        
        // Update position class
        playerIcon.className = `player-icon ${player.position}`;
        
        // Add captain indicator if needed
        if (player.isCaptain) {
            playerIcon.classList.add('player-captain');
        } else {
            playerIcon.classList.remove('player-captain');
        }
        
        // Add injury indicator if needed
        if (player.status === 'injured') {
            playerIcon.classList.add('player-injured');
        } else {
            playerIcon.classList.remove('player-injured');
        }
        
        // Add drag-and-drop functionality
        setupPlayerDragAndDrop(playerIcon, positionId, player);
    }
}

// Drag and Drop Functionality
function setupPlayerDragAndDrop(playerIcon, positionId, player) {
    if (!playerIcon) return;
    
    // Make the player icon draggable
    playerIcon.draggable = true;
    
    // Store player data on the element
    playerIcon.dataset.playerId = player.id;
    playerIcon.dataset.playerPosition = player.position;
    playerIcon.dataset.currentPositionId = positionId;
    
    // Remove existing event listeners to prevent duplicates
    playerIcon.removeEventListener('dragstart', playerIcon._dragStartHandler);
    playerIcon.removeEventListener('dragend', playerIcon._dragEndHandler);
    playerIcon.removeEventListener('touchstart', playerIcon._touchStartHandler);
    playerIcon.removeEventListener('touchend', playerIcon._touchEndHandler);
    
    // Create and store event handlers
    playerIcon._dragStartHandler = function(e) {
        console.log('Drag start for player:', player.name);
        e.dataTransfer.setData('text/plain', JSON.stringify({
            playerId: player.id,
            playerPosition: player.position,
            sourcePositionId: positionId
        }));
        
        playerIcon.classList.add('dragging');
        showDropZones(player.position);
    };
    
    playerIcon._dragEndHandler = function(e) {
        console.log('Drag end for player:', player.name);
        playerIcon.classList.remove('dragging');
        hideDropZones();
    };
    
    // Attach drag events
    playerIcon.addEventListener('dragstart', playerIcon._dragStartHandler);
    playerIcon.addEventListener('dragend', playerIcon._dragEndHandler);
    
    // Touch support for mobile
    let touchStartData = null;
    
    playerIcon._touchStartHandler = function(e) {
        e.preventDefault();
        console.log('Touch start for player:', player.name);
        touchStartData = {
            playerId: player.id,
            playerPosition: player.position,
            sourcePositionId: positionId
        };
        
        playerIcon.classList.add('dragging');
        showDropZones(player.position);
    };
    
    playerIcon._touchEndHandler = function(e) {
        e.preventDefault();
        console.log('Touch end for player:', player.name);
        
        if (touchStartData) {
            const touch = e.changedTouches[0];
            const elementBelow = document.elementFromPoint(touch.clientX, touch.clientY);
            const targetPosition = elementBelow?.closest('.player-position');
            
            if (targetPosition && isValidDropPosition(touchStartData.playerPosition, targetPosition.id)) {
                swapPlayers(touchStartData.sourcePositionId, targetPosition.id);
                showToast(`Player moved to ${getPositionDisplayName(targetPosition.id)}`, 'success');
            }
        }
        
        playerIcon.classList.remove('dragging');
        hideDropZones();
        touchStartData = null;
    };
    
    playerIcon.addEventListener('touchstart', playerIcon._touchStartHandler);
    playerIcon.addEventListener('touchend', playerIcon._touchEndHandler);
    
    console.log('Drag and drop setup completed for:', player.name, 'at position:', positionId);
}

// Bench Player Drag and Drop Functionality
function setupBenchPlayerDragAndDrop(playerDiv, playerIcon, player) {
    if (!playerDiv || !playerIcon) return;
    
    // Make the bench player draggable
    playerDiv.draggable = true;
    playerDiv.style.cursor = 'grab';
    
    // Store player data on the element
    playerDiv.dataset.playerId = player.id;
    playerDiv.dataset.playerPosition = player.position;
    playerDiv.dataset.isBenchPlayer = 'true';
    
    // Remove existing event listeners to prevent duplicates
    playerDiv.removeEventListener('dragstart', playerDiv._dragStartHandler);
    playerDiv.removeEventListener('dragend', playerDiv._dragEndHandler);
    
    // Create and store event handlers
    playerDiv._dragStartHandler = function(e) {
        console.log('Bench drag start for player:', player.name);
        e.dataTransfer.setData('text/plain', JSON.stringify({
            playerId: player.id,
            playerPosition: player.position,
            isBenchPlayer: true,
            sourceElement: 'bench'
        }));
        
        playerDiv.classList.add('dragging');
        playerDiv.style.cursor = 'grabbing';
        showBenchDropZones(player.position);
    };
    
    playerDiv._dragEndHandler = function(e) {
        console.log('Bench drag end for player:', player.name);
        playerDiv.classList.remove('dragging');
        playerDiv.style.cursor = 'grab';
        hideBenchDropZones();
    };
    
    // Attach drag events
    playerDiv.addEventListener('dragstart', playerDiv._dragStartHandler);
    playerDiv.addEventListener('dragend', playerDiv._dragEndHandler);
    
    // Touch support for mobile
    let touchStartData = null;
    
    // Remove existing touch listeners to prevent duplicates
    playerDiv.removeEventListener('touchstart', playerDiv._touchStartHandler);
    playerDiv.removeEventListener('touchend', playerDiv._touchEndHandler);
    
    playerDiv._touchStartHandler = function(e) {
        e.preventDefault();
        console.log('Bench touch start for player:', player.name);
        touchStartData = {
            playerId: player.id,
            playerPosition: player.position,
            isBenchPlayer: true,
            sourceElement: 'bench'
        };
        
        playerDiv.classList.add('dragging');
        playerDiv.style.cursor = 'grabbing';
        showBenchDropZones(player.position);
    };
    
    playerDiv._touchEndHandler = function(e) {
        e.preventDefault();
        console.log('Bench touch end for player:', player.name);
        
        if (touchStartData) {
            const touch = e.changedTouches[0];
            const elementBelow = document.elementFromPoint(touch.clientX, touch.clientY);
            
            // Check if dropped on field position
            const targetFieldPosition = elementBelow?.closest('.player-position');
            if (targetFieldPosition && isValidDropPosition(touchStartData.playerPosition, targetFieldPosition.id)) {
                console.log('Bench player dropped on field position:', targetFieldPosition.id);
                moveBenchPlayerToField(touchStartData, targetFieldPosition.id);
                showToast(`${player.name} moved to ${getPositionDisplayName(targetFieldPosition.id)}`, 'success');
            }
            // Check if dropped on bench area
            else if (elementBelow?.closest('#bench-players')) {
                console.log('Bench player dropped on bench area');
                // Handle bench reordering if needed
                showToast(`${player.name} reordered in bench`, 'info');
            }
        }
        
        playerDiv.classList.remove('dragging');
        playerDiv.style.cursor = 'grab';
        hideBenchDropZones();
        touchStartData = null;
    };
    
    // Attach touch events
    playerDiv.addEventListener('touchstart', playerDiv._touchStartHandler);
    playerDiv.addEventListener('touchend', playerDiv._touchEndHandler);
    
    console.log('Bench drag and drop setup completed for:', player.name);
}

// Show drop zones for bench players (field positions + bench area)
function showBenchDropZones(playerPosition) {
    console.log('Showing bench drop zones for position:', playerPosition);
    
    // Show field drop zones (same as field players)
    showDropZones(playerPosition);
    
    // Also set up bench area as drop zone for reordering
    const benchArea = document.getElementById('bench-players');
    if (benchArea) {
        benchArea.classList.add('bench-drop-zone');
        setupBenchDropZone(benchArea);
    }
}

// Hide bench drop zones
function hideBenchDropZones() {
    hideDropZones(); // Hide field drop zones
    
    const benchArea = document.getElementById('bench-players');
    if (benchArea) {
        benchArea.classList.remove('bench-drop-zone');
        removeBenchDropZone(benchArea);
    }
}

// Setup bench area as drop zone
function setupBenchDropZone(benchArea) {
    console.log('Setting up bench drop zone');
    
    function handleBenchDragOver(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    }
    
    function handleBenchDrop(e) {
        e.preventDefault();
        console.log('Drop on bench area');
        
        try {
            const dragData = JSON.parse(e.dataTransfer.getData('text/plain'));
            console.log('Bench drop data:', dragData);
            
            if (dragData.isBenchPlayer) {
                // Reordering within bench - handled by the bench container
                console.log('Bench player reordering');
            } else {
                // Field player moving to bench
                console.log('Field player moving to bench');
                moveFieldPlayerToBench(dragData);
            }
        } catch (error) {
            console.error('Bench drop error:', error);
        }
        
        hideBenchDropZones();
    }
    
    // Remove existing listeners first
    if (benchArea._benchDragOverHandler) {
        benchArea.removeEventListener('dragover', benchArea._benchDragOverHandler);
    }
    if (benchArea._benchDropHandler) {
        benchArea.removeEventListener('drop', benchArea._benchDropHandler);
    }
    
    benchArea.addEventListener('dragover', handleBenchDragOver);
    benchArea.addEventListener('drop', handleBenchDrop);
    
    // Store event handlers for cleanup
    benchArea._benchDragOverHandler = handleBenchDragOver;
    benchArea._benchDropHandler = handleBenchDrop;
}

// Remove bench drop zone handlers
function removeBenchDropZone(benchArea) {
    if (benchArea._benchDragOverHandler) {
        benchArea.removeEventListener('dragover', benchArea._benchDragOverHandler);
        delete benchArea._benchDragOverHandler;
    }
    
    if (benchArea._benchDropHandler) {
        benchArea.removeEventListener('drop', benchArea._benchDropHandler);
        delete benchArea._benchDropHandler;
    }
}

// Show valid drop zones for a player position
function showDropZones(playerPosition) {
    console.log('Showing drop zones for position:', playerPosition);
    const allPositions = document.querySelectorAll('.player-position');
    console.log('Found positions:', allPositions.length);
    
    allPositions.forEach(position => {
        const positionId = position.id;
        const isValidDrop = isValidDropPosition(playerPosition, positionId);
        
        console.log(`Position ${positionId}: valid=${isValidDrop}`);
        
        position.classList.add('drop-zone');
        
        if (isValidDrop) {
            position.classList.add('valid-drop');
            setupDropZone(position);
        } else {
            position.classList.add('invalid-drop');
        }
    });
}

// Hide all drop zones
function hideDropZones() {
    const allPositions = document.querySelectorAll('.player-position');
    
    allPositions.forEach(position => {
        position.classList.remove('drop-zone', 'valid-drop', 'invalid-drop');
        removeDropZone(position);
    });
}

// Check if a position is valid for a player type
function isValidDropPosition(playerPosition, targetPositionId) {
    const positionRules = {
        'defender': ['position-2', 'position-3'],
        'midfielder': ['position-4', 'position-6'],
        'forward': ['position-5', 'position-7'],
        'goalkeeper': ['goalkeeper'] // Goalkeepers can only go to goalkeeper position
    };
    
    return positionRules[playerPosition]?.includes(targetPositionId) || false;
}

// Move field player to bench
function moveFieldPlayerToBench(dragData) {
    const selectedTeamId = document.getElementById('selected-team-lineup').value;
    if (!selectedTeamId) return;
    
    const team = teamsData.find(t => t.id === selectedTeamId);
    if (!team) return;
    
    const player = team.players.find(p => p.id === dragData.playerId);
    if (!player) return;
    
    // Set player as non-starter (move to bench)
    player.isStarter = false;
    
    // Clear the field position
    const sourceElement = document.getElementById(dragData.sourcePositionId);
    if (sourceElement) {
        sourceElement.style.display = 'none';
    }
    
    // Refresh the team lineup to update both field and bench
    updateTeamLineup();
    
    showToast(`${player.name} moved to bench`, 'success');
}

// Move bench player to field position
function moveBenchPlayerToField(dragData, targetPositionId) {
    const selectedTeamId = document.getElementById('selected-team-lineup').value;
    if (!selectedTeamId) return;
    
    const team = teamsData.find(t => t.id === selectedTeamId);
    if (!team) return;
    
    const benchPlayer = team.players.find(p => p.id === dragData.playerId);
    if (!benchPlayer) return;
    
    // Check if target position is occupied
    const targetElement = document.getElementById(targetPositionId);
    const targetPlayerIcon = targetElement?.querySelector('.player-icon');
    
    if (targetPlayerIcon && targetElement.style.display !== 'none') {
        // Position is occupied - swap the field player to bench
        const fieldPlayerId = targetPlayerIcon.dataset.playerId;
        const fieldPlayer = team.players.find(p => p.id === fieldPlayerId);
        
        if (fieldPlayer) {
            fieldPlayer.isStarter = false; // Move field player to bench
        }
    }
    
    // Move bench player to field
    benchPlayer.isStarter = true;
    
    // Refresh the team lineup
    updateTeamLineup();
    
    showToast(`${benchPlayer.name} moved to field`, 'success');
}

// Setup drop zone event handlers
function setupDropZone(positionElement) {
    console.log('Setting up drop zone for:', positionElement.id);
    
    function handleDragOver(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        console.log('Drag over:', positionElement.id);
    }
    
    function handleDrop(e) {
        e.preventDefault();
        console.log('Drop on:', positionElement.id);
        
        try {
            const dragData = JSON.parse(e.dataTransfer.getData('text/plain'));
            const targetPositionId = positionElement.id;
            
            console.log('Drop data:', dragData);
            console.log('Target position:', targetPositionId);
            
            if (isValidDropPosition(dragData.playerPosition, targetPositionId)) {
                console.log('Valid drop');
                
                if (dragData.isBenchPlayer) {
                    // Bench player moving to field
                    moveBenchPlayerToField(dragData, targetPositionId);
                } else {
                    // Field player moving to another field position
                    swapPlayers(dragData.sourcePositionId, targetPositionId);
                }
                
                showToast(`Player moved to ${getPositionDisplayName(targetPositionId)}`, 'success');
            } else {
                console.log('Invalid drop position');
            }
        } catch (error) {
            console.error('Drop error:', error);
        }
        
        hideDropZones();
    }
    
    // Remove existing listeners first
    if (positionElement._dragOverHandler) {
        positionElement.removeEventListener('dragover', positionElement._dragOverHandler);
    }
    if (positionElement._dropHandler) {
        positionElement.removeEventListener('drop', positionElement._dropHandler);
    }
    
    positionElement.addEventListener('dragover', handleDragOver);
    positionElement.addEventListener('drop', handleDrop);
    
    // Store event handlers for cleanup
    positionElement._dragOverHandler = handleDragOver;
    positionElement._dropHandler = handleDrop;
}

// Remove drop zone event handlers
function removeDropZone(positionElement) {
    if (positionElement._dragOverHandler) {
        positionElement.removeEventListener('dragover', positionElement._dragOverHandler);
        delete positionElement._dragOverHandler;
    }
    
    if (positionElement._dropHandler) {
        positionElement.removeEventListener('drop', positionElement._dropHandler);
        delete positionElement._dropHandler;
    }
}

// Swap players between positions
function swapPlayers(sourcePositionId, targetPositionId) {
    const selectedTeamId = document.getElementById('selected-team-lineup').value;
    if (!selectedTeamId) return;
    
    const team = teamsData.find(t => t.id === selectedTeamId);
    if (!team) return;
    
    const sourceElement = document.getElementById(sourcePositionId);
    const targetElement = document.getElementById(targetPositionId);
    
    if (!sourceElement || !targetElement) return;
    
    // Get current players
    const sourcePlayerIcon = sourceElement.querySelector('.player-icon');
    const targetPlayerIcon = targetElement.querySelector('.player-icon');
    
    if (!sourcePlayerIcon) return;
    
    const sourcePlayerId = sourcePlayerIcon.dataset.playerId;
    
    // Find the players in the team data
    const sourcePlayer = team.players.find(p => p.id === sourcePlayerId);
    
    if (sourcePlayer) {
        // If target position is empty, just move the player
        if (!targetPlayerIcon || targetElement.style.display === 'none') {
            // Clear source position
            sourceElement.style.display = 'none';
            
            // Show and update target position
            targetElement.style.display = 'block';
            updatePlayerIcon(targetPositionId, sourcePlayer);
        } else {
            // If target has a player, swap them
            const targetPlayerId = targetPlayerIcon.dataset.playerId;
            const targetPlayer = team.players.find(p => p.id === targetPlayerId);
            
            if (targetPlayer) {
                updatePlayerIcon(sourcePositionId, targetPlayer);
                updatePlayerIcon(targetPositionId, sourcePlayer);
            }
        }
    }
}

// Get display name for position
function getPositionDisplayName(positionId) {
    const positionNames = {
        'position-2': 'Left Defense',
        'position-3': 'Right Defense', 
        'position-4': 'Left Midfield',
        'position-6': 'Right Midfield',
        'position-5': 'Left Attack',
        'position-7': 'Right Attack',
        'goalkeeper': 'Goalkeeper'
    };
    
    return positionNames[positionId] || positionId;
}

// Debug function to test drag and drop setup
function testDragAndDrop() {
    console.log('=== TESTING DRAG AND DROP SETUP ===');
    
    const allPlayerIcons = document.querySelectorAll('.player-icon');
    console.log('Found player icons:', allPlayerIcons.length);
    
    allPlayerIcons.forEach((icon, index) => {
        console.log(`Player ${index + 1}:`);
        console.log('  - Draggable:', icon.draggable);
        console.log('  - Has dataset:', !!icon.dataset.playerId);
        console.log('  - Position:', icon.dataset.playerPosition);
        console.log('  - Current pos:', icon.dataset.currentPositionId);
        console.log('  - Classes:', icon.className);
    });
    
    const allPositions = document.querySelectorAll('.player-position');
    console.log('Found position elements:', allPositions.length);
    
    allPositions.forEach((pos, index) => {
        console.log(`Position ${index + 1}: ${pos.id} - Display: ${pos.style.display}`);
    });
}

// Update player name (for goalkeeper)
function updatePlayerName(elementId, player) {
    const nameElement = document.getElementById(elementId);
    if (nameElement) {
        nameElement.textContent = player.name;
    }
}

// Update bench players
function updateBenchPlayers(team) {
    const benchContainer = document.getElementById('bench-players');
    if (!benchContainer) return;
    
    const benchPlayers = team.players.filter(player => !player.isStarter);
    
    // Sort bench players: fit players first, injured players at the bottom
    benchPlayers.sort((a, b) => {
        if (a.status === 'injured' && b.status !== 'injured') return 1;
        if (a.status !== 'injured' && b.status === 'injured') return -1;
        return 0;
    });
    
    // Clear existing bench players
    benchContainer.innerHTML = '';
    
    // Add bench players
    benchPlayers.forEach(player => {
        const benchPlayerElement = createBenchPlayerElement(player);
        benchContainer.appendChild(benchPlayerElement);
    });
}

// Create bench player element
function createBenchPlayerElement(player) {
    const playerDiv = document.createElement('div');
    playerDiv.className = `bench-player ${player.status === 'injured' ? 'injured' : ''}`;
    
    const playerIcon = document.createElement('div');
    playerIcon.className = `bench-player-icon ${player.position}`;
    if (player.isCaptain) {
        playerIcon.classList.add('player-captain');
    }
    playerIcon.textContent = player.number;
    
    const playerInfo = document.createElement('div');
    playerInfo.className = 'bench-player-info';
    
    const playerName = document.createElement('div');
    playerName.className = 'bench-player-name';
    playerName.textContent = player.name;
    
    const playerPosition = document.createElement('div');
    playerPosition.className = 'bench-player-position';
    playerPosition.textContent = player.position;
    
    playerInfo.appendChild(playerName);
    playerInfo.appendChild(playerPosition);
    
    playerDiv.appendChild(playerIcon);
    playerDiv.appendChild(playerInfo);
    
    // Add drag-and-drop functionality for non-injured players
    if (player.status !== 'injured') {
        setupBenchPlayerDragAndDrop(playerDiv, playerIcon, player);
    } else {
        // Add disabled styling for injured players
        playerDiv.classList.add('drag-disabled');
    }
    
    // Add injury indicator if needed
    if (player.status === 'injured') {
        const injuryIndicator = document.createElement('div');
        injuryIndicator.className = 'injury-indicator';
        injuryIndicator.textContent = '🩹';
        injuryIndicator.title = player.injury || 'Injured';
        playerDiv.appendChild(injuryIndicator);
    }
    
    return playerDiv;
}

// TACTICS SYSTEM FOR TEAMS TAB
const ALL_TACTICS = [
    '0-0-4', '0-1-3', '0-2-2', '0-3-1', '0-4-0',
    '1-0-3', '1-1-2', '1-2-1', '1-3-0',
    '2-0-2', '2-1-1', '2-2-0',
    '3-0-1', '3-1-0',
    '4-0-0'
];

// Populate tactics selector based on current team
function populateTacticsSelector(selectedTeamId) {
    const selector = document.getElementById('selected-tactics');
    if (!selector) return;
    
    selector.innerHTML = '';
    
    // Get current team data
    const team = teamsData.find(t => t.id === selectedTeamId);
    const currentFormation = team ? team.formation : '2-1-1';
    
    // Add all tactics options
    ALL_TACTICS.forEach(tactic => {
        const option = document.createElement('option');
        option.value = tactic;
        option.textContent = formatTacticDisplay(tactic);
        if (tactic === currentFormation) {
            option.selected = true;
        }
        selector.appendChild(option);
    });
}

// Format tactic for display
function formatTacticDisplay(tactic) {
    const [defenders, midfielders, forwards] = tactic.split('-');
    return `${tactic} (${defenders}D-${midfielders}M-${forwards}F)`;
}

// Handle formation change
function updateFormation() {
    const selectedTeamId = document.getElementById('selected-team-lineup').value;
    const selectedTactic = document.getElementById('selected-tactics').value;
    
    if (!selectedTeamId || !selectedTactic) return;
    
    const team = teamsData.find(t => t.id === selectedTeamId);
    if (!team) return;
    
    console.log(`Updating formation to ${selectedTactic} for team ${team.name}`);
    
    // Update team formation temporarily (not saving to data)
    team.formation = selectedTactic;
    
    // Re-render the field with new formation
    updateFieldPlayers(team);
}

// Override the validateFutsalFormation to accept all tactics
function validateFutsalFormation(formation) {
    // Accept any formation from our tactics list
    if (ALL_TACTICS.includes(formation)) {
        return formation;
    }
    
    // Default formation if invalid
    return '2-1-1';
}

// Initialize teams tab when page loads
document.addEventListener('DOMContentLoaded', function() {
    // Load players data when page loads
    loadPlayersData();
});

// Statistics functionality
let selectedStatisticsGroupId = null;

function updateStatistics() {
    populateStatisticsControls();
    updateStatisticsForGroup();
}

function populateStatisticsControls() {
    populateStatisticsGroupSelector();
    populateTopScorersTeamSelector();
}

function populateStatisticsGroupSelector() {
    const groupSelect = document.getElementById('statistics-group-select');
    if (!groupSelect) return;
    
    groupSelect.innerHTML = '<option value="">All Groups</option>';
    
    groups.forEach(group => {
        const option = document.createElement('option');
        option.value = group.id;
        option.textContent = group.name;
        groupSelect.appendChild(option);
    });
    
    // Set default selection
    if (!selectedStatisticsGroupId && groups.length > 0) {
        selectedStatisticsGroupId = groups[0].id;
        groupSelect.value = selectedStatisticsGroupId;
    }
}

function populateTopScorersTeamSelector() {
    const teamSelect = document.getElementById('topscorers-team-select');
    if (!teamSelect) return;
    
    teamSelect.innerHTML = '';
    
    teams.forEach(team => {
        const option = document.createElement('option');
        option.value = team.id;
        option.textContent = team.name;
        teamSelect.appendChild(option);
    });
}

function updateStatisticsForGroup() {
    const groupSelect = document.getElementById('statistics-group-select');
    if (groupSelect) {
        selectedStatisticsGroupId = groupSelect.value || null;
    }
    
    updateTeamPerformanceAnalysis();
    updateStatisticalInsights();
    updateTopScorers();
}

function updateTeamPerformanceAnalysis() {
    const content = document.getElementById('team-performance-content');
    if (!content) return;
    
    // Get standings for the selected group or all groups
    let standings;
    if (selectedStatisticsGroupId) {
        const originalGroupId = selectedGroupId;
        selectedGroupId = selectedStatisticsGroupId;
        standings = calculateStandings();
        selectedGroupId = originalGroupId;
    } else {
        // Show analysis for all teams across all groups
        const allStandings = [];
        const originalGroupId = selectedGroupId;
        groups.forEach(group => {
            selectedGroupId = group.id;
            const groupStandings = calculateStandings();
            allStandings.push(...groupStandings);
        });
        selectedGroupId = originalGroupId;
        standings = allStandings;
    }
    
    const teamAnalysis = analyzeAllTeams(standings);
    content.innerHTML = generateTeamAnalysisHTML(teamAnalysis);
}

function updateStatisticalInsights() {
    const content = document.getElementById('statistical-insights-content');
    if (!content) return;
    
    // Get standings for the selected group or all groups
    let standings;
    if (selectedStatisticsGroupId) {
        const originalGroupId = selectedGroupId;
        selectedGroupId = selectedStatisticsGroupId;
        standings = calculateStandings();
        selectedGroupId = originalGroupId;
    } else {
        // Show insights for all teams across all groups
        const allStandings = [];
        const originalGroupId = selectedGroupId;
        groups.forEach(group => {
            selectedGroupId = group.id;
            const groupStandings = calculateStandings();
            allStandings.push(...groupStandings);
        });
        selectedGroupId = originalGroupId;
        standings = allStandings;
    }
    
    const teamAnalysis = analyzeAllTeams(standings);
    content.innerHTML = generateStatisticalInsightsHTML(standings, teamAnalysis);
}

function updateTopScorers() {
    const content = document.getElementById('topscorers-content');
    const filterSelect = document.getElementById('topscorers-filter');
    const teamSelector = document.getElementById('topscorers-team-selector');
    const teamSelect = document.getElementById('topscorers-team-select');
    
    if (!content || !filterSelect) return;
    
    const filterValue = filterSelect.value;
    
    // Show/hide team selector based on filter
    if (teamSelector) {
        teamSelector.style.display = filterValue === 'team' ? 'block' : 'none';
    }
    
    let topScorers = [];
    
    switch (filterValue) {
        case 'all':
            topScorers = getTopScorersAllGroups();
            break;
        case 'group':
            topScorers = getTopScorersForGroup(selectedStatisticsGroupId);
            break;
        case 'team':
            const selectedTeam = teamSelect ? teamSelect.value : null;
            topScorers = getTopScorersForTeam(selectedTeam);
            break;
    }
    
    content.innerHTML = generateTopScorersHTML(topScorers, filterValue);
}

function getTopScorersAllGroups() {
    const allGoals = [];
    
    goals.forEach(goal => {
        const goalCount = goal.totalGoals || 1;
        const existingPlayer = allGoals.find(g => g.playerId === goal.playerId);
        
        if (existingPlayer) {
            existingPlayer.totalGoals += goalCount;
        } else {
            allGoals.push({
                playerId: goal.playerId,
                playerName: goal.playerName,
                teamId: goal.teamId,
                teamName: teams.find(t => t.id === goal.teamId)?.name || 'Unknown Team',
                groupId: goal.groupId,
                groupName: groups.find(g => g.id === goal.groupId)?.name || 'Unknown Group',
                totalGoals: goalCount
            });
        }
    });
    
    return allGoals.sort((a, b) => b.totalGoals - a.totalGoals).slice(0, 20);
}

function getTopScorersForGroup(groupId) {
    if (!groupId) return getTopScorersAllGroups();
    
    const groupGoals = goals.filter(goal => goal.groupId === groupId);
    const playersMap = new Map();
    
    groupGoals.forEach(goal => {
        const goalCount = goal.totalGoals || 1;
        const playerId = goal.playerId;
        
        if (playersMap.has(playerId)) {
            playersMap.get(playerId).totalGoals += goalCount;
        } else {
            playersMap.set(playerId, {
                playerId: goal.playerId,
                playerName: goal.playerName,
                teamId: goal.teamId,
                teamName: teams.find(t => t.id === goal.teamId)?.name || 'Unknown Team',
                groupId: goal.groupId,
                groupName: groups.find(g => g.id === goal.groupId)?.name || 'Unknown Group',
                totalGoals: goalCount
            });
        }
    });
    
    return Array.from(playersMap.values()).sort((a, b) => b.totalGoals - a.totalGoals);
}

function getTopScorersForTeam(teamId) {
    if (!teamId) return [];
    
    const teamGoals = goals.filter(goal => goal.teamId === teamId);
    const playersMap = new Map();
    
    teamGoals.forEach(goal => {
        const goalCount = goal.totalGoals || 1;
        const playerId = goal.playerId;
        
        if (playersMap.has(playerId)) {
            playersMap.get(playerId).totalGoals += goalCount;
        } else {
            playersMap.set(playerId, {
                playerId: goal.playerId,
                playerName: goal.playerName,
                teamId: goal.teamId,
                teamName: teams.find(t => t.id === goal.teamId)?.name || 'Unknown Team',
                groupId: goal.groupId,
                groupName: groups.find(g => g.id === goal.groupId)?.name || 'Unknown Group',
                totalGoals: goalCount
            });
        }
    });
    
    return Array.from(playersMap.values()).sort((a, b) => b.totalGoals - a.totalGoals);
}

function generateTopScorersHTML(topScorers, filterType) {
    if (!topScorers || topScorers.length === 0) {
        return '<p class="no-data">No goal scorers found.</p>';
    }
    
    let title = 'Top Scorers';
    switch (filterType) {
        case 'all':
            title = 'Top Scorers - All Groups';
            break;
        case 'group':
            const groupName = groups.find(g => g.id === selectedStatisticsGroupId)?.name || 'Selected Group';
            title = `Top Scorers - ${groupName}`;
            break;
        case 'team':
            const teamSelect = document.getElementById('topscorers-team-select');
            const teamId = teamSelect ? teamSelect.value : null;
            const teamName = teams.find(t => t.id === teamId)?.name || 'Selected Team';
            title = `Top Scorers - ${teamName}`;
            break;
    }
    
    return `
        <h4>${title}</h4>
        <div class="topscorers-list">
            ${topScorers.map((scorer, index) => `
                <div class="topscorer-card ${index < 3 ? 'top-3' : ''}">
                    <div class="scorer-position">${index + 1}</div>
                    <div class="scorer-info">
                        <div class="scorer-name">${scorer.playerName}</div>
                        <div class="scorer-team">${scorer.teamName}</div>
                        ${filterType !== 'group' && filterType !== 'team' ? `<div class="scorer-group">${scorer.groupName}</div>` : ''}
                    </div>
                    <div class="scorer-goals">
                        <span class="goals-count">${scorer.totalGoals}</span>
                        <span class="goals-label">goal${scorer.totalGoals !== 1 ? 's' : ''}</span>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

// Sub-tab functionality for Standings
function showStandingsSubTab(tabId) {
    // Hide all sub-tab contents
    const subTabContents = document.querySelectorAll('.sub-tab-content');
    subTabContents.forEach(content => {
        content.classList.remove('active');
    });
    
    // Remove active class from all sub-tab buttons
    const subTabButtons = document.querySelectorAll('.sub-tab-button');
    subTabButtons.forEach(button => {
        button.classList.remove('active');
    });
    
    // Show selected sub-tab content
    const selectedContent = document.getElementById(tabId);
    if (selectedContent) {
        selectedContent.classList.add('active');
    }
    
    // Add active class to clicked button
    const clickedButton = event.target;
    clickedButton.classList.add('active');
    
    // Update content based on sub-tab
    if (tabId === 'knockout-stage') {
        updateKnockoutStage();
    } else if (tabId === 'statistics') {
        updateStatistics();
    }
}

// Function to get the winner of each group
function getGroupWinner(groupId) {
    // Save current group selection
    const originalGroupId = selectedGroupId;
    
    // Temporarily change to the target group
    selectedGroupId = groupId;
    
    // Calculate standings for this group
    const standings = calculateStandings();
    
    // Get the winner (first place team)
    const winner = standings.length > 0 ? standings[0] : null;
    
    // Restore original group selection
    selectedGroupId = originalGroupId;
    
    return winner;
}

// Function to update the knockout stage with current group winners
function updateKnockoutStage() {
    console.log('DEBUG: Updating knockout stage');
    
    // Get winners for each group
    const groupAWinner = getGroupWinner('group-a');
    const groupBWinner = getGroupWinner('group-b');
    const groupCWinner = getGroupWinner('group-c');
    const groupDWinner = getGroupWinner('group-d');
    
    console.log('DEBUG: Group winners:', {
        'Group A': groupAWinner?.name,
        'Group B': groupBWinner?.name,
        'Group C': groupCWinner?.name,
        'Group D': groupDWinner?.name
    });
    
    // Update Semi-Final 1 (Group A vs Group D)
    const groupABox = document.getElementById('group-a-winner');
    const groupDBox = document.getElementById('group-d-winner');
    
    if (groupABox && groupAWinner) {
        groupABox.querySelector('.team-name').textContent = groupAWinner.name;
        groupABox.title = `${groupAWinner.fullName || groupAWinner.name} - ${groupAWinner.points} points`;
    }
    
    if (groupDBox && groupDWinner) {
        groupDBox.querySelector('.team-name').textContent = groupDWinner.name;
        groupDBox.title = `${groupDWinner.fullName || groupDWinner.name} - ${groupDWinner.points} points`;
    }
    
    // Update Semi-Final 2 (Group B vs Group C)
    const groupBBox = document.getElementById('group-b-winner');
    const groupCBox = document.getElementById('group-c-winner');
    
    if (groupBBox && groupBWinner) {
        groupBBox.querySelector('.team-name').textContent = groupBWinner.name;
        groupBBox.title = `${groupBWinner.fullName || groupBWinner.name} - ${groupBWinner.points} points`;
    }
    
    if (groupCBox && groupCWinner) {
        groupCBox.querySelector('.team-name').textContent = groupCWinner.name;
        groupCBox.title = `${groupCWinner.fullName || groupCWinner.name} - ${groupCWinner.points} points`;
    }
}