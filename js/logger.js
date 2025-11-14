/**
 * Centralized logging system that respects debug mode setting
 * Provides consistent logging across the application
 */

import { handleError } from './errorHandler.js';
import { appSettings } from './dataLoader.js';

const logger = {
    error: (...args) => {
        // Always show errors regardless of debug mode
        console.error(...args);
        // Don't call handleError automatically to avoid circular dependencies
        // and issues during initialization when showToast might not be available
    },
    warn: (...args) => {
        if (appSettings?.ui?.enableDebugMode) {
            console.warn(...args);
        }
    },
    info: (...args) => {
        if (appSettings?.ui?.enableDebugMode) {
            console.info(...args);
        }
    },
    log: (...args) => {
        if (appSettings?.ui?.enableDebugMode) {
            console.log(...args);
        }
    },
    debug: (...args) => {
        if (appSettings?.ui?.enableDebugMode) {
            console.debug(...args);
        }
    }
};

// Export for use in other modules
export { logger };