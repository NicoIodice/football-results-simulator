/**
 * Error handling utilities
 * Provides consistent error handling and user feedback
 */

/**
 * Handle errors with toast notifications
 * @param {string|Error} error - The error to handle
 */
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
    
    // Show toast notification (assumes showToast function exists in main script)
    if (typeof showToast === 'function') {
        showToast(message, type, 5000); // Show for 5 seconds for errors
    } else {
        console.error('Toast function not available:', message);
    }
}

/**
 * Enhanced error wrapper for async functions
 * @param {Function} fn - The async function to wrap
 * @returns {Function} - Wrapped function with error handling
 */
function withErrorHandling(fn) {
    return async function(...args) {
        try {
            return await fn.apply(this, args);
        } catch (error) {
            if (typeof logger !== 'undefined') {
                logger.error('Function error:', error);
            } else {
                console.error('Function error:', error);
            }
            handleError(error);
            throw error; // Re-throw so caller can handle if needed
        }
    };
}

// Export for use in other modules
export { handleError, withErrorHandling };
