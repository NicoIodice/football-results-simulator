/**
 * Data loading utilities
 * Handles loading data from various sources (local files, remote APIs, etc.)
 */

import { resolvePath } from './utils/pathUtils.js';

// Supported data loading methods
const DATA_LOADING_METHODS = {
    LOCAL_FILE: 'local-file',        // Load from local JSON files
    LOCAL_DB: 'local-db',            // Load from local database (IndexedDB, etc.)
    REMOTE_API: 'remote-api',        // Load from remote API
    REMOTE_DROPBOX: 'remote-dropbox', // Load from Dropbox
    REMOTE_GITHUB: 'remote-github'   // Load from GitHub
};

// Global reference to appSettings (will be set by main script)
let appSettings = null;

// Set app settings reference for logger
function setAppSettings(settings) {
    appSettings = settings;
}

/**
 * Validate if the loading method is supported
 * @param {string} method - The loading method to validate
 * @returns {boolean} - True if method is supported
 */
function isValidLoadingMethod(method) {
    return Object.values(DATA_LOADING_METHODS).includes(method);
}

/**
 * Get the current loading method from app settings
 * @param {Object} appSettings - Application settings object
 * @returns {string} - The loading method (defaults to LOCAL_FILE)
 */
function getLoadingMethod(appSettings) {
    const method = appSettings?.data?.loadingMethod || DATA_LOADING_METHODS.LOCAL_FILE;
    
    if (!isValidLoadingMethod(method)) {
        if (typeof logger !== 'undefined') {
            logger.warn(`Invalid loading method '${method}', falling back to '${DATA_LOADING_METHODS.LOCAL_FILE}'`);
        }
        return DATA_LOADING_METHODS.LOCAL_FILE;
    }
    
    return method;
}

/**
 * Load data from local file
 * @param {string} filePath - Path to the JSON file
 * @returns {Promise<Object>} - The loaded data
 */
async function loadFromLocalFile(filePath) {
    // Use resolvePath to handle both local and GitHub Pages environments
    const finalPath = resolvePath(filePath);
    
    const response = await fetch(finalPath);
    if (!response.ok) {
        throw new Error(`Failed to load ${filePath}: HTTP ${response.status}`);
    }
    const data = await response.json();
    
    if (data === null || data === undefined) {
        throw new Error(`${filePath} returned null or undefined data`);
    }
    
    return data;
}

/**
 * Load data based on the configured loading method
 * @param {string} filePath - Path or identifier for the data
 * @param {string} loadingMethod - The loading method to use
 * @returns {Promise<Object>} - The loaded data
 */
async function loadData(filePath, loadingMethod = DATA_LOADING_METHODS.LOCAL_FILE) {
    try {
        switch (loadingMethod) {
            case DATA_LOADING_METHODS.LOCAL_FILE:
                return await loadFromLocalFile(filePath);
            
            case DATA_LOADING_METHODS.LOCAL_DB:
                throw new Error('Local database loading not yet implemented');
            
            case DATA_LOADING_METHODS.REMOTE_API:
                throw new Error('Remote API loading not yet implemented');
            
            case DATA_LOADING_METHODS.REMOTE_DROPBOX:
                throw new Error('Dropbox loading not yet implemented');
            
            case DATA_LOADING_METHODS.REMOTE_GITHUB:
                throw new Error('GitHub loading not yet implemented');
            
            default:
                throw new Error(`Unsupported loading method: ${loadingMethod}`);
        }
    } catch (error) {
        console.error(`Failed to load ${filePath}:`, error);
        throw error; // Re-throw so caller can handle it
    }
}

/**
 * Load app settings from app-settings.json
 * @param {string} loadingMethod - Optional loading method override
 * @returns {Promise<Object>} - Application settings
 */
async function loadAppSettings(loadingMethod = DATA_LOADING_METHODS.LOCAL_FILE) {
    try {
        const settings = await loadData('data/app-settings.json', loadingMethod);
        
        // Ensure data object exists
        if (!settings?.data) {
            logger.error('App settings missing data section, initializing to empty object');
            settings.data = {};
        }
        
        // Validate loading method in settings
        if (settings?.data?.loadingMethod) {
            if (!isValidLoadingMethod(settings.data.loadingMethod)) {
                if (typeof logger !== 'undefined') {
                    logger.warn(`Invalid loadingMethod in app-settings.json: '${settings.data.loadingMethod}'`);
                }
                // Set to default
                settings.data.loadingMethod = DATA_LOADING_METHODS.LOCAL_FILE;
            }
        } else {
            // Set default if not specified
            settings.data.loadingMethod = DATA_LOADING_METHODS.LOCAL_FILE;
        }
        
        return settings;
    } catch (e) {
        if (typeof logger !== 'undefined') {
            logger.error('Error loading app-settings.json:', e);
        }
        // Return default structure
        return {
            data: { loadingMethod: DATA_LOADING_METHODS.LOCAL_FILE },
            ui: {},
            admin: {},
            openAI: {}
        };
    }
}

/**
 * Load tournament settings from tournament-settings.json
 * @param {string} loadingMethod - The loading method to use
 * @returns {Promise<Object>} - Tournament settings
 */
async function loadTournamentSettings(loadingMethod = DATA_LOADING_METHODS.LOCAL_FILE) {
    try {
        const settings = await loadData('data/2025/futsal/tournament-settings.json', loadingMethod);
        
        // Set document title and header dynamically
        if (settings && settings.tournamentTitle && settings.tournamentSubTitle && settings.year) {
            const fullTitle = `${settings.tournamentTitle}: ${settings.tournamentSubTitle} ${settings.year}`;
            document.title = fullTitle;
            
            // Update header h1 and p
            const h1 = document.querySelector('header h1');
            if (h1) h1.textContent = `${settings.tournamentTitle} ${settings.year}`;
            const p = document.querySelector('header p');
            if (p) p.textContent = settings.tournamentSubTitle;
        }
        
        return settings;
    } catch (e) {
        if (typeof logger !== 'undefined') {
            logger.error('Error loading tournament-settings.json:', e);
        }
        // Return default structure
        return {
            tournamentTitle: 'Tournament',
            tournamentSubTitle: 'Manager',
            year: new Date().getFullYear()
        };
    }
}

/**
 * Load OpenAI API key from app-config.json
 * @param {string} loadingMethod - The loading method to use
 * @returns {Promise<string|null>} - The API key or null if not found
 */
async function loadOpenAIKeyFromConfig(loadingMethod = DATA_LOADING_METHODS.LOCAL_FILE) {
    try {
        const appConfig = await loadData('app-config.json', loadingMethod);
        const apiKey = appConfig.OPENAI_API_KEY;
        
        if (apiKey && apiKey !== 'your-api-key-here' && apiKey.trim()) {
            if (typeof logger !== 'undefined') {
                logger.log('✅ OpenRouter API key loaded from app-config.json');
            }
            return apiKey.trim();
        } else {
            if (typeof logger !== 'undefined') {
                logger.warn('⚠️ No valid OpenRouter API key found in app-config.json');
            }
            return null;
        }
    } catch (error) {
        if (typeof logger !== 'undefined') {
            logger.warn('⚠️ Could not load app-config.json:', error.message);
            logger.info('💡 Create an app-config.json file with: {"OPENAI_API_KEY": "your-openrouter-key-here"}');
        }
        return null;
    }
}

/**
 * Load OpenAI API key from .env file (fallback)
 * @returns {Promise<string|null>} - The API key or null if not found
 */
async function loadOpenAIKeyFromEnv() {
    try {
        const response = await fetch(resolvePath('.env'));
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const envContent = await response.text();
        const envLines = envContent.split('\n');
        
        for (const line of envLines) {
            if (line.startsWith('OPENAI_API_KEY=')) {
                const apiKey = line.split('=')[1].trim();
                if (apiKey && apiKey !== 'your-api-key-here') {
                    if (typeof logger !== 'undefined') {
                        logger.log('✅ OpenRouter API key loaded from .env file');
                    }
                    return apiKey;
                }
            }
        }
        
        if (typeof logger !== 'undefined') {
            logger.warn('⚠️ No valid OpenRouter API key found in .env file');
        }
        return null;
    } catch (error) {
        // Don't log .env errors since it's expected to fail often
        if (typeof logger !== 'undefined') {
            logger.debug('.env file not accessible via HTTP (this is normal)');
        }
        return null;
    }
}

/**
 * Load JSON data file (generic wrapper)
 * @param {string} filePath - Path to the JSON file
 * @param {string} loadingMethod - The loading method to use
 * @returns {Promise<Object>} - The loaded data
 */
async function loadJSONData(filePath, loadingMethod = DATA_LOADING_METHODS.LOCAL_FILE) {
    return await loadData(filePath, loadingMethod);
}

// Export for use in other modules
export {
    DATA_LOADING_METHODS,
    appSettings,
    setAppSettings,
    isValidLoadingMethod,
    getLoadingMethod,
    loadData,
    loadAppSettings,
    loadTournamentSettings,
    loadOpenAIKeyFromConfig,
    loadOpenAIKeyFromEnv,
    loadJSONData
};