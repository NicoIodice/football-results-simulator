// Authentication Module
import { handleError } from '../errorHandler.js';
import { logger } from '../logger.js';

/**
 * Check if user is authenticated
 */
function isAuthenticated() {
    const authToken = sessionStorage.getItem('authToken');
    const username = sessionStorage.getItem('username');
    return authToken && username;
}

/**
 * Authenticate user credentials
 */
async function authenticate(username, password) {
    try {
        logger.log('Attempting to authenticate user:', username);
        
        // Load users from users.json
        const response = await fetch('./data/users.json');
        if (!response.ok) {
            throw new Error('Failed to load user data');
        }
        
        const users = await response.json();
        
        // Check if user exists
        const userExists = users.find(u => u.username === username);
        
        if (!userExists) {
            logger.log('User not found:', username);
            return { success: false, error: 'User not found' };
        }
        
        // Check password
        if (userExists.password !== password) {
            logger.log('Incorrect password for user:', username);
            return { success: false, error: 'Incorrect password' };
        }
        
        // Authentication successful
        const authToken = btoa(`${username}:${Date.now()}`);
        
        // Store authentication data in sessionStorage
        sessionStorage.setItem('authToken', authToken);
        sessionStorage.setItem('username', username);
        
        logger.log('Authentication successful for user:', username);
        return { success: true, username };
    } catch (error) {
        logger.error('Authentication error:', error);
        return { success: false, error: 'An error occurred during authentication' };
    }
}

/**
 * Logout user
 */
function logout() {
    logger.log('Logging out user');
    sessionStorage.removeItem('authToken');
    sessionStorage.removeItem('username');
    window.location.href = '/';
}

/**
 * Require authentication - redirect to login if not authenticated
 */
function requireAuth() {
    if (!isAuthenticated()) {
        logger.log('User not authenticated, redirecting to login');
        window.location.href = '/';
        return false;
    }
    return true;
}

/**
 * Get current username
 */
function getCurrentUsername() {
    return sessionStorage.getItem('username');
}

export {
    isAuthenticated,
    authenticate,
    logout,
    requireAuth,
    getCurrentUsername
};
