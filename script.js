// Global variables to store data
let groups = [];
let teams = [];
let fixtures = [];
let results = [];
let knockoutResults = {};
let goals = [];
let defaults = {}; // Add defaults configuration
let selectedGroupId = null;

// Forecast-specific variables
let selectedForecastGroupId = null;

// Configuration loaded from config.json
let config = null;

// Local storage keys
const STORAGE_KEYS = {
    teamFormations: 'frs_team_formations',
    teamStarters: 'frs_team_starters'
};

function loadPersistedTeamState() {
    try {
        const formationsRaw = localStorage.getItem(STORAGE_KEYS.teamFormations);
        const startersRaw = localStorage.getItem(STORAGE_KEYS.teamStarters);
        const formations = formationsRaw ? JSON.parse(formationsRaw) : {};
        const starters = startersRaw ? JSON.parse(startersRaw) : {};
        // Apply to teamsData if already loaded
        if (Array.isArray(teamsData)) {
            teamsData.forEach(team => {
                if (formations[team.id]) {
                    team.formation = formations[team.id];
                }
                if (starters[team.id]) {
                    const starterSet = new Set(starters[team.id]);
                    team.players.forEach(p => {
                        p.isStarter = starterSet.has(p.id);
                    });
                }
            });
        }
    } catch (e) { logger.warn('Failed to load persisted team state', e); }
}

function persistTeamState() {
    try {
        if (!Array.isArray(teamsData)) return;
        const formations = {};
        const starters = {};
        teamsData.forEach(team => {
            formations[team.id] = team.formation;
            starters[team.id] = team.players.filter(p => p.isStarter).map(p => p.id);
        });
        localStorage.setItem(STORAGE_KEYS.teamFormations, JSON.stringify(formations));
        localStorage.setItem(STORAGE_KEYS.teamStarters, JSON.stringify(starters));
    } catch (e) { logger.warn('Failed to persist team state', e); }
}

// Centralized logging system that respects debug mode setting
const logger = {
    log: (...args) => {
        if (config?.ui?.enableDebugMode) {
            console.log(...args);
        }
    },
    warn: (...args) => {
        if (config?.ui?.enableDebugMode) {
            console.warn(...args);
        }
    },
    error: (...args) => {
        // Always show errors regardless of debug mode
        console.error(...args);
        
        // Show toast notification for errors
        handleError(args[0]);
    },
    info: (...args) => {
        if (config?.ui?.enableDebugMode) {
            console.info(...args);
        }
    },
    debug: (...args) => {
        if (config?.ui?.enableDebugMode) {
            console.debug(...args);
        }
    }
};

// Error handling with toast notifications
function handleError(error) {
    let message;
    let type = 'error';
    
    if (typeof error === 'string') {
        // Business logic errors or custom messages
        if (error.includes('not found') || error.includes('missing') || error.includes('required')) {
            message = error; // Show specific business error
        } else if (error.includes('TypeError') || error.includes('not iterable') || error.includes('undefined')) {
            message = 'A technical issue occurred. Please refresh the page and try again.';
        } else {
            message = error; // Show the error as-is for other cases
        }
    } else if (error instanceof Error) {
        // Technical errors
        if (error.name === 'TypeError' || error.name === 'ReferenceError' || error.name === 'SyntaxError') {
            message = 'A technical issue occurred. Please refresh the page and try again.';
        } else {
            message = error.message || 'An unexpected error occurred.';
        }
    } else {
        message = 'An unexpected error occurred.';
    }
    
    // Show toast notification
    showToast(message, type, 5000); // Show for 5 seconds for errors
}

// Enhanced error wrapper for async functions
function withErrorHandling(fn) {
    return async function(...args) {
        try {
            return await fn.apply(this, args);
        } catch (error) {
            logger.error('Function error:', error);
            throw error; // Re-throw so caller can handle if needed
        }
    };
}

// OpenRouter API configuration (formerly OpenAI)
const OPENAI_CONFIG = {
    apiKey: null, // API key will be loaded from .env file
    baseURL: 'https://openrouter.ai/api/v1',
    model: 'openai/gpt-4o', //'openai/gpt-4o'
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
        const response = await fetch('app-config.json');
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const config = await response.json();
        const apiKey = config.OPENAI_API_KEY;
        
        if (apiKey && apiKey !== 'your-api-key-here' && apiKey.trim()) {
            OPENAI_CONFIG.apiKey = apiKey.trim();
            initializeOpenAI(OPENAI_CONFIG.apiKey);
            logger.log('✅ OpenRouter API key loaded from config.json');
            return;
        } else {
            logger.warn('⚠️ No valid OpenRouter API key found in config.json');
        }
    } catch (error) {
        logger.warn('⚠️ Could not load config.json:', error.message);
        logger.info('💡 Create a config.json file with: {"OPENAI_API_KEY": "your-openrouter-key-here"}');
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
                    logger.log('✅ OpenRouter API key loaded from .env file');
                    return;
                }
            }
        }
        logger.warn('⚠️ No valid OpenRouter API key found in .env file');
    } catch (error) {
        // Don't log .env errors since it's expected to fail often
        logger.debug('.env file not accessible via HTTP (this is normal)');
    }
}

// Initialize OpenAI client
function initializeOpenAI(apiKey) {
    if (!apiKey) {
        logger.warn('⚠️ No API key provided for OpenRouter initialization');
        return;
    }
    
    try {
        OPENAI_CONFIG.apiKey = apiKey;
        logger.log('✅ OpenRouter client initialized successfully');
    } catch (error) {
        logger.error('❌ Failed to initialize OpenRouter client:', error);
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
        logger.log('🔄 Initializing OpenRouter system...');
        
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
            logger.log('✅ OpenRouter system fully initialized');
        } else {
            showToast('⚠️ OpenRouter Engine unavailable - Using standard analysis', 'warning', 5000);
            logger.log('⚠️ OpenRouter system initialization incomplete - no API key');
        }
        
    } catch (error) {
        showToast('❌ OpenRouter Engine failed to initialize - Using standard analysis', 'error', 5000);
        logger.error('❌ OpenRouter system initialization failed:', error);
    }
}

// Load data when page loads
document.addEventListener('DOMContentLoaded', async function() {
    logger.log('Using default OpenAI configuration:', {
        useOpenAI: false, // Will be loaded from config.json
        maxTokens: OPENAI_CONFIG.maxTokens,
        retryAttempts: OPENAI_CONFIG.retryAttempts,
        model: OPENAI_CONFIG.model
    });
    
    // Load data first (non-blocking)
    await loadData();

    // Load any pending results from session storage (mobile)
    loadPendingResults();

    showTab('overview');

    // Initialize OpenRouter only if enabled
    if (config?.simulation?.useOpenAI) {
        initializeOpenRouterSystem();
    } else {
        logger.log('ℹ️ OpenRouter feature disabled, skipping initialization');
    }

    // Settings modal logic
    const settingsToggle = document.getElementById('settings-toggle');
    if (settingsToggle) {
        settingsToggle.addEventListener('click', showConfigModal);
    }
});

// Show config modal and blur main page
function showConfigModal() {
    const modal = document.getElementById('configModal');
    if (modal) {
        modal.style.display = 'flex';
        document.body.classList.add('config-modal-open');
        renderConfigCategories();
        renderConfigFieldsPanel(selectedConfigCategory || 'General');
    }
}

// Hide config modal and unblur main page
function hideConfigModal() {
    const modal = document.getElementById('configModal');
    if (modal) {
        modal.style.display = 'none';
        document.body.classList.remove('config-modal-open');
    }
}

// Render config fields in modal (to be implemented)
// Google-style config modal logic
let selectedConfigCategory = 'General';

const configCategoryLabels = {
    General: 'General',
    featureToggles: 'Feature Toggles',
    groupPhase: 'Group Phase',
    knockout: 'Knockout',
    simulation: 'Simulation',
    venues: 'Venues',
    admin: 'Admin'
};

const categories = [
    'General',
    'featureToggles',
    'groupPhase',
    'knockout',
    'simulation',
    'venues',
    'admin'
];

function renderConfigCategories() {
    const panel = document.getElementById('config-categories-panel');
    if (!panel || !config) return;
    panel.innerHTML = '';

    categories.forEach(cat => {
        const btn = document.createElement('button');
        btn.className = 'config-category-item' + (selectedConfigCategory === cat ? ' active' : '');
        btn.textContent = configCategoryLabels[cat] || cat;
        btn.onclick = () => {
            selectedConfigCategory = cat;
            renderConfigCategories();
            renderConfigFieldsPanel(cat);
        };
        panel.appendChild(btn);
    });
}

function renderConfigFieldsPanel(category) {
    const panel = document.getElementById('config-fields-panel');
    if (!panel || !config) return;
    panel.innerHTML = '';
    let fields = {};
    let title = configCategoryLabels[category] || category;
    if (category === 'General') {
        // Only show top-level primitives
        for (const key in config) {
            if (typeof config[key] !== 'object' || config[key] === null || Array.isArray(config[key])) {
                fields[key] = config[key];
            }
        }
    } else if (category === 'featureToggles') {
        renderFeatureTogglesPanel(panel);
        return;
    } else if (category === 'venues') {
        // Venues editor (group and knockout)
        renderVenuesEditor(panel);
        return;
    } else {
        fields = config[category] || {};
    }
    const heading = document.createElement('h1');
    heading.textContent = title;
    panel.appendChild(heading);
    const list = document.createElement('div');
    list.className = 'config-fields-list';
    for (const key in fields) {
        const fieldRow = document.createElement('div');
        fieldRow.className = 'config-field-row';
        const label = document.createElement('label');
        label.textContent = getUserFriendlyLabel(key, category);
        label.htmlFor = `config-${category}-${key}`;
        fieldRow.appendChild(label);
        fieldRow.appendChild(createConfigInput(category, key, fields[key]));
        list.appendChild(fieldRow);
    }
    panel.appendChild(list);
}

function renderFeatureTogglesPanel(panel) {
    panel.innerHTML = '';
    const heading = document.createElement('h1');
    heading.textContent = 'Feature Toggles';
    heading.style.marginBottom = '24px';
    panel.appendChild(heading);

    // Tabs Visibility
    const tabsSection = document.createElement('div');
    tabsSection.className = 'feature-toggles-tabs-section';
    const tabsTitle = document.createElement('h2');
    tabsTitle.textContent = 'Tabs Visibility';
    tabsSection.appendChild(tabsTitle);

    const tabs = config.featureToggles.tabs;
    const subTabs = config.featureToggles.subTabs;
    for (const tab in tabs) {
        const tabRow = document.createElement('div');
        tabRow.className = 'feature-toggle-tab-row';
        const tabCheckbox = document.createElement('input');
        tabCheckbox.type = 'checkbox';
        tabCheckbox.checked = tabs[tab];
        tabCheckbox.id = `feature-toggle-tab-${tab}`;
        tabCheckbox.dataset.tab = tab;
        tabCheckbox.onchange = (e) => {
            tabs[tab] = e.target.checked;
            renderFeatureTogglesPanel(panel);
            updateConfigSaveButton();
        };
        const tabLabel = document.createElement('label');
        tabLabel.textContent = tab.charAt(0).toUpperCase() + tab.slice(1);
        tabLabel.htmlFor = tabCheckbox.id;
        tabRow.appendChild(tabCheckbox);
        tabRow.appendChild(tabLabel);

        // Sub-tabs toggles (expand if tab enabled and subTabs exist)
        if (tabs[tab] && subTabs[tab]) {
            const subTabSection = document.createElement('div');
            subTabSection.className = 'feature-toggle-subtabs-section';
            subTabSection.style.marginLeft = '32px';
            subTabSection.style.marginTop = '6px';
            subTabSection.style.marginBottom = '10px';
            subTabSection.style.borderLeft = '2px solid #e0e0e0';
            subTabSection.style.paddingLeft = '16px';
            for (const subTab in subTabs[tab]) {
                if (subTab === 'enabled') continue;
                const subTabRow = document.createElement('div');
                subTabRow.className = 'feature-toggle-subtab-row';
                subTabRow.style.display = 'flex';
                subTabRow.style.alignItems = 'center';
                subTabRow.style.gap = '8px';
                const subTabCheckbox = document.createElement('input');
                subTabCheckbox.type = 'checkbox';
                subTabCheckbox.checked = subTabs[tab][subTab];
                subTabCheckbox.id = `feature-toggle-subtab-${tab}-${subTab}`;
                subTabCheckbox.dataset.tab = tab;
                subTabCheckbox.dataset.subtab = subTab;
                subTabCheckbox.onchange = (e) => {
                    subTabs[tab][subTab] = e.target.checked;
                    updateConfigSaveButton();
                };
                const subTabLabel = document.createElement('label');
                subTabLabel.textContent = subTab.charAt(0).toUpperCase() + subTab.slice(1);
                subTabLabel.htmlFor = subTabCheckbox.id;
                subTabRow.appendChild(subTabCheckbox);
                subTabRow.appendChild(subTabLabel);
                subTabSection.appendChild(subTabRow);
            }
            tabRow.appendChild(subTabSection);
        }
        tabsSection.appendChild(tabRow);
    }
    panel.appendChild(tabsSection);

    // UI Toggles
    const uiSection = document.createElement('div');
    uiSection.className = 'feature-toggles-ui-section';
    const uiTitle = document.createElement('h2');
    uiTitle.textContent = 'UI';
    uiSection.appendChild(uiTitle);
    const ui = config.featureToggles.ui;
    for (const key in ui) {
        const uiRow = document.createElement('div');
        uiRow.className = 'feature-toggle-ui-row';
        const uiCheckbox = document.createElement('input');
        uiCheckbox.type = 'checkbox';
        uiCheckbox.checked = ui[key];
        uiCheckbox.id = `feature-toggle-ui-${key}`;
        uiCheckbox.dataset.key = key;
        uiCheckbox.onchange = (e) => {
            ui[key] = e.target.checked;
            updateConfigSaveButton();
        };
        const uiLabel = document.createElement('label');
        uiLabel.textContent = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
        uiLabel.htmlFor = uiCheckbox.id;
        uiRow.appendChild(uiCheckbox);
        uiRow.appendChild(uiLabel);
        uiSection.appendChild(uiRow);
    }
    panel.appendChild(uiSection);
}

function getUserFriendlyLabel(key, category) {
    // Map technical keys to user-friendly labels
    const labels = {
        tabVisibility: 'Tabs Visibility',
        subTabs: 'Sub Tabs',
        defaultGroup: 'Default Group',
        defaultTeam: 'Default Team',
        startDate: 'Start Date',
        endDate: 'End Date',
        dateTimeFormatted: 'Date Range',
        venues: 'Venues',
        role: 'Role',
        validateTime: 'Validate Time',
        useOpenAI: 'Use OpenAI',
        pointsGapLimit: 'Points Gap Limit',
        maxScenarios: 'Max Scenarios',
        showLoadingMask: 'Show Loading Mask',
        enableDebugMode: 'Enable Debug Mode',
        enableDarkMode: 'Enable Dark Mode',
        title: 'Title',
        date: 'Date',
        startTime: 'Start Time',
        description: 'Description',
        name: 'Name',
        googleMapsUrl: 'Google Maps URL',
        leagueStandings: 'League Standings',
        knockoutStage: 'Knockout Stage',
        statistics: 'Statistics',
        enabled: 'Enabled'
    };
    if (category === 'subTabs' && key === 'overview') return 'Overview Tabs';
    return labels[key] || key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

function createConfigInput(category, key, value) {
    // Special controls for certain fields
    if (key === 'defaultGroup') {
        return createGroupDropdown(value);
    }
    if (key === 'defaultTeam') {
        return createTeamDropdown(value);
    }
    if (key.toLowerCase().includes('date')) {
        return createDatePicker(value);
    }
    if (typeof value === 'boolean') {
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = value;
        input.className = 'config-input';
        input.onchange = onConfigInputChange;
        input.dataset.path = `${category}.${key}`;
        return input;
    }
    if (typeof value === 'number') {
        const input = document.createElement('input');
        input.type = 'number';
        input.value = value;
        input.className = 'config-input';
        input.oninput = onConfigInputChange;
        input.dataset.path = `${category}.${key}`;
        return input;
    }
    if (typeof value === 'string') {
        const input = document.createElement('input');
        input.type = 'text';
        input.value = value;
        input.className = 'config-input';
        input.oninput = onConfigInputChange;
        input.dataset.path = `${category}.${key}`;
        return input;
    }
    // For objects, show as disabled JSON
    const input = document.createElement('input');
    input.type = 'text';
    input.value = JSON.stringify(value);
    input.className = 'config-input';
    input.disabled = true;
    return input;
}

function createGroupDropdown(selected) {
    const select = document.createElement('select');
    select.className = 'config-input';
    select.dataset.path = 'General.defaultGroup';
    // Use global groups if available, fallback to loaded groups
    const groupList = (typeof groups !== 'undefined' && Array.isArray(groups) && groups.length) ? groups : (window.groups || []);
    groupList.forEach(g => {
        const option = document.createElement('option');
        option.value = g.id;
        option.textContent = g.name || g.id;
        if (g.id === selected) option.selected = true;
        select.appendChild(option);
    });
    select.onchange = onConfigInputChange;
    return select;
}

function createTeamDropdown(selected) {
    const select = document.createElement('select');
    select.className = 'config-input';
    select.dataset.path = 'General.defaultTeam';
    // Use global groups/teams if available, fallback to loaded groups/teams
    const groupList = (typeof groups !== 'undefined' && Array.isArray(groups) && groups.length) ? groups : (window.groups || []);
    const teamList = (typeof teams !== 'undefined' && Array.isArray(teams) && teams.length) ? teams : (window.teams || []);
    groupList.forEach(g => {
        const optgroup = document.createElement('optgroup');
        optgroup.label = g.name || g.id;
        teamList.filter(t => t.groupId === g.id).forEach(team => {
            const option = document.createElement('option');
            option.value = team.id;
            option.textContent = team.name;
            if (team.id === selected) option.selected = true;
            optgroup.appendChild(option);
        });
        select.appendChild(optgroup);
    });
    select.onchange = onConfigInputChange;
    return select;
}

function createDatePicker(value) {
    const input = document.createElement('input');
    input.type = 'date';
    input.value = value && value.length >= 10 ? value.substring(0, 10) : '';
    input.className = 'config-input';
    input.oninput = onConfigInputChange;
    input.dataset.path = 'General.' + value;
    return input;
}

function renderVenuesEditor(panel) {
    // Render venues for group and knockout games, allow add/edit
    const heading = document.createElement('h1');
    heading.textContent = 'Venues';
    heading.style.marginBottom = '24px';
    panel.appendChild(heading);

    // Group phase venues
    const groupVenues = (config.groupPhase && config.groupPhase.venues) || {};
    const groupVenueList = document.createElement('div');
    groupVenueList.className = 'venues-list';
    groupVenueList.innerHTML = '<h3>Group Phase Venues</h3>';
    Object.entries(groupVenues).forEach(([groupId, venue]) => {
        const group = groups.find(g => g.id === groupId);
        const groupName = group ? group.name : groupId;
        const venueDiv = document.createElement('div');
        venueDiv.className = 'venue-row';
        venueDiv.style.marginBottom = '20px';

        // Group name on its own line
        const groupNameDiv = document.createElement('div');
        groupNameDiv.className = 'venue-group-name';
        groupNameDiv.textContent = groupName;
        groupNameDiv.style.fontWeight = 'bold';
        groupNameDiv.style.marginBottom = '6px';
        venueDiv.appendChild(groupNameDiv);

        // Venue name field
        const nameRow = document.createElement('div');
        nameRow.style.display = 'flex';
        nameRow.style.gap = '12px';
        nameRow.style.alignItems = 'center';
        // Venue name
        const nameLabel = document.createElement('label');
        nameLabel.textContent = 'Name:';
        nameLabel.htmlFor = `venue-name-${groupId}`;
        nameLabel.style.marginRight = '4px';
        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.value = venue.name || '';
        nameInput.className = 'config-input venue-name-input';
        nameInput.id = `venue-name-${groupId}`;
        nameInput.dataset.path = `groupPhase.venues.${groupId}.name`;
        nameInput.oninput = onConfigInputChange;
        nameRow.appendChild(nameLabel);
        nameRow.appendChild(nameInput);
        venueDiv.appendChild(nameRow);

        // Add a break line between name and Google Maps
        venueDiv.appendChild(document.createElement('br'));

        // Google Maps label/fields row
        const fieldsRow = document.createElement('div');
        fieldsRow.style.display = 'flex';
        fieldsRow.style.gap = '12px';
        fieldsRow.style.alignItems = 'center';
        // Google Maps URL
        const urlLabel = document.createElement('label');
        urlLabel.textContent = 'Google Maps:';
        urlLabel.htmlFor = `venue-url-${groupId}`;
        urlLabel.style.marginLeft = '0px';
        urlLabel.style.marginRight = '4px';
        const urlInput = document.createElement('input');
        urlInput.type = 'text';
        urlInput.value = venue.googleMapsUrl || '';
        urlInput.className = 'config-input venue-url-input';
        urlInput.id = `venue-url-${groupId}`;
        urlInput.dataset.path = `groupPhase.venues.${groupId}.googleMapsUrl`;
        urlInput.oninput = onConfigInputChange;
        // Google Maps link/button
        const mapBtn = document.createElement('a');
        mapBtn.href = venue.googleMapsUrl || '#';
        mapBtn.target = '_blank';
        mapBtn.className = 'venue-map-link-btn';
        mapBtn.textContent = 'Open Map';
        fieldsRow.appendChild(urlLabel);
        fieldsRow.appendChild(urlInput);
        fieldsRow.appendChild(mapBtn);
        venueDiv.appendChild(fieldsRow);
        groupVenueList.appendChild(venueDiv);
    });
    panel.appendChild(groupVenueList);

    // Knockout venue
    const knockoutVenue = (config.knockout && config.knockout.venue) || null;
    if (knockoutVenue) {
        const knockoutDiv = document.createElement('div');
        knockoutDiv.className = 'venue-row';
        knockoutDiv.style.marginBottom = '20px';

        // Knockout label on its own line
        const knockoutLabelDiv = document.createElement('div');
        knockoutLabelDiv.className = 'venue-group-name';
        knockoutLabelDiv.textContent = 'Knockout';
        knockoutLabelDiv.style.fontWeight = 'bold';
        knockoutLabelDiv.style.marginBottom = '6px';
        knockoutDiv.appendChild(knockoutLabelDiv);

        // Name and Google Maps label/fields on next line
        const fieldsRow = document.createElement('div');
        fieldsRow.style.display = 'flex';
        fieldsRow.style.gap = '12px';
        fieldsRow.style.alignItems = 'center';

        // Venue name
        const nameLabel = document.createElement('label');
        nameLabel.textContent = 'Name:';
        nameLabel.htmlFor = `venue-name-knockout`;
        nameLabel.style.marginRight = '4px';
        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.value = knockoutVenue.name || '';
        nameInput.className = 'config-input venue-name-input';
        nameInput.id = `venue-name-knockout`;
        nameInput.dataset.path = `knockout.venue.name`;
        nameInput.oninput = onConfigInputChange;

        // Google Maps URL
        const urlLabel = document.createElement('label');
        urlLabel.textContent = 'Google Maps:';
        urlLabel.htmlFor = `venue-url-knockout`;
        urlLabel.style.marginLeft = '12px';
        urlLabel.style.marginRight = '4px';
        const urlInput = document.createElement('input');
        urlInput.type = 'text';
        urlInput.value = knockoutVenue.googleMapsUrl || '';
        urlInput.className = 'config-input venue-url-input';
        urlInput.id = `venue-url-knockout`;
        urlInput.dataset.path = `knockout.venue.googleMapsUrl`;
        urlInput.oninput = onConfigInputChange;

        // Google Maps link/button
        const mapBtn = document.createElement('a');
        mapBtn.href = knockoutVenue.googleMapsUrl || '#';
        mapBtn.target = '_blank';
        mapBtn.className = 'venue-map-link-btn';
        mapBtn.textContent = 'Open Map';

        fieldsRow.appendChild(nameLabel);
        fieldsRow.appendChild(nameInput);
        fieldsRow.appendChild(urlLabel);
        fieldsRow.appendChild(urlInput);
        fieldsRow.appendChild(mapBtn);
        knockoutDiv.appendChild(fieldsRow);
        panel.appendChild(knockoutDiv);
    }
}

// Track config changes
let configEdits = {};
function onConfigInputChange(e) {
    const input = e.target;
    const path = input.dataset.path;
    let value;
    if (input.type === 'checkbox') {
        value = input.checked;
    } else if (input.type === 'number') {
        value = input.value === '' ? null : Number(input.value);
    } else {
        value = input.value;
    }
    configEdits[path] = value;
    updateConfigSaveButton();
}

function updateConfigSaveButton() {
    const btn = document.getElementById('config-save-btn');
    if (!btn) return;
    // Enable if any edits differ from config
    let changed = false;
    for (const path in configEdits) {
        const keys = path.split('.');
        let ref = config;
        for (let i = 0; i < keys.length - 1; i++) {
            ref = ref[keys[i]];
        }
        const orig = ref[keys[keys.length - 1]];
        if (configEdits[path] !== orig) {
            changed = true;
            break;
        }
    }
    btn.disabled = !changed;
}

// Save config changes (to be implemented)
function saveConfig() {
    // TODO: Validate and save config changes to data/config.json
}

// Load JSON data
async function loadData() {
    try {
        const [configResponse, groupsResponse, teamsResponse, fixturesResponse, groupPhaseResultsResponse, goalsResponse, knockoutResponse] = await Promise.all([
            fetch('data/config.json'),
            fetch('data/groups.json'),
            fetch('data/teams.json'),
            fetch('data/fixtures.json'),
            fetch('data/group-phase-results.json'),
            fetch('data/goals.json'),
            fetch('data/knockout-results.json')
        ]);
        
        defaults = await configResponse.json();
        config = defaults; // Store config for feature toggles
        groups = await groupsResponse.json();
        teams = await teamsResponse.json();
        fixtures = await fixturesResponse.json();
        results = await groupPhaseResultsResponse.json();
        goals = await goalsResponse.json();
        knockoutResults = await knockoutResponse.json();
        
        // Set default group based on config.json
        selectedGroupId = defaults.defaultGroup || (groups.length > 0 ? groups[0].id : null);
        
        logger.log('Data loaded successfully');
        
        // Apply tab visibility settings
        applyTabVisibilitySettings();
        
        populateGroupSelector();
        updateTeamSelectorForGroup();
        updateAllTabs();
        
        // Initialize knockout dates
        initializeKnockoutDates();
        
        // Load team player data for Teams tab
        await loadPlayersData();
        
        // Initialize dark mode after config is loaded
        initializeDarkMode();
    } catch (error) {
        logger.error('Error loading data:', error);
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
    try {
        const groupSelect = document.getElementById('selected-group');
        if (groupSelect) {
            selectedGroupId = groupSelect.value;
            updateOverview();
            updateTeamSelectorForGroup(); // Update simulator team options
        }
    } catch (error) {
        logger.error('Error updating standings for group:', error);
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
            optgroup.label = `${group.name} - ${group.description}`;
            
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
        if (goal.goalType === 'own-goal') return; // Exclude own goals from top scorers
        if (teamStats[goal.teamId]) {
            // Use totalGoals if available, otherwise count as 1
            const goalCount = goal.totalGoals || 1;
            teamStats[goal.teamId].totalGoals += goalCount;
            
            if (!teamStats[goal.teamId].players[goal.playerId]) {
                teamStats[goal.teamId].players[goal.playerId] = {
                    playerName: getPlayerNameById(goal.playerId),
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
    tooltip.style.maxWidth = '320px';
    tooltip.style.whiteSpace = 'normal';
    
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
    const tabContent = document.getElementById(tabName);
    if (tabContent) {
        tabContent.classList.add('active');
    }

    // Add active class to clicked button
    const activeButton = document.querySelector(`[onclick="showTab('${tabName}')"]`);
    if (activeButton) {
        activeButton.classList.add('active');
    }

    // Update content based on tab
    switch(tabName) {
        case 'overview':
            updateOverview();
            break;
        case 'fixtures':
            updateFixtures();
            break;
        case 'forecast':
            updateForecast();
            break;
        case 'simulator':
            updateSimulation();
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
        'overview': { button: 'button[onclick="showTab(\'overview\')"]', content: '#overview' },
        'teams': { button: 'button[onclick="showTab(\'teams\')"]', content: '#teams' },
        'fixtures': { button: 'button[onclick="showTab(\'fixtures\')"]', content: '#fixtures' },
        'simulator': { button: 'button[onclick="showTab(\'simulator\')"]', content: '#simulator' },
        'forecast': { button: 'button[onclick="showTab(\'forecast\')"]', content: '#forecast' }
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
    if (defaults.subTabs && defaults.subTabs.overview) {
        const subTabConfig = defaults.subTabs.overview;
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
// Check if group stage qualifications are finished
function checkQualificationStatus(groupId = null) {
    const currentDate = new Date();
    
    if (!groupId) {
        // Global check - check all groups
        let allCompleted = true;
        let globalLastDate = null;
        
        // Get all unique group IDs from groups data (not just fixtures)
        const allGroups = groups.map(g => g.id);
        
        for (const gId of allGroups) {
            const groupStatus = checkQualificationStatus(gId);
            if (!groupStatus.allCompleted) {
                allCompleted = false;
            }
            if (groupStatus.lastFixtureDate && (!globalLastDate || groupStatus.lastFixtureDate > globalLastDate)) {
                globalLastDate = groupStatus.lastFixtureDate;
            }
        }
        
        return {
            allCompleted: allCompleted,
            lastFixtureDate: globalLastDate,
            qualificationsFinished: allCompleted && (!globalLastDate || currentDate > globalLastDate)
        };
    }
    
    // Group-specific check
    // First, check if this group has only one team
    const groupTeams = teams.filter(team => team.groupId === groupId);
    
    if (groupTeams.length <= 1) {
        // Single team or no teams - automatically completed
        return {
            allCompleted: true,
            lastFixtureDate: null,
            qualificationsFinished: true,
            hasFixtures: false,
            isSingleTeamGroup: true
        };
    }
    
    // Get all fixtures for this group
    const groupFixtures = fixtures.filter(gameweek => gameweek.groupId === groupId);
    
    if (groupFixtures.length === 0) {
        // No fixtures found but multiple teams - incomplete group
        return {
            allCompleted: false,
            lastFixtureDate: null,
            qualificationsFinished: false,
            hasFixtures: false
        };
    }
    
    // Get all matches for this group from fixtures
    let allMatches = [];
    let lastFixtureDate = null;
    
    groupFixtures.forEach(gameweek => {
        gameweek.matches.forEach(match => {
            allMatches.push(match);
            
            // Parse the fixture date and time
            if (match.date && match.time) {
                const matchDateTime = new Date(`${match.date}T${match.time}:00`);
                if (!lastFixtureDate || matchDateTime > lastFixtureDate) {
                    lastFixtureDate = matchDateTime;
                }
            }
        });
    });
    
    // Check if all matches have been played (check results data)
    const groupResults = results.filter(result => result.groupId === groupId);
    let allGroupMatchesCompleted = true;
    
    // For each fixture match, check if there's a corresponding result
    for (const fixtureMatch of allMatches) {
        const hasResult = groupResults.some(result => 
            result.matchId === fixtureMatch.id && result.played === true
        );
        if (!hasResult) {
            allGroupMatchesCompleted = false;
            break;
        }
    }
    
    return {
        allCompleted: allGroupMatchesCompleted,
        lastFixtureDate: lastFixtureDate,
        qualificationsFinished: allGroupMatchesCompleted && lastFixtureDate && currentDate > lastFixtureDate,
        hasFixtures: true
    };
}

function updateGroupStatusIndicator() {
    const statusElement = document.getElementById('group-status-indicator');
    if (!statusElement) return;
    
    // Get current selected group
    const groupSelect = document.getElementById('selected-group');
    const currentGroupId = groupSelect ? groupSelect.value : null;
    
    if (!currentGroupId) {
        statusElement.style.display = 'none';
        return;
    }
    
    // Check qualification status for the current group only
    const status = checkQualificationStatus(currentGroupId);
    const groupName = currentGroupId.replace('group-', '').toUpperCase();
    
    if (status.isSingleTeamGroup) {
        // Single team group - automatically completed
        statusElement.className = 'group-status-indicator completed';
        statusElement.innerHTML = `
            <span class="status-icon">✅</span>
            <span class="status-text">Group ${groupName} completed! (Single team)</span>
        `;
        statusElement.style.display = 'flex';
    } else if (!status.hasFixtures) {
        // Multiple teams but no fixtures - hide indicator
        statusElement.style.display = 'none';
    } else if (status.allCompleted) {
        // Normal completion with matches
        statusElement.className = 'group-status-indicator completed';
        statusElement.innerHTML = `
            <span class="status-icon">✅</span>
            <span class="status-text">Group ${groupName} completed!</span>
        `;
        statusElement.style.display = 'flex';
    } else {
        // Group in progress
        statusElement.className = 'group-status-indicator in-progress';
        statusElement.innerHTML = `
            <span class="status-icon">⚠️</span>
            <span class="status-text">Group matches in progress...</span>
        `;
        statusElement.style.display = 'flex';
    }
}

function updateOverview() {
    try {
        // Update group status indicator
        updateGroupStatusIndicator();
        
        const standings = calculateStandings();
        const tbody = document.getElementById('standings-body');
        tbody.innerHTML = '';
        
        // Get current group's completion status for crown logic
        const groupSelect = document.getElementById('selected-group');
        const currentGroupId = groupSelect ? groupSelect.value : null;
        const groupStatus = checkQualificationStatus(currentGroupId);
        
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
            const isActualFirst = index === 0; // True first place after tie-breakers
            
            // Add appropriate classes based on position and group completion status
            if (isActualFirst && (groupStatus.allCompleted || groupStatus.isSingleTeamGroup)) {
                // True first place AND (group completed OR single team group) - gets crown and green highlight
                row.classList.add('champion-first-place');
            } else if (isFirstPlace && !groupStatus.allCompleted && !groupStatus.isSingleTeamGroup) {
                // Tied for first but group not completed (and not single team) - only gets yellow highlight
                row.classList.add('tied-for-first-place');
            }
            // Note: Crown appears when group is completed OR when it's a single team group

            // Rank and goal difference colors
            const rankClass = index === 0 ? 'first' : index === 1 ? 'second' : index === 2 ? 'third' : '';
            const goalDiffClass = team.goalDifference > 0 ? 'goal-diff-positive' : 
                                team.goalDifference < 0 ? 'goal-diff-negative' : 'goal-diff-zero';

            // Get goal statistics for this team
            const goalStats = calculateGoalStatistics();
            const teamGoalStats = goalStats[team.id];
            
            row.innerHTML = `
                <td class="rank ${rankClass}">${index + 1}</td>
                <td class="team-name">${team.name} ${renderTeamBadge(team.id)}</td>
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
    } catch (error) {
        logger.error('Error updating standings:', error);
    }
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
    updateOverview();
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
    const addResultButton = (!result && config?.admin?.role === 'admin') ? 
        `<button class="add-result-btn" onclick="showAddResultModal('${match.id}', '${homeTeam.name}', '${awayTeam.name}', '${match.date}', '${match.time}')">+</button>` : '';
    
    // Edit result button (only for today's matches with results, until midnight)
    const editResultButton = (result && isToday && config?.admin?.role === 'admin') ? 
        `<button class="edit-result-btn" onclick="showEditResultModal('${match.id}', '${homeTeam.name}', '${awayTeam.name}', '${match.date}', '${match.time}', ${result.homeScore}, ${result.awayScore})">Edit</button>` : '';
    
    // Get venue information from config
    const venueInfo = config?.groupPhase?.venues?.[match.groupId];
    const venueLink = venueInfo ? 
        `<a href="${venueInfo.googleMapsUrl}" target="_blank" rel="noopener noreferrer" class="venue-link" title="${venueInfo.name}">
            <span class="venue-icon">📍</span>
        </a>` : '';
    
    matchDiv.innerHTML = `
        <div class="match-teams">
            ${homeTeam.name}${renderTeamBadge(homeTeam.id)} <span class="match-vs">vs</span> ${awayTeam.name}${renderTeamBadge(awayTeam.id)}
            ${matchIndicator}
            ${groupIndicator}
        </div>
        <div class="match-datetime-container">
            ${addResultButton}
            ${editResultButton}
            <div class="match-datetime">${venueLink}${formattedDate} - ${match.time}</div>
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
        logger.log('🔍 OpenAI Debug Info:', {
            useOpenAI: config?.simulation?.useOpenAI || false,
            openaiClientExists: !!OPENAI_CONFIG.apiKey,
            apiKeyExists: !!OPENAI_CONFIG.apiKey,
            apiKeyPrefix: OPENAI_CONFIG.apiKey ? OPENAI_CONFIG.apiKey.substring(0, 12) + '...' : 'none'
        });
        
        // Check if OpenRouter is enabled and configured
        if (config?.simulation?.useOpenAI && OPENAI_CONFIG.apiKey) {
            logger.log('✅ Using OpenRouter for simulation analysis');
            try {
                const aiAnalysis = await generateAISimulation(selectedTeamId, selectedTeam);
                simulationResults.innerHTML = aiAnalysis;
            } catch (aiError) {
                logger.warn('AI analysis failed, falling back to custom analysis:', aiError.message);
                
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
            const reason = !config?.simulation?.useOpenAI ? 'OpenAI disabled' : 
                          !OPENAI_CONFIG.apiKey ? 'OpenRouter client not initialized' : 
                          !OPENAI_CONFIG.apiKey ? 'No API key available' : 'Unknown';
                          
            logger.log('⚠️ Using fallback analysis because:', {
                useOpenAI: config?.simulation?.useOpenAI,
                openaiClient: !!OPENAI_CONFIG.apiKey,
                hasApiKey: !!OPENAI_CONFIG.apiKey,
                reason: reason
            });
            
            const customAnalysis = generateCustomSimulation(selectedTeamId, selectedTeam);
            simulationResults.innerHTML = customAnalysis;
        }
    } catch (error) {
        logger.error('Simulation error:', error);
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
        logger.error('OpenAI API error:', error);
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
            logger.log(`OpenRouter API attempt ${attempt}/${OPENAI_CONFIG.retryAttempts}`);
            
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
                logger.log('Token usage:', {
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
            logger.warn(`OpenRouter API attempt ${attempt} failed:`, error.message);
            
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
                    logger.log(`Rate limited. Waiting ${delay}ms before retry...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    continue;
                }
            }
            
            // For other errors, use exponential backoff
            if (attempt < OPENAI_CONFIG.retryAttempts) {
                const delay = OPENAI_CONFIG.retryDelay * Math.pow(2, attempt - 1);
                logger.log(`Retrying in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }
    
    // All retries exhausted, throw the last error with context
    throw handleOpenAIError(lastError);
}

// Enhanced error handling with user-friendly messages
function handleOpenAIError(error) {
    logger.error('OpenAI API error after retries:', error);
    
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
    
    // Get teams within points gap
    const relevantTeams = getTeamsWithinGap(currentStandings, teamId, config?.simulation?.pointsGapLimit || 3);
    
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
                    <h4>Teams Within ${config?.simulation?.pointsGapLimit || 3}-Point Gap (Next Gameweek Focus)</h4>
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
                                <span class="team-name">${team.name} ${renderTeamBadge(team.id)} ${matchIndicator}</span>
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
                    <p><strong>Teams in Analysis:</strong> ${relevantTeams.length - 1} competitors within ${config?.simulation?.pointsGapLimit || 3}-point gap</p>
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
                <span class="team-home">${match.homeTeamName} ${renderTeamBadge(match.homeTeam)}</span>
                <span class="vs-separator">vs</span>
                <span class="team-away">${match.awayTeamName} ${renderTeamBadge(match.awayTeam)}</span>
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
        logger.error('Forecast error:', error);
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
        option.textContent = `${group.name} - ${group.description}`;
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
            statusMessage = `<div class="status-message review-mode">📈 All matches completed! Reviewing prediction accuracy until Monday.</div>`;
        } else if (allMatchesCompleted && isNextMondayOrLater) {
            headerText = `⚽ Match Predictions for ${groupName} - Gameweek ${currentGameweek.gameweek}`;
            statusMessage = `<div class="status-message archive-mode">📚 Previous gameweek results (review period ended).</div>`;
        } else {
            headerText = `⚽ Match Predictions for ${groupName} - Gameweek ${currentGameweek.gameweek}`;
            statusMessage = `<div class="status-message prediction-mode">🔮 Live predictions for upcoming matches.</div>`;
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
    
    logger.log('DEBUG: Finding current gameweek for group:', groupId);
    
    // Get all gameweek objects for this group
    const groupGameweeks = fixtures.filter(gw => gw.groupId === groupId);
    const groupResults = results.filter(r => r.groupId === groupId);
    
    logger.log('DEBUG: Available gameweeks:', groupGameweeks.map(gw => gw.gameweek));
    logger.log('DEBUG: Results count:', groupResults.length);
    
    if (groupGameweeks.length === 0) return null;
    
    // Sort gameweeks by number
    groupGameweeks.sort((a, b) => a.gameweek - b.gameweek);
    
    // Get current date and calculate if we're past Sunday 23:59
    const now = new Date();
    const currentDayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday, etc.
    
    // Only consider it "after week end" if it's Monday AND we've completed the current gameweek
    // The idea is: complete gameweek on any day = stay for review until next Monday
    const isNextMondayOrLater = currentDayOfWeek === 1; // Only Monday, not the whole week
    
    logger.log('DEBUG: Current day of week:', currentDayOfWeek, 'isNextMondayOrLater:', isNextMondayOrLater);
    
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
        
        logger.log('DEBUG: Checking gameweek', gameweekObj.gameweek, 'hasAnyMatchPlayed:', hasAnyMatchPlayed);
        
        if (hasAnyMatchPlayed) {
            // This is the most advanced gameweek with matches played
            actualCurrentGameweek = gameweekObj;
            logger.log('DEBUG: Found actual current gameweek:', actualCurrentGameweek.gameweek);
            break;
        }
    }
    
    // If no gameweek has matches played yet, use the first gameweek
    if (!actualCurrentGameweek) {
        actualCurrentGameweek = groupGameweeks[0];
        logger.log('DEBUG: No played gameweeks found, using first:', actualCurrentGameweek.gameweek);
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
    
    logger.log('DEBUG: actualCurrentGameweek:', actualCurrentGameweek.gameweek, 'allComplete:', currentGameweekAllComplete);
    logger.log('DEBUG: nextAvailableGameweek:', nextAvailableGameweek?.gameweek || 'none');
    
    if (!currentGameweekAllComplete) {
        // Current gameweek has unplayed matches - always show it
        currentGameweek = actualCurrentGameweek;
        logger.log('DEBUG: Showing current gameweek (has unplayed matches):', currentGameweek.gameweek);
    } else if (currentGameweekAllComplete && !isNextMondayOrLater) {
        // Current gameweek is complete but it's not Monday yet - stay for review
        currentGameweek = actualCurrentGameweek;
        logger.log('DEBUG: Showing current gameweek for review (not Monday yet):', currentGameweek.gameweek);
    } else if (currentGameweekAllComplete && isNextMondayOrLater && nextAvailableGameweek) {
        // Current gameweek is complete, it's Monday, and there's a next gameweek - advance
        currentGameweek = nextAvailableGameweek;
        logger.log('DEBUG: Advancing to next gameweek (Monday):', currentGameweek.gameweek);
    } else {
        // Fallback: stay on current gameweek
        currentGameweek = actualCurrentGameweek;
        logger.log('DEBUG: Fallback to current gameweek:', currentGameweek.gameweek);
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
            ${teamAnalysis.map(team => {
                // Use performance position for All Groups view, otherwise use league position
                const displayPosition = team.performancePosition || team.position;
                const positionLabel = team.performancePosition ? 'Performance Rank' : 'League Position';
                
                return `
                <div class="team-analysis-card ${displayPosition <= 2 ? 'top-team' : ''}">
                    <div class="team-header">
                        <div class="team-position" title="${positionLabel}">${displayPosition}</div>
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
                        <!-- League single row -->
                        <div class="metric league-metric" style="align-items:center; grid-column:1 / -1;">
                            <span class="metric-label">League:</span>
                            <span class="metric-value">${renderTeamBadge(team.id)}</span>
                        </div>
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
                        <div class="metric winrate-metric" style="grid-column:1 / -1;">
                            <span class="metric-label">Win Rate:</span>
                            <span class="metric-value">${team.winPercentage}%</span>
                        </div>
                    </div>
                </div>
                `;
            }).join('')}
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
                    
                    <div class="match-teams match-teams-predictions">
                        <div class="team-prediction home-team">
                            <h4>${pred.homeTeam.name} ${renderTeamBadge(pred.homeTeam.id)}</h4>
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
                            <h4>${pred.awayTeam.name} ${renderTeamBadge(pred.awayTeam.id)}</h4>
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
                    
                    ${generateGoalScorerPredictionsHTML(
                        pred.homeTeam.id, 
                        pred.awayTeam.id, 
                        (function(){ const s=parsePredictedScore(pred.prediction.predictedScore); return s.home; })(), 
                        (function(){ const s=parsePredictedScore(pred.prediction.predictedScore); return s.away; })()
                    )}
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
    
    // Debug logging
    logger.log(`🔍 Predicting scorers for ${homeTeamId} (${predictedHomeScore}) vs ${awayTeamId} (${predictedAwayScore})`);
    
    // Home team predictions
    if (hasGoalScorerData(homeTeamId) && predictedHomeScore > 0) {
        const homeScorers = getTeamGoalScorers(homeTeamId);
        const totalHomeGoals = homeScorers.reduce((sum, scorer) => sum + scorer.goals, 0);
        
        logger.log(`📊 ${homeTeamId} scorers:`, homeScorers.length, 'total goals:', totalHomeGoals);
        
        if (homeScorers.length > 0 && totalHomeGoals > 0) {
            homeScorers.forEach(scorer => {
                const probability = (scorer.goals / totalHomeGoals * 100);
                if (probability >= 10) { // Lowered threshold for better predictions
                    predictions.home.push({
                        name: scorer.name,
                        probability: Math.round(probability),
                        goals: scorer.goals,
                        penalties: scorer.penalties
                    });
                }
            });
            
            // If no players meet threshold, show top scorer anyway
            if (predictions.home.length === 0 && homeScorers.length > 0) {
                const topScorer = homeScorers[0];
                const probability = (topScorer.goals / totalHomeGoals * 100);
                predictions.home.push({
                    name: topScorer.name,
                    probability: Math.round(probability),
                    goals: topScorer.goals,
                    penalties: topScorer.penalties
                });
            }
        }
    } else {
        logger.log(`⚠️ ${homeTeamId}: hasData=${hasGoalScorerData(homeTeamId)}, predictedScore=${predictedHomeScore}`);
    }
    
    // Away team predictions
    if (hasGoalScorerData(awayTeamId) && predictedAwayScore > 0) {
        const awayScorers = getTeamGoalScorers(awayTeamId);
        const totalAwayGoals = awayScorers.reduce((sum, scorer) => sum + scorer.goals, 0);
        
        logger.log(`📊 ${awayTeamId} scorers:`, awayScorers.length, 'total goals:', totalAwayGoals);
        
        if (awayScorers.length > 0 && totalAwayGoals > 0) {
            awayScorers.forEach(scorer => {
                const probability = (scorer.goals / totalAwayGoals * 100);
                if (probability >= 10) { // Lowered threshold for better predictions
                    predictions.away.push({
                        name: scorer.name,
                        probability: Math.round(probability),
                        goals: scorer.goals,
                        penalties: scorer.penalties
                    });
                }
            });
            
            // If no players meet threshold, show top scorer anyway
            if (predictions.away.length === 0 && awayScorers.length > 0) {
                const topScorer = awayScorers[0];
                const probability = (topScorer.goals / totalAwayGoals * 100);
                predictions.away.push({
                    name: topScorer.name,
                    probability: Math.round(probability),
                    goals: topScorer.goals,
                    penalties: topScorer.penalties
                });
            }
        }
    } else {
        logger.log(`⚠️ ${awayTeamId}: hasData=${hasGoalScorerData(awayTeamId)}, predictedScore=${predictedAwayScore}`);
    }
    
    logger.log(`✅ Final predictions - Home: ${predictions.home.length}, Away: ${predictions.away.length}`);
    return predictions;
}

// Generate goal scorer predictions HTML
function generateGoalScorerPredictionsHTML(homeTeamId, awayTeamId, predictedHomeScore, predictedAwayScore) {
    const scorerPredictions = predictGoalScorers(homeTeamId, awayTeamId, predictedHomeScore, predictedAwayScore);
    
    // Check if both teams have goal scorer data available
    const homeHasData = hasGoalScorerData(homeTeamId);
    const awayHasData = hasGoalScorerData(awayTeamId);
    
    // Only show if at least one team has goal scorer data
    if (!homeHasData && !awayHasData) {
        return '';
    }
    
    // Get team names
    const homeTeam = teams.find(t => t.id === homeTeamId);
    const awayTeam = teams.find(t => t.id === awayTeamId);
    
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
                    <div class="teams-scorer-columns">
                        <div class="team-scorers home-scorers">
                            <h6>${homeTeam ? homeTeam.name : 'Home Team'}</h6>
                            ${homeHasData ? (
                                predictedHomeScore > 0 ? (
                                    scorerPredictions.home.length > 0 ? 
                                        scorerPredictions.home.map(scorer => `
                                            <div class="scorer-prediction">
                                                <span class="scorer-name">${scorer.name}</span>
                                                <span class="scorer-probability">${scorer.probability}%</span>
                                            </div>
                                        `).join('') : 
                                        '<div class="no-data">No qualifying scorers</div>'
                                ) : '<div class="no-data">No goals predicted</div>'
                            ) : '<div class="no-data">No scorer data available</div>'}
                        </div>
                        
                        <div class="team-scorers away-scorers">
                            <h6>${awayTeam ? awayTeam.name : 'Away Team'}</h6>
                            ${awayHasData ? (
                                predictedAwayScore > 0 ? (
                                    scorerPredictions.away.length > 0 ? 
                                        scorerPredictions.away.map(scorer => `
                                            <div class="scorer-prediction">
                                                <span class="scorer-name">${scorer.name}</span>
                                                <span class="scorer-probability">${scorer.probability}%</span>
                                            </div>
                                        `).join('') : 
                                        '<div class="no-data">No qualifying scorers</div>'
                                ) : '<div class="no-data">No goals predicted</div>'
                            ) : '<div class="no-data">No scorer data available</div>'}
                        </div>
                    </div>
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
                    let borderClass = '';
                    if (team.championshipProbability >= 75) borderClass = 'high-chance';
                    else if (team.championshipProbability >= 50) borderClass = 'good-chance';
                    else if (team.championshipProbability >= 25) borderClass = 'medium-chance';
                    // Use standard-size badge per latest spec (no large badges in Final Standings Projection)
                    const badge = renderTeamBadge(team.id);
                    return `
                        <div class="projected-position ${index === 0 ? 'champion' : index < 3 ? 'podium' : ''} ${borderClass}">
                            <div class="proj-rank">${index + 1}</div>
                            <div class="proj-team">${team.name} ${badge}</div>
                            <div class="proj-points">${team.projectedPoints} pts</div>
                            <div class="proj-probability">${team.championshipProbability}% chance</div>
                        </div>
                    `;
                }).join('')}
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
                    <div>Average goals per game: ${(() => {
                        const totalGoals = teamAnalysis.reduce((sum, t) => sum + t.goalsFor, 0);
                        const totalGames = teamAnalysis.reduce((sum, t) => sum + t.played, 0);
                        return totalGames > 0 ? (totalGoals / totalGames).toFixed(1) : '0.0';
                    })()}</div>
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
    if (!config?.admin?.validateTime) {
        return true; // Skip validation if disabled
    }
    
    // Create match datetime - using local timezone
    const matchDateTime = new Date(`${matchDate}T${matchTime}:00`);
    const currentDateTime = new Date();
    
    // Debug logging (can be removed later)
    logger.log('Match time validation:', {
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
        
        // Trigger download of updated group-phase-results.json
        downloadUpdatedResults();
        
        // Hide modal and reset title
        hideAddResultModal();
        document.querySelector('.modal-header h3').textContent = 'Add Match Result';
        document.querySelector('.btn-primary').textContent = 'Add Result';
        
        // Show success toast
        if (isMobileDevice()) {
            showToast('Result updated! Data stored in session (will be lost on refresh)', 'success');
        } else {
            showToast('Result updated! Check Downloads → Replace data/group-phase-results.json → Refresh page', 'success');
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
        
        // Trigger download of updated group-phase-results.json
        downloadUpdatedResults();
        
        // Hide modal
        hideAddResultModal();
        
        // Show success toast with instructions based on device type
        if (isMobileDevice()) {
            showToast('Result added! Data stored in session (will be lost on refresh)', 'success');
        } else {
            showToast('Result added! Check Downloads → Replace data/group-phase-results.json → Refresh page', 'success');
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
    config.admin.role = 'admin';
    updateAllTabs(); // Refresh to show admin buttons
    showToast('Admin mode enabled', 'success');
}

// Function to disable admin mode
function disableAdminMode() {
    config.admin.role = 'user';
    updateAllTabs(); // Refresh to hide admin buttons
    showToast('Admin mode disabled', 'info');
}

// Function to toggle time validation
function toggleTimeValidation() {
    config.admin.validateTime = !config.admin.validateTime;
    const status = config.admin.validateTime ? 'enabled' : 'disabled';
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
            logger.log('Loaded pending results from session');
            showToast('Previous session data restored', 'info');
        } catch (error) {
            logger.error('Error loading pending results:', error);
        }
    }
}

// Function to detect if the device is mobile
function isMobileDevice() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || 
           window.innerWidth <= 768;
}

// Function to download updated group-phase-results.json
function downloadUpdatedResults() {
    // Check if it's a mobile device
    if (isMobileDevice()) {
        // On mobile, just store in session and show different message
        sessionStorage.setItem('pendingResults', JSON.stringify(results));
        logger.log('Results stored in session (mobile device)');
        return;
    }
    
    // On desktop, proceed with download
    const dataStr = JSON.stringify(results, null, 2);
    const dataBlob = new Blob([dataStr], {type: 'application/json'});
    
    const link = document.createElement('a');
    link.href = URL.createObjectURL(dataBlob);
    link.download = 'group-phase-results.json';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// Function to export all current results for manual copying
function exportAllResults() {
    logger.log('All Current Results (copy this to group-phase-results.json):');
    logger.log(JSON.stringify(results, null, 2));
    
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
    getConfig: () => config,
    showConfig: () => {
        logger.log('Current Configuration:', config);
        logger.log('OpenAI Configuration:', {
            clientInitialized: !!OPENAI_CONFIG.apiKey,
            apiKeyLoaded: !!OPENAI_CONFIG.apiKey,
            useOpenAI: config?.simulation?.useOpenAI || false,
            model: OPENAI_CONFIG.model,
            maxTokens: OPENAI_CONFIG.maxTokens,
            retryAttempts: OPENAI_CONFIG.retryAttempts,
            retryDelay: OPENAI_CONFIG.retryDelay
        });
        logger.log('Token Usage Stats:', tokenUsageStats);
        return { 
            config, 
            OPENAI_CONFIG: {
                client: !!OPENAI_CONFIG.apiKey, 
                apiKey: !!OPENAI_CONFIG.apiKey, 
                enabled: config?.simulation?.useOpenAI || false,
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
        const wasEnabled = config?.simulation?.useOpenAI;
        if (config?.simulation) {
            config.simulation.useOpenAI = true;
        }
        
        if (!wasEnabled) {
            // Initialize OpenAI if it wasn't enabled before
            initializeOpenRouterSystem();
        } else {
            showToast('OpenAI analysis already enabled', 'info', 3000);
        }
        logger.log('OpenAI enabled for this session');
    },
    disableOpenAI: () => {
        if (config?.simulation) {
            config.simulation.useOpenAI = false;
        }
        showToast('OpenAI analysis disabled - Using standard analysis', 'info', 3000);
        logger.log('OpenAI disabled for this session');
    },
    checkOpenAI: () => {
        const status = {
            enabled: config?.simulation?.useOpenAI || false,
            clientInitialized: !!OPENAI_CONFIG.apiKey,
            apiKeyLoaded: !!OPENAI_CONFIG.apiKey,
            model: OPENAI_CONFIG.model,
            maxTokens: OPENAI_CONFIG.maxTokens,
            retryAttempts: OPENAI_CONFIG.retryAttempts,
            readyForUse: (config?.simulation?.useOpenAI || false) && !!OPENAI_CONFIG.apiKey
        };
        logger.log('🤖 OpenAI Status:', status);
        
        if (status.readyForUse) {
            logger.log('✅ OpenAI is ready for use!');
        } else if (!status.enabled) {
            logger.log('⚠️ OpenAI is disabled. Enable with: footballAdmin.enableOpenAI()');
        } else if (!status.clientInitialized) {
            logger.log('⚠️ OpenAI client not initialized. Check API key.');
        } else if (!status.apiKeyLoaded) {
            logger.log('⚠️ No API key loaded. Check .env file or use manual entry.');
        }
        
        return status.readyForUse;
    },
    // Cost optimization controls
    setMaxTokens: (tokens) => {
        if (tokens >= 50 && tokens <= 2000) {
            OPENAI_CONFIG.maxTokens = tokens;
            showToast(`Max tokens set to ${tokens}`, 'info');
            logger.log(`Token limit updated to ${tokens} for this session`);
        } else {
            logger.error('Invalid token limit. Must be between 50 and 2000.');
        }
    },
    getTokenStats: () => {
        logger.log('Token Usage Statistics:', {
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
            logger.error('Invalid retry attempts. Must be between 1 and 5.');
        }
    },
    // Configuration management (clears any old localStorage data)
    clearConfig: () => {
        localStorage.removeItem('openai_config');
        sessionStorage.removeItem('openai_session_key');
        // Reset to config defaults
        if (config?.simulation) {
            config.simulation.useOpenAI = false; // Back to default from config.json
        }
        OPENAI_CONFIG.maxTokens = 500;
        OPENAI_CONFIG.retryAttempts = 3;
        OPENAI_CONFIG.model = 'gpt-3.5-turbo';
        showToast('Cleared old config, using code defaults', 'info');
        logger.log('🗑️ Cleared localStorage/sessionStorage and reset to code defaults');
    },
    // Debug helpers
    reloadApiKey: async () => {
        logger.log('🔄 Reloading API key...');
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
            logger.log('✅ API key reloaded successfully');
            showToast('API key reloaded', 'success');
        } else {
            logger.log('❌ No API key found');
            showToast('No API key found', 'error');
        }
        
        return !!OPENAI_CONFIG.apiKey;
    },
    debugOpenAI: () => {
        logger.log('🔍 Complete OpenAI Debug Report:');
        logger.log('window.fetch available:', !!window.fetch);
        logger.log('config.simulation.useOpenAI:', config?.simulation?.useOpenAI, '(from config.json)');
        logger.log('openai client exists:', !!openai);
        logger.log('OPENAI_CONFIG.apiKey exists:', !!OPENAI_CONFIG.apiKey);
        logger.log('API Key prefix:', OPENAI_CONFIG.apiKey ? OPENAI_CONFIG.apiKey.substring(0, 12) + '...' : 'none');
        
        const oldLocalStorage = localStorage.getItem('openai_config');
        if (oldLocalStorage) {
            logger.warn('⚠️ Old localStorage config found (no longer used):', oldLocalStorage);
            logger.log('💡 Run footballAdmin.clearConfig() to remove old data');
        } else {
            logger.log('✅ No localStorage config (good - using code defaults)');
        }
        
        logger.log('Current Configuration (from config.json):', {
            useOpenAI: config?.simulation?.useOpenAI || false,
            model: OPENAI_CONFIG.model,
            maxTokens: OPENAI_CONFIG.maxTokens,
            retryAttempts: OPENAI_CONFIG.retryAttempts
        });
        
        const isReady = (config?.simulation?.useOpenAI || false) && !!openai && !!OPENAI_CONFIG.apiKey;
        logger.log('🎯 OpenAI Ready:', isReady);
        
        if (!isReady) {
            logger.log('❌ Issues preventing OpenAI from working:');
            if (!window.fetch) logger.log('  - Fetch API not available');
            if (!(config?.simulation?.useOpenAI)) logger.log('  - OpenAI disabled in config');
            if (!openai) logger.log('  - OpenAI client not initialized');
            if (!OPENAI_CONFIG.apiKey) logger.log('  - No API key available');
        }
        
        return {
            ready: isReady,
            sdkLoaded: !!window.fetch,
            clientInitialized: !!openai,
            hasApiKey: !!OPENAI_CONFIG.apiKey,
            enabled: config?.simulation?.useOpenAI || false
        };
    },
    clearConfig: () => {
        localStorage.removeItem('openai_config');
        sessionStorage.removeItem('openai_session_key');
        logger.log('🗑️ Cleared all OpenAI configuration from storage');
        logger.log('💡 Reload the page to use default settings');
    },
    testConfig: () => {
        logger.log('🧪 Testing configuration files...');
        
        // Test config.json
        fetch('config.json')
            .then(response => {
                logger.log('config.json status:', response.status, response.ok ? '✅' : '❌');
                return response.json();
            })
            .then(data => logger.log('config.json content:', data))
            .catch(err => logger.log('config.json error:', err.message));
            
        // Test .env
        fetch('.env')
            .then(response => {
                logger.log('.env status:', response.status, response.ok ? '✅' : '❌');
                return response.text();
            })
            .then(data => logger.log('.env content available:', !!data))
            .catch(err => logger.log('.env error:', err.message));
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
        logger.log('Teams data loaded:', teamsData);
        // Apply persisted formations/starters if available
        loadPersistedTeamState();
        populateTeamLineupSelector();
    } catch (error) {
        logger.error('Error loading teams data:', error);
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
            optgroup.label = `${group.name} - ${group.description}`;
            
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
    
    logger.log('Updating lineup for team:', team.name);
    
    // Populate tactics selector for this team
    populateTacticsSelector(selectedTeamId);
    
    // Update field players
    updateFieldPlayers(team);
    
    // Update bench players
    updateBenchPlayers(team);

    // Persist after any lineup refresh (captures starters order/flags)
    persistTeamState();
}

// Update players on the field
function updateFieldPlayers(team) {
    // Validate and fix formation if needed
    const validatedFormation = validateFutsalFormation(team.formation);

    // Only use non-injured, on-field starters for reassignment
    let starters = team.players.filter(player => player.isStarter && player.status !== 'injured');

    // Update goalkeeper (unchanged)
    const goalkeeper = starters.find(p => p.position === 'goalkeeper');
    if (goalkeeper) {
        updatePlayerIcon('goalkeeper', goalkeeper);
        updatePlayerName('goalkeeper-name', goalkeeper);
    }

    // Parse formation
    const [defenders, midfielders, forwards] = validatedFormation.split('-').map(Number);

    // Reassign only among current on-field, non-injured players
    // Collect all field players (not bench, not injured, not GK)
    let fieldPlayers = starters.filter(p => p.position !== 'goalkeeper');
    // Partition by role
    let defendersList = fieldPlayers.filter(p => p.position === 'defender');
    let midfieldersList = fieldPlayers.filter(p => p.position === 'midfielder');
    let forwardsList = fieldPlayers.filter(p => p.position === 'forward');

    // If any line needs more than available, move excess from other lines (preserve as much as possible)
    // Build a flat list, then assign by formation order: defenders, midfielders, forwards
    let allField = [...defendersList, ...midfieldersList, ...forwardsList];
    let newDef = allField.splice(0, defenders);
    let newMid = allField.splice(0, midfielders);
    let newFwd = allField.splice(0, forwards);

    // If any player changed line, show warning toast
    const oldMap = {def: defendersList.map(p=>p.id), mid: midfieldersList.map(p=>p.id), fwd: forwardsList.map(p=>p.id)};
    const newMap = {def: newDef.map(p=>p.id), mid: newMid.map(p=>p.id), fwd: newFwd.map(p=>p.id)};
    if (JSON.stringify(oldMap) !== JSON.stringify(newMap)) {
        showToast('You changed tactics but should review player positions', 'warning', 4000);
    }

    // Reset all field slots
    resetLineSlots();
    allocateLine('defense', 'defender', defenders, newDef);
    allocateLine('midfield', 'midfielder', midfielders, newMid);
    allocateLine('attack', 'forward', forwards, newFwd);

    persistTeamState();
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
    // Legacy function retained for compatibility. New slot system uses allocateLine().
}

// Get available positions based on formation needs
function getAvailablePositions(positionType, count) {
    // Deprecated with slot system; kept to avoid runtime errors elsewhere.
    return [];
}

// Get position IDs for each position type (keeping for compatibility)
function getPositionsForType(positionType) {
    switch (positionType) {
        case 'defender':
            return [];
        case 'midfielder':
            return [];
        case 'forward':
            return [];
        default:
            return [];
    }
}

// --- Slot System Helpers ---
function resetLineSlots() {
    document.querySelectorAll('.formation-line[data-line] .line-slot').forEach(slot => {
        slot.classList.remove('occupied', 'valid-target');
        slot.innerHTML = '';
    });
}

function allocateLine(lineKey, positionType, countNeeded, players) {
    const line = document.querySelector(`.formation-line[data-line="${lineKey}"]`);
    if (!line) return;
    const slots = Array.from(line.querySelectorAll('.line-slot'));

    const slotPattern = getSlotPattern(countNeeded);
    const chosenSlots = slots.filter(slot => slotPattern.includes(parseInt(slot.dataset.slot)));

    players.slice(0, countNeeded).forEach((player, idx) => {
        const targetSlot = chosenSlots[idx];
        if (targetSlot) {
            const positionId = `${lineKey}-slot-${targetSlot.dataset.slot}`;
            const playerWrapper = createPlayerPositionElement(positionId, player, positionType);
            targetSlot.appendChild(playerWrapper);
            targetSlot.classList.add('occupied');
        }
    });
}

function getSlotPattern(count) {
    const patterns = {
        0: [],
        1: [3],
        2: [2,4],
        3: [1,3,5],
        4: [1,2,4,5]
    };
    return patterns[count] || [];
}

function createPlayerPositionElement(positionId, player, positionType) {
    const container = document.createElement('div');
    container.className = 'player-position';
    container.id = positionId;

    container.innerHTML = `\n        <div class="player-icon ${player.position}">\n            <span class="player-number">${player.number}</span>\n        </div>\n        <div class="player-name">${player.name}</div>\n    `;

    // Attach drag/drop
    const icon = container.querySelector('.player-icon');
    updatePlayerIcon(positionId, player); // Reuse existing to set flags + drag
    return container;
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
        logger.log('Drag start for player:', player.name);
        e.dataTransfer.setData('text/plain', JSON.stringify({
            playerId: player.id,
            playerPosition: player.position,
            sourcePositionId: positionId
        }));
        
        playerIcon.classList.add('dragging');
        showDropZones(player.position);
    };
    
    playerIcon._dragEndHandler = function(e) {
        logger.log('Drag end for player:', player.name);
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
        logger.log('Touch start for player:', player.name);
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
        logger.log('Touch end for player:', player.name);
        
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

    
    logger.log('Drag and drop setup completed for:', player.name, 'at position:', positionId);
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
        logger.log('Bench drag start for player:', player.name);
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
        logger.log('Bench drag end for player:', player.name);
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
        logger.log('Bench touch start for player:', player.name);
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
        logger.log('Bench touch end for player:', player.name);
        
        if (touchStartData) {
            const touch = e.changedTouches[0];
            const elementBelow = document.elementFromPoint(touch.clientX, touch.clientY);
            
            // Check if dropped on field position
            const targetFieldPosition = elementBelow?.closest('.player-position');
            if (targetFieldPosition && isValidDropPosition(touchStartData.playerPosition, targetFieldPosition.id)) {
                logger.log('Bench player dropped on field position:', targetFieldPosition.id);
                moveBenchPlayerToField(touchStartData, targetFieldPosition.id);
                showToast(`${player.name} moved to ${getPositionDisplayName(targetFieldPosition.id)}`, 'success');
            }
            // Check if dropped on bench area
            else if (elementBelow?.closest('#bench-players')) {
                logger.log('Bench player dropped on bench area');
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
    
    logger.log('Bench drag and drop setup completed for:', player.name);
}

// Show drop zones for bench players (field positions + bench area)
function showBenchDropZones(playerPosition) {
    logger.log('Showing bench drop zones for position:', playerPosition);
    
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
    logger.log('Setting up bench drop zone');
    
    function handleBenchDragOver(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    }
    
    function handleBenchDrop(e) {
        e.preventDefault();
        logger.log('Drop on bench area');
        
        try {
            const dragData = JSON.parse(e.dataTransfer.getData('text/plain'));
            logger.log('Bench drop data:', dragData);
            
            if (dragData.isBenchPlayer) {
                // Reordering within bench - handled by the bench container
                logger.log('Bench player reordering');
            } else {
                // Field player moving to bench
                logger.log('Field player moving to bench');
                moveFieldPlayerToBench(dragData);
            }
        } catch (error) {
            logger.error('Bench drop error:', error);
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
    logger.log('Showing drop zones for position:', playerPosition);
    // Determine line for this position
    const positionLineMap = { defender: 'defense', midfielder: 'midfield', forward: 'attack' };
    const line = positionLineMap[playerPosition];
    if (!line) return;
    const lineEl = document.querySelector(`.formation-line[data-line="${line}"]`);
    if (!lineEl) return;
    const slots = Array.from(lineEl.querySelectorAll('.line-slot'));
    slots.forEach(slot => {
        const slotIndex = parseInt(slot.dataset.slot);
        const existingPlayerPos = slot.querySelector('.player-position');
        // Mark all slots in the line as valid drop targets for this position type
        if (existingPlayerPos) {
            existingPlayerPos.classList.add('drop-zone','valid-drop');
            setupDropZone(existingPlayerPos);
        } else {
            slot.classList.add('valid-target');
            // Create a temporary target div to attach listeners
            const tempTargetId = `${line}-slot-${slotIndex}`;
            let temp = slot.querySelector('.player-position');
            if (!temp) {
                temp = document.createElement('div');
                temp.className = 'player-position empty-slot';
                temp.id = tempTargetId;
                slot.appendChild(temp);
            }
            temp.classList.add('drop-zone','valid-drop');
            setupDropZone(temp);
        }
    });
}

// Hide all drop zones
function hideDropZones() {
    document.querySelectorAll('.player-position').forEach(pos => {
        pos.classList.remove('drop-zone','valid-drop','invalid-drop');
        removeDropZone(pos);
        if (pos.classList.contains('empty-slot')) {
            // remove temporary placeholder
            const parent = pos.parentElement;
            pos.remove();
            if (parent) parent.classList.remove('valid-target');
        }
    });
}

// Check if a position is valid for a player type
function isValidDropPosition(playerPosition, targetPositionId) {
    if (targetPositionId === 'goalkeeper') {
        return playerPosition === 'goalkeeper';
    }
    // Allow drop to any slot in the correct line for this position type
    const slotMatch = targetPositionId.match(/(defense|midfield|attack)-slot-(\d+)/);
    if (!slotMatch) return false;
    const line = slotMatch[1];
    const positionLineMap = {
        'defender': 'defense',
        'midfielder': 'midfield',
        'forward': 'attack'
    };
    // If player is in the wrong line, allow moving to their correct line
    return positionLineMap[playerPosition] === line;
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
    logger.log('Setting up drop zone for:', positionElement.id);
    
    function handleDragOver(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        logger.log('Drag over:', positionElement.id);
    }
    
    function handleDrop(e) {
        e.preventDefault();
        logger.log('Drop on:', positionElement.id);
        
        try {
            const dragData = JSON.parse(e.dataTransfer.getData('text/plain'));
            const targetPositionId = positionElement.id;
            
            logger.log('Drop data:', dragData);
            logger.log('Target position:', targetPositionId);
            
            if (isValidDropPosition(dragData.playerPosition, targetPositionId)) {
                logger.log('Valid drop');
                
                if (dragData.isBenchPlayer) {
                    // Bench player moving to field
                    moveBenchPlayerToField(dragData, targetPositionId);
                } else {
                    // Field player moving to another field position
                    swapPlayers(dragData.sourcePositionId, targetPositionId);
                }
                
                showToast(`Player moved to ${getPositionDisplayName(targetPositionId)}`, 'success');
            } else {
                logger.log('Invalid drop position');
            }
        } catch (error) {
            logger.error('Drop error:', error);
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

    const sourcePlayerIcon = sourceElement.querySelector('.player-icon');
    const targetPlayerIcon = targetElement.querySelector('.player-icon');
    if (!sourcePlayerIcon) return;

    const sourcePlayerId = sourcePlayerIcon.dataset.playerId;
    const sourcePlayer = team.players.find(p => p.id === sourcePlayerId);
    if (!sourcePlayer) return;

    let targetPlayer = null;
    if (targetPlayerIcon) {
        const targetPlayerId = targetPlayerIcon.dataset.playerId;
        targetPlayer = team.players.find(p => p.id === targetPlayerId);
    }

    // Field-to-field swap
    if (sourcePlayer.isStarter && targetPlayer && targetPlayer.isStarter) {
        // Swap their isStarterOrder (if you have it), or just swap their positions in the array
        // For now, swap their isStarter flags and re-render
        // Actually, both remain starters, just swap their positions visually
        // To ensure correct order, swap their positions in the team.players array
        const sourceIdx = team.players.indexOf(sourcePlayer);
        const targetIdx = team.players.indexOf(targetPlayer);
        if (sourceIdx !== -1 && targetIdx !== -1) {
            [team.players[sourceIdx], team.players[targetIdx]] = [team.players[targetIdx], team.players[sourceIdx]];
        }
    }
    // Bench-to-field swap (replace field player)
    else if (!sourcePlayer.isStarter && targetPlayer && targetPlayer.isStarter) {
        targetPlayer.isStarter = false;
        sourcePlayer.isStarter = true;
        // Optionally, swap their positions in the array for order
        const sourceIdx = team.players.indexOf(sourcePlayer);
        const targetIdx = team.players.indexOf(targetPlayer);
        if (sourceIdx !== -1 && targetIdx !== -1) {
            [team.players[sourceIdx], team.players[targetIdx]] = [team.players[targetIdx], team.players[sourceIdx]];
        }
    }
    // Field-to-empty-slot (move field player)
    else if (sourcePlayer.isStarter && !targetPlayerIcon) {
        // No change needed, just re-render
    }
    // Bench-to-empty-slot (move bench player to field)
    else if (!sourcePlayer.isStarter && !targetPlayerIcon) {
        sourcePlayer.isStarter = true;
    }

    updateTeamLineup();
    persistTeamState();
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
    logger.log('=== TESTING DRAG AND DROP SETUP ===');
    
    const allPlayerIcons = document.querySelectorAll('.player-icon');
    logger.log('Found player icons:', allPlayerIcons.length);
    
    allPlayerIcons.forEach((icon, index) => {
        logger.log(`Player ${index + 1}:`);
        logger.log('  - Draggable:', icon.draggable);
        logger.log('  - Has dataset:', !!icon.dataset.playerId);
        logger.log('  - Position:', icon.dataset.playerPosition);
        logger.log('  - Current pos:', icon.dataset.currentPositionId);
        logger.log('  - Classes:', icon.className);
    });
    
    const allPositions = document.querySelectorAll('.player-position');
    logger.log('Found position elements:', allPositions.length);
    
    allPositions.forEach((pos, index) => {
        logger.log(`Position ${index + 1}: ${pos.id} - Display: ${pos.style.display}`);
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
    
    logger.log(`Updating formation to ${selectedTactic} for team ${team.name}`);
    
    const oldFormation = team.formation;
    team.formation = selectedTactic; // temporary update

    // Track pre-change player allocation summary
    const beforeMap = getCurrentLinePlayerMap(team);

    // Re-render field
    updateFieldPlayers(team);

    // Compare after allocation
    const afterMap = getCurrentLinePlayerMap(team);
    if (formationPlayerMovementOccurred(beforeMap, afterMap)) {
        showToast('You changed tactics but should review player positions', 'warning', 4000);
    }

    // Persist new formation
    persistTeamState();
}

function getCurrentLinePlayerMap(team) {
    const map = { defense: [], midfield: [], attack: [] };
    ['defense','midfield','attack'].forEach(line => {
        const lineEl = document.querySelector(`.formation-line[data-line="${line}"]`);
        if (!lineEl) return;
        lineEl.querySelectorAll('.player-position .player-icon').forEach(icon => {
            const pid = icon.dataset.playerId;
            if (pid) map[line].push(pid);
        });
    });
    return map;
}

function formationPlayerMovementOccurred(beforeMap, afterMap) {
    // Simple string comparison for each line
    return ['defense','midfield','attack'].some(line => (beforeMap[line]||[]).join(',') !== (afterMap[line]||[]).join(','));
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
    populateTopScorersGroupSelector();
    populateTopScorersTeamSelector();
}

function populateStatisticsGroupSelector() {
    const groupSelect = document.getElementById('statistics-group-select');
    if (!groupSelect) return;
    
    groupSelect.innerHTML = '';
    
    groups.forEach(group => {
        const option = document.createElement('option');
        option.value = group.id;
        option.textContent = `${group.name} - ${group.description}`;
        groupSelect.appendChild(option);
    });
    
    // Set default selection based on defaults.json
    const defaultGroupId = defaults.defaultGroup || (groups.length > 0 ? groups[0].id : null);
    if (defaultGroupId) {
        selectedStatisticsGroupId = defaultGroupId;
        groupSelect.value = selectedStatisticsGroupId;
    }
}

function populateTopScorersGroupSelector() {
    const groupSelect = document.getElementById('topscorers-group-select');
    if (!groupSelect) return;
    
    groupSelect.innerHTML = '';
    
    groups.forEach(group => {
        const option = document.createElement('option');
        option.value = group.id;
        option.textContent = `${group.name} - ${group.description}`;
        groupSelect.appendChild(option);
    });
    
    // Set default selection based on defaults.json
    const defaultGroupId = defaults.defaultGroup || (groups.length > 0 ? groups[0].id : null);
    if (defaultGroupId) {
        groupSelect.value = defaultGroupId;
    }
}

function populateTopScorersTeamSelector() {
    const teamSelect = document.getElementById('topscorers-team-select');
    if (!teamSelect) return;
    
    teamSelect.innerHTML = '';
    
    // Group teams by their groups and add with headers
    groups.forEach(group => {
        // Add group header (optgroup)
        const optGroup = document.createElement('optgroup');
        optGroup.label = `${group.name} - ${group.description}`;
        
        // Add teams from this group
        const groupTeams = teams.filter(team => 
            group.teams.includes(team.id)
        ).sort((a, b) => a.name.localeCompare(b.name));
        
        groupTeams.forEach(team => {
            const option = document.createElement('option');
            option.value = team.id;
            option.textContent = team.name;
            optGroup.appendChild(option);
        });
        
        // Only add the optgroup if it has teams
        if (groupTeams.length > 0) {
            teamSelect.appendChild(optGroup);
        }
    });
}

function toggleAllStatistics() {
    const checkbox = document.getElementById('show-all-statistics');
    const groupSelect = document.getElementById('statistics-group-select');
    
    if (checkbox && groupSelect) {
        groupSelect.disabled = checkbox.checked;
        
        if (checkbox.checked) {
            selectedStatisticsGroupId = null;
        } else {
            // Set to default group when unchecked
            const defaultGroupId = defaults.defaultGroup || (groups.length > 0 ? groups[0].id : null);
            selectedStatisticsGroupId = defaultGroupId;
            groupSelect.value = selectedStatisticsGroupId;
        }
        
        updateTeamPerformanceAnalysis();
        updateStatisticalInsights();
    }
}

function toggleAllTopScorers() {
    const checkbox = document.getElementById('show-all-topscorers');
    const filterSelect = document.getElementById('topscorers-filter');
    const groupSelector = document.getElementById('topscorers-group-selector');
    const teamSelector = document.getElementById('topscorers-team-selector');
    
    if (checkbox && filterSelect && groupSelector) {
        filterSelect.disabled = checkbox.checked;
        
        if (checkbox.checked) {
            // Hide all specific selectors when showing all groups
            groupSelector.style.display = 'none';
            teamSelector.style.display = 'none';
        } else {
            // Show appropriate selector based on filter type
            updateTopScorersFilter();
        }
        
        updateTopScorers();
    }
}

function updateTopScorersFilter() {
    const filterSelect = document.getElementById('topscorers-filter');
    const groupSelector = document.getElementById('topscorers-group-selector');
    const teamSelector = document.getElementById('topscorers-team-selector');
    const checkbox = document.getElementById('show-all-topscorers');
    
    if (!filterSelect || !groupSelector || !teamSelector || !checkbox) return;
    
    // Don't change visibility if checkbox is checked
    if (checkbox.checked) return;
    
    const filterValue = filterSelect.value;
    
    if (filterValue === 'group') {
        groupSelector.style.display = 'flex';
        teamSelector.style.display = 'none';
    } else if (filterValue === 'team') {
        groupSelector.style.display = 'none';
        teamSelector.style.display = 'flex';
    }
    
    updateTopScorers();
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
        
        // Filter out teams that haven't played any games when All Groups is selected
        standings = standings.filter(team => team.played > 0);
    }
    
    const teamAnalysis = analyzeAllTeams(standings);
    
    // Sort by performance rating when All Groups is selected
    if (!selectedStatisticsGroupId) {
        teamAnalysis.sort((a, b) => b.performanceRating - a.performanceRating);
        // Update positions based on performance ranking
        teamAnalysis.forEach((team, index) => {
            team.performancePosition = index + 1;
        });
    }
    
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
        
        // Filter out teams that haven't played any games when All Groups is selected
        standings = standings.filter(team => team.played > 0);
    }
    
    const teamAnalysis = analyzeAllTeams(standings);
    content.innerHTML = generateStatisticalInsightsHTML(standings, teamAnalysis);
}

function updateTopScorers() {
    const content = document.getElementById('topscorers-content');
    const checkbox = document.getElementById('show-all-topscorers');
    const filterSelect = document.getElementById('topscorers-filter');
    const groupSelect = document.getElementById('topscorers-group-select');
    const teamSelect = document.getElementById('topscorers-team-select');
    
    if (!content || !checkbox || !filterSelect) return;
    
    let topScorers = [];
    let filterType = '';
    
    if (checkbox.checked) {
        // Show all groups
        topScorers = getTopScorersAllGroups();
        filterType = 'all';
    } else {
        // Filter by specific criteria
        const filterValue = filterSelect.value;
        
        if (filterValue === 'group') {
            const selectedGroup = groupSelect ? groupSelect.value : null;
            topScorers = getTopScorersForGroup(selectedGroup);
            filterType = 'group';
        } else if (filterValue === 'team') {
            const selectedTeam = teamSelect ? teamSelect.value : null;
            topScorers = getTopScorersForTeam(selectedTeam);
            filterType = 'team';
        }
    }
    
    content.innerHTML = generateTopScorersHTML(topScorers, filterType);
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
    if (!teamId) {
        // If no team selected, return empty array
        return [];
    }
    
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
            const groupSelect = document.getElementById('topscorers-group-select');
            const groupId = groupSelect ? groupSelect.value : null;
            const groupName = groups.find(g => g.id === groupId)?.name || 'Selected Group';
            title = `Top Scorers - ${groupName}`;
            break;
        case 'team':
            const teamSelect = document.getElementById('topscorers-team-select');
            const teamId = teamSelect ? teamSelect.value : null;
            const teamName = teams.find(t => t.id === teamId)?.name || 'Selected Team';
            title = `Top Scorers - ${teamName}`;
            break;
    }
    
    // Function to get medal emoji based on position
    function getMedalEmoji(position) {
        switch (position) {
            case 1: return '🥇';
            case 2: return '🥈';
            case 3: return '🥉';
            default: return '';
        }
    }
    
    return `
        <h4>${title}</h4>
        <div class="topscorers-list">
            ${topScorers.map((scorer, index) => {
                const position = index + 1;
                const medalEmoji = getMedalEmoji(position);
                return `
                <div class="topscorer-card ${index < 3 ? 'top-3' : ''}">
                    <div class="scorer-position">
                        ${medalEmoji}
                        <span class="position-number">${position}</span>
                    </div>
                    <div class="scorer-info">
                        <div class="scorer-name">${scorer.playerName}</div>
                        <div class="scorer-team">${scorer.teamName} ${renderTeamBadge(scorer.teamId)}</div>
                        ${filterType === 'all' ? `<div class="scorer-group">${scorer.groupName}</div>` : ''}
                    </div>
                    <div class="scorer-goals">
                        <span class="goals-count">${scorer.totalGoals}</span>
                        <span class="goals-label">goal${scorer.totalGoals !== 1 ? 's' : ''}</span>
                    </div>
                </div>
                `;
            }).join('')}
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
        updateKnockoutDisclaimer();
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

// Initialize knockout dates from configuration
function initializeKnockoutDates() {
    const knockoutDateElement = document.getElementById('knockout-date');
    if (knockoutDateElement && defaults.knockout && defaults.knockout.dateTimeFormatted) {
        knockoutDateElement.textContent = defaults.knockout.dateTimeFormatted;
    }
    
    // Optionally update the title if configured
    const knockoutHeader = document.querySelector('.knockout-header h3');
    if (knockoutHeader && defaults.knockout && defaults.knockout.title) {
        knockoutHeader.textContent = defaults.knockout.title;
    }
}

// Function to update the knockout stage with current group winners
function updateKnockoutStage() {
    logger.log('DEBUG: Updating knockout stage');
    
    // Load knockout date and title from defaults configuration (ensure it's always updated)
    const knockoutDateElement = document.getElementById('knockout-date');
    if (knockoutDateElement && defaults.knockout && defaults.knockout.dateTimeFormatted) {
        knockoutDateElement.textContent = defaults.knockout.dateTimeFormatted;
    }
    
    const knockoutHeader = document.querySelector('.knockout-header h3');
    if (knockoutHeader && defaults.knockout && defaults.knockout.title) {
        knockoutHeader.textContent = defaults.knockout.title;
    }
    
    // Update knockout venue information
    updateKnockoutVenues();
    
    // Update disclaimer
    updateKnockoutDisclaimer();
    
    // Get winners for each group
    const groupAWinner = getGroupWinner('group-a');
    const groupBWinner = getGroupWinner('group-b');
    const groupCWinner = getGroupWinner('group-c');
    const groupDWinner = getGroupWinner('group-d');
    
    logger.log('DEBUG: Group winners:', {
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
    
    // Update knockout match displays and controls
    updateKnockoutMatch('semi1', groupAWinner, groupDWinner);
    updateKnockoutMatch('semi2', groupBWinner, groupCWinner);
    
    // Always update semi-final result displays (winners/losers in final and 3rd place)
    updateSemiFinalResultDisplays();
    
    // Update dependent matches based on results
    if (knockoutResults.semi1.played && knockoutResults.semi2.played) {
        const semi1Winner = teams.find(t => t.id === knockoutResults.semi1.winner);
        const semi1Loser = teams.find(t => t.id === knockoutResults.semi1.loser);
        const semi2Winner = teams.find(t => t.id === knockoutResults.semi2.winner);
        const semi2Loser = teams.find(t => t.id === knockoutResults.semi2.loser);
        
        updateKnockoutMatch('final', semi1Winner, semi2Winner);
        updateKnockoutMatch('third', semi1Loser, semi2Loser);
    }
}

function updateKnockoutDisclaimer() {
    const disclaimerElement = document.getElementById('knockout-disclaimer');
    if (!disclaimerElement) return;
    
    // Check if all group stage matches are complete
    const allGroupMatchesComplete = checkAllGroupMatchesComplete();
    
    if (allGroupMatchesComplete) {
        disclaimerElement.className = 'knockout-disclaimer success';
        disclaimerElement.innerHTML = '<strong>✅ Group Stage Complete!</strong><br>All group winners have been determined and knockout stage teams are finalized. Let the ball roll and the best team win!';
    } else {
        disclaimerElement.className = 'knockout-disclaimer warning';
        disclaimerElement.innerHTML = '<strong>⚠️ Group Stage In Progress...</strong><br>Group winners are not yet finalized. Complete all group matches to determine knockout stage participants.';
    }
}

function updateKnockoutDisclaimer() {
    const disclaimerElement = document.getElementById('knockout-disclaimer');
    if (!disclaimerElement) return;
    
    // Check overall group stage status (all groups)
    const globalStatus = checkQualificationStatus(); // null = check all groups
    
    const currentDate = new Date();
    
    if (globalStatus.allCompleted && globalStatus.lastFixtureDate && currentDate > globalStatus.lastFixtureDate) {
        // All matches completed and time has passed
        disclaimerElement.className = 'knockout-disclaimer success';
        disclaimerElement.innerHTML = `
            <strong>✅ Group Stage Complete!</strong><br>
            All group matches have been completed and qualification period has ended. Ready for knockout phase!
        `;
        disclaimerElement.style.display = 'block';
        
        logger.log('DEBUG: Knockout disclaimer - Group stage complete');
    } else if (globalStatus.allCompleted && globalStatus.lastFixtureDate && currentDate <= globalStatus.lastFixtureDate) {
        // All matches completed but waiting for time to pass
        disclaimerElement.className = 'knockout-disclaimer warning';
        disclaimerElement.innerHTML = `
            <strong>⏳ Group Stage Matches Complete!</strong><br>
            All group matches finished. Waiting for qualification period to end...
        `;
        disclaimerElement.style.display = 'block';
        
        logger.log('DEBUG: Knockout disclaimer - Matches complete, waiting for time');
    } else if (currentDate > globalStatus.lastFixtureDate) {
        // Time has passed but matches are missing
        disclaimerElement.className = 'knockout-disclaimer warning';
        disclaimerElement.innerHTML = `
            <strong>⚠️ Missing Match Results!</strong><br>
            Some group stage matches are still incomplete despite the scheduled time passing.
        `;
        disclaimerElement.style.display = 'block';
        
        logger.log('DEBUG: Knockout disclaimer - Missing results');
    } else {
        // Group stage still in progress
        disclaimerElement.className = 'knockout-disclaimer warning';
        disclaimerElement.innerHTML = `
            <strong>⚠️ Group Stage In Progress...</strong><br>
            Group stage matches are still ongoing. Knockout phase will begin once all groups are completed.
        `;
        disclaimerElement.style.display = 'block';
        
        logger.log('DEBUG: Knockout disclaimer - Group stage in progress');
    }
}

function updateKnockoutMatch(matchId, homeTeam, awayTeam) {
    const matchResult = knockoutResults[matchId];
    const isAdmin = config?.admin?.role === 'admin';
    
    // Update match teams if they're not set in the result
    if (homeTeam && awayTeam && (!matchResult.homeTeam || !matchResult.awayTeam)) {
        matchResult.homeTeam = homeTeam.id;
        matchResult.awayTeam = awayTeam.id;
    }
    
    // Update button visibility and score display
    const addBtn = document.getElementById(`${matchId}-add-btn`);
    const editBtn = document.getElementById(`${matchId}-edit-btn`);
    const scoreDisplay = document.getElementById(`${matchId}-score`);
    
    if (matchResult.played) {
        // Match has been played - show score and conditional edit button
        if (scoreDisplay) {
            scoreDisplay.textContent = `${matchResult.homeScore} - ${matchResult.awayScore}`;
        }
        
        if (addBtn) addBtn.style.display = 'none';
        
        // Show edit button only if admin and within edit window
        if (editBtn && isAdmin && isWithinEditWindow(matchResult.playedDate)) {
            editBtn.style.display = 'inline-block';
        } else if (editBtn) {
            editBtn.style.display = 'none';
        }
    } else {
        // Match not played - show add button if teams available and admin
        if (scoreDisplay) {
            scoreDisplay.textContent = ' - ';
        }
        
        if (editBtn) editBtn.style.display = 'none';
        
        if (addBtn && homeTeam && awayTeam && isAdmin) {
            addBtn.style.display = 'inline-block';
        } else if (addBtn) {
            addBtn.style.display = 'none';
        }
    }
}

function updateSemiFinalResultDisplays() {
    // Update third place match teams and final match teams
    const semi1LoserBox = document.getElementById('semifinal-1-loser');
    const semi2LoserBox = document.getElementById('semifinal-2-loser');
    const semi1WinnerBox = document.getElementById('semifinal-1-winner');
    const semi2WinnerBox = document.getElementById('semifinal-2-winner');
    
    // Update Semi-Final 1 results
    if (knockoutResults.semi1.played) {
        const winner = teams.find(t => t.id === knockoutResults.semi1.winner);
        const loser = teams.find(t => t.id === knockoutResults.semi1.loser);
        
        logger.log('DEBUG: Semi-Final 1 completed - Winner:', winner?.name, 'Loser:', loser?.name);
        
        // Update final match (winner goes to final)
        if (semi1WinnerBox && winner) {
            semi1WinnerBox.querySelector('.team-name').textContent = winner.name;
            semi1WinnerBox.title = winner.fullName || winner.name;
            // Update team-label to show actual team
            const semi1WinnerLabel = semi1WinnerBox.parentElement.querySelector('.team-label');
            if (semi1WinnerLabel) {
                semi1WinnerLabel.textContent = `${winner.name} (Semi-Final 1 Winner)`;
            }
        }
        
        // Update 3rd place match (loser goes to 3rd place)
        if (semi1LoserBox && loser) {
            semi1LoserBox.querySelector('.team-name').textContent = loser.name;
            semi1LoserBox.title = loser.fullName || loser.name;
            // Update team-label to show actual team
            const semi1LoserLabel = semi1LoserBox.parentElement.querySelector('.team-label');
            if (semi1LoserLabel) {
                semi1LoserLabel.textContent = `${loser.name} (Semi-Final 1 Loser)`;
            }
        }
    } else {
        // Reset to default if not played
        if (semi1WinnerBox) {
            semi1WinnerBox.querySelector('.team-name').textContent = 'TBD';
            const semi1WinnerLabel = semi1WinnerBox.parentElement.querySelector('.team-label');
            if (semi1WinnerLabel) {
                semi1WinnerLabel.textContent = 'Winner of Semi-Final 1';
            }
        }
        if (semi1LoserBox) {
            semi1LoserBox.querySelector('.team-name').textContent = 'TBD';
            const semi1LoserLabel = semi1LoserBox.parentElement.querySelector('.team-label');
            if (semi1LoserLabel) {
                semi1LoserLabel.textContent = 'Loser of Semi-Final 1';
            }
        }
    }
    
    // Update Semi-Final 2 results
    if (knockoutResults.semi2.played) {
        const winner = teams.find(t => t.id === knockoutResults.semi2.winner);
        const loser = teams.find(t => t.id === knockoutResults.semi2.loser);
        
        logger.log('DEBUG: Semi-Final 2 completed - Winner:', winner?.name, 'Loser:', loser?.name);
        
        // Update final match (winner goes to final)
        if (semi2WinnerBox && winner) {
            semi2WinnerBox.querySelector('.team-name').textContent = winner.name;
            semi2WinnerBox.title = winner.fullName || winner.name;
            // Update team-label to show actual team
            const semi2WinnerLabel = semi2WinnerBox.parentElement.querySelector('.team-label');
            if (semi2WinnerLabel) {
                semi2WinnerLabel.textContent = `${winner.name} (Semi-Final 2 Winner)`;
            }
        }
        
        // Update 3rd place match (loser goes to 3rd place)
        if (semi2LoserBox && loser) {
            semi2LoserBox.querySelector('.team-name').textContent = loser.name;
            semi2LoserBox.title = loser.fullName || loser.name;
            // Update team-label to show actual team
            const semi2LoserLabel = semi2LoserBox.parentElement.querySelector('.team-label');
            if (semi2LoserLabel) {
                semi2LoserLabel.textContent = `${loser.name} (Semi-Final 2 Loser)`;
            }
        }
    } else {
        // Reset to default if not played
        if (semi2WinnerBox) {
            semi2WinnerBox.querySelector('.team-name').textContent = 'TBD';
            const semi2WinnerLabel = semi2WinnerBox.parentElement.querySelector('.team-label');
            if (semi2WinnerLabel) {
                semi2WinnerLabel.textContent = 'Winner of Semi-Final 2';
            }
        }
        if (semi2LoserBox) {
            semi2LoserBox.querySelector('.team-name').textContent = 'TBD';
            const semi2LoserLabel = semi2LoserBox.parentElement.querySelector('.team-label');
            if (semi2LoserLabel) {
                semi2LoserLabel.textContent = 'Loser of Semi-Final 2';
            }
        }
    }
}

// New knockout match result functions
function addKnockoutResult(matchId) {
    const matchResult = knockoutResults[matchId];
    if (!matchResult.homeTeam || !matchResult.awayTeam) {
        showToast('Teams not available for this match yet', 'error');
        return;
    }
    
    const homeTeam = teams.find(t => t.id === matchResult.homeTeam);
    const awayTeam = teams.find(t => t.id === matchResult.awayTeam);
    
    // Create modal for score input
    showKnockoutScoreModal(matchId, homeTeam, awayTeam, false);
}

function editKnockoutResult(matchId) {
    const matchResult = knockoutResults[matchId];
    if (!matchResult.played) return;
    
    const homeTeam = teams.find(t => t.id === matchResult.homeTeam);
    const awayTeam = teams.find(t => t.id === matchResult.awayTeam);
    
    // Create modal for score editing
    showKnockoutScoreModal(matchId, homeTeam, awayTeam, true);
}

function showKnockoutScoreModal(matchId, homeTeam, awayTeam, isEdit) {
    const matchResult = knockoutResults[matchId];
    const action = isEdit ? 'Edit' : 'Add';
    
    const modalHTML = `
        <div class="score-modal-overlay" id="knockout-score-modal">
            <div class="score-modal">
                <div class="score-modal-header">
                    <h3>${action} ${matchResult.name} Result</h3>
                    <button class="modal-close" onclick="closeKnockoutScoreModal()">×</button>
                </div>
                <div class="score-modal-body">
                    <div class="teams-display">
                        <div class="team-section">
                            <div class="team-name">${homeTeam.name}</div>
                            <input type="number" id="knockout-home-score" min="0" max="99" 
                                   placeholder="0" value="${isEdit ? matchResult.homeScore : ''}" 
                                   class="score-input">
                        </div>
                        <div class="vs-section">
                            <span class="vs-text">VS</span>
                        </div>
                        <div class="team-section">
                            <div class="team-name">${awayTeam.name}</div>
                            <input type="number" id="knockout-away-score" min="0" max="99" 
                                   placeholder="0" value="${isEdit ? matchResult.awayScore : ''}" 
                                   class="score-input">
                        </div>
                    </div>
                    <div class="modal-actions">
                        <button class="cancel-btn" onclick="closeKnockoutScoreModal()">Cancel</button>
                        <button class="save-btn" onclick="saveKnockoutScoreModal('${matchId}', ${isEdit})">
                            ${action} Result
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Remove existing modal if present
    const existingModal = document.getElementById('knockout-score-modal');
    if (existingModal) {
        existingModal.remove();
    }
    
    // Add modal to DOM
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    // Focus on first input
    setTimeout(() => {
        document.getElementById('knockout-home-score').focus();
    }, 100);
}

function closeKnockoutScoreModal() {
    const modal = document.getElementById('knockout-score-modal');
    if (modal) {
        modal.remove();
    }
}

function saveKnockoutScoreModal(matchId, isEdit) {
    const homeScore = parseInt(document.getElementById('knockout-home-score').value);
    const awayScore = parseInt(document.getElementById('knockout-away-score').value);
    
    if (isNaN(homeScore) || isNaN(awayScore) || homeScore < 0 || awayScore < 0) {
        showToast('Please enter valid scores (0 or higher)', 'error');
        return;
    }
    
    const matchResult = knockoutResults[matchId];
    matchResult.homeScore = homeScore;
    matchResult.awayScore = awayScore;
    matchResult.played = true;
    matchResult.playedDate = new Date().toISOString();
    
    // Determine winner and loser
    if (homeScore > awayScore) {
        matchResult.winner = matchResult.homeTeam;
        matchResult.loser = matchResult.awayTeam;
    } else if (awayScore > homeScore) {
        matchResult.winner = matchResult.awayTeam;
        matchResult.loser = matchResult.homeTeam;
    } else {
        // For ties, we'll need penalty shootout logic - for now, home team wins
        matchResult.winner = matchResult.homeTeam;
        matchResult.loser = matchResult.awayTeam;
        showToast('Tie game - home team advances on penalties', 'info');
    }
    
    // Close modal
    closeKnockoutScoreModal();
    
    // Download updated knockout results
    downloadKnockoutResults();
    
    // Update knockout stage display
    updateKnockoutStage();
    
    // Check if this is the final match and trigger celebration
    if (matchId === 'final') {
        triggerChampionshipCelebration(matchResult);
    }
    
    // Show success message
    const homeTeam = teams.find(t => t.id === matchResult.homeTeam);
    const awayTeam = teams.find(t => t.id === matchResult.awayTeam);
    const teamNames = `${homeTeam?.name || 'Team'} vs ${awayTeam?.name || 'Team'}`;
    
    if (isMobileDevice()) {
        showToast(`${matchResult.name} result saved! (${teamNames}: ${homeScore}-${awayScore})`, 'success');
    } else {
        showToast(`${matchResult.name} result saved! Check Downloads → Replace data/knockout-results.json → Refresh page`, 'success');
    }
}

function isWithinEditWindow(playedDate) {
    if (!playedDate) return true; // If no date recorded, allow editing
    
    const played = new Date(playedDate);
    const now = new Date();
    
    // Allow editing until midnight of the same day
    const playedMidnight = new Date(played);
    playedMidnight.setHours(23, 59, 59, 999);
    
    return now <= playedMidnight;
}

function downloadKnockoutResults() {
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || window.innerWidth <= 768;
    if (isMobile) {
        showToast('Download is not available on mobile devices.', 'warning', 4000);
        return;
    }
    const dataStr = JSON.stringify(knockoutResults, null, 2);
    const dataBlob = new Blob([dataStr], {type: 'application/json'});
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'knockout-results.json';
    link.click();
    URL.revokeObjectURL(url);
}

// Championship Celebration Functions
function triggerChampionshipCelebration(finalResult) {
    // Check if current time is past the game time
    const currentTime = new Date();
    const gameTime = new Date(finalResult.playedDate);
    
    if (currentTime <= gameTime) {
        logger.log('DEBUG: Championship celebration skipped - game time not yet passed');
        return;
    }
    
    // Get the championship winner
    const championTeam = teams.find(t => t.id === finalResult.winner);
    if (!championTeam) {
        logger.log('ERROR: Championship team not found');
        return;
    }
    
    logger.log('DEBUG: Triggering championship celebration for:', championTeam.name);
    
    // Start the celebration sequence
    setTimeout(() => {
        showChampionshipCelebration(championTeam, finalResult);
    }, 1000); // Delay to let the UI update first
}

function showChampionshipCelebration(championTeam, finalResult) {
    // Create celebration overlay
    const celebrationHTML = `
        <div class="championship-overlay" id="championship-celebration">
            <div class="confetti-container" id="confetti-container"></div>
            <div class="celebration-content">
                <div class="trophy-animation">
                    <div class="trophy">🏆</div>
                </div>
                <div class="champion-announcement">
                    <h1 class="champion-title">CHAMPIONS!</h1>
                    <h2 class="champion-team">${championTeam.name}</h2>
                    <p class="champion-subtitle">${championTeam.fullName || championTeam.name}</p>
                    <div class="final-score">
                        Final Score: ${finalResult.homeScore} - ${finalResult.awayScore}
                    </div>
                </div>
                <button class="celebration-close" onclick="closeChampionshipCelebration()">
                    Continue
                </button>
            </div>
        </div>
    `;
    
    // Add celebration to DOM
    document.body.insertAdjacentHTML('beforeend', celebrationHTML);
    
    // Start confetti animation
    createConfetti();
    
    // Add trophy to winner's team box
    setTimeout(() => {
        addTrophyToWinner(championTeam);
    }, 2000);
    
    // Auto-close after 10 seconds if not manually closed
    setTimeout(() => {
        const celebration = document.getElementById('championship-celebration');
        if (celebration) {
            closeChampionshipCelebration();
        }
    }, 10000);
}

function createConfetti() {
    const container = document.getElementById('confetti-container');
    if (!container) return;
    
    const colors = ['#FFD700', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#F0E68C'];
    const shapes = ['circle', 'square', 'triangle'];
    
    // Create 100 confetti pieces
    for (let i = 0; i < 100; i++) {
        setTimeout(() => {
            const confetti = document.createElement('div');
            confetti.className = `confetti ${shapes[Math.floor(Math.random() * shapes.length)]}`;
            confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
            confetti.style.left = Math.random() * 100 + '%';
            confetti.style.animationDelay = Math.random() * 3 + 's';
            confetti.style.animationDuration = (Math.random() * 3 + 2) + 's';
            container.appendChild(confetti);
            
            // Remove confetti after animation
            setTimeout(() => {
                if (confetti.parentNode) {
                    confetti.parentNode.removeChild(confetti);
                }
            }, 5000);
        }, i * 50); // Stagger the confetti creation
    }
}

function addTrophyToWinner(championTeam) {
    // Find the winner's team box in the final match
    // Check which team won the final match
    const homeTeam = teams.find(t => t.id === knockoutResults.final.homeTeam);
    const awayTeam = teams.find(t => t.id === knockoutResults.final.awayTeam);
    
    let winnerBox = null;
    
    if (knockoutResults.final.homeScore > knockoutResults.final.awayScore) {
        // Home team (semifinal-1-winner) won
        winnerBox = document.getElementById('semifinal-1-winner');
    } else {
        // Away team (semifinal-2-winner) won
        winnerBox = document.getElementById('semifinal-2-winner');
    }
    
    if (winnerBox && winnerBox.querySelector('.team-name').textContent === championTeam.name) {
        // Add trophy to the team box
        const trophy = document.createElement('div');
        trophy.className = 'winner-trophy';
        trophy.innerHTML = '🏆';
        winnerBox.appendChild(trophy);
        
        // Add champion styling to the team box
        winnerBox.classList.add('champion-team-box');
    }
}

function closeChampionshipCelebration() {
    const celebration = document.getElementById('championship-celebration');
    if (celebration) {
        celebration.classList.add('celebration-closing');
        setTimeout(() => {
            celebration.remove();
        }, 500);
    }
}

// Robust parser for predicted score strings like "3-1" or "3 - 1" or with extra spaces
function parsePredictedScore(scoreStr) {
    if (typeof scoreStr !== 'string') return { home: 0, away: 0 };
    const match = scoreStr.trim().match(/^(\d+)\s*-\s*(\d+)$/);
    if (!match) {
        // Attempt fallback: remove spaces then split on '-'
        const compact = scoreStr.replace(/\s+/g, '');
        const parts = compact.split('-');
        if (parts.length === 2) {
            const h = parseInt(parts[0], 10);
            const a = parseInt(parts[1], 10);
            return { home: Number.isFinite(h) ? h : 0, away: Number.isFinite(a) ? a : 0 };
        }
        return { home: 0, away: 0 };
    }
    const home = parseInt(match[1], 10);
    const away = parseInt(match[2], 10);
    return { home, away };
}

// Dark Mode Toggle
function toggleDarkMode() {
    const body = document.body;
    const icon = document.querySelector('.dark-mode-icon');
    
    body.classList.toggle('dark-mode');
    
    // Update icon
    if (body.classList.contains('dark-mode')) {
        icon.textContent = '☀️';
        localStorage.setItem('darkMode', 'enabled');
    } else {
        icon.textContent = '🌙';
        localStorage.setItem('darkMode', 'disabled');
    }
}

// Initialize dark mode from localStorage and config
function initializeDarkMode() {
    const darkModeToggle = document.getElementById('dark-mode-toggle');
    
    // Check if dark mode is enabled in config
    if (!config?.ui?.enableDarkMode) {
        if (darkModeToggle) {
            darkModeToggle.style.display = 'none';
        }
        return;
    }
    
    // Check localStorage for user preference
    const darkModePreference = localStorage.getItem('darkMode');
    const icon = document.querySelector('.dark-mode-icon');
    
    if (darkModePreference === 'enabled') {
        document.body.classList.add('dark-mode');
        if (icon) icon.textContent = '☀️';
    }
}

// Update knockout stage venue information
function updateKnockoutVenues() {
    if (!config?.knockout?.venue) return;
    
    const venueInfo = config.knockout.venue;
    const venueHTML = `<a href="${venueInfo.googleMapsUrl}" target="_blank" rel="noopener noreferrer" class="venue-link" title="${venueInfo.name}"><span class="venue-icon">📍</span>${venueInfo.name}</a>`;
    
    // Update all knockout match venues (they all share the same venue)
    const venueElements = ['semi1-venue', 'semi2-venue', 'final-venue', 'third-venue'];
    
    venueElements.forEach(elementId => {
        const element = document.getElementById(elementId);
        if (element) {
            element.innerHTML = venueHTML;
        }
    });
}

// Determine team company (CSW / CTW) from teams list using league field
function getTeamCompany(teamId) {
    const team = teams.find(t => t.id === teamId);
    if (!team) return 'unknown';
    const league = (team.league || '').toUpperCase();
    if (league === 'CSW') return 'csw';
    if (league === 'CTW') return 'ctw';
    return 'unknown';
}

// Render HTML badge for team; large=true gives bigger badge for projection cards
function renderTeamBadge(teamId, large = false) {
    const company = getTeamCompany(teamId);
    const label = company === 'csw' ? 'CSW' : company === 'ctw' ? 'CTW' : '?';
    const sizeClass = large ? 'large' : '';
    return `<span class="team-company-badge company-${company} ${sizeClass}" title="${company.toUpperCase()}">${label}</span>`;
}

