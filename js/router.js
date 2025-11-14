// Router Module for URL-based navigation
import { logger } from './logger.js';

let currentRoute = '/overview';

/**
 * Initialize the router
 */
function initRouter() {
    logger.log('Initializing router');
    
    // Listen for hash changes
    window.addEventListener('hashchange', handleRouteChange);
    
    // Handle initial route
    handleRouteChange();
}

/**
 * Handle route changes
 */
function handleRouteChange() {
    const hash = window.location.hash;
    const route = hash.substring(1) || '/overview'; // Remove # and default to /overview
    
    logger.log('Route changed to:', route);
    navigateToRoute(route);
}

/**
 * Navigate to a specific route
 */
function navigateToRoute(route) {
    // Remove leading slash if present
    const cleanRoute = route.startsWith('/') ? route.substring(1) : route;
    
    logger.log('Navigating to route:', cleanRoute);
    
    // Map routes to tab names
    const routeMap = {
        'overview': 'overview',
        'teams': 'teams',
        'fixtures': 'fixtures',
        'forecast': 'forecast',
        'simulator': 'simulator'
    };
    
    const tabName = routeMap[cleanRoute];
    
    if (tabName) {
        currentRoute = '/' + cleanRoute;
        
        // Trigger tab change if showTab is available
        if (typeof window.showTab === 'function') {
            window.showTab(tabName);
        } else {
            logger.warn('showTab function not available yet');
        }
    } else {
        logger.warn('Invalid route:', cleanRoute, '- redirecting to overview');
        window.location.hash = '/overview';
    }
}

/**
 * Update URL without triggering navigation
 */
function updateURL(route) {
    const newHash = route.startsWith('/') ? route : '/' + route;
    
    if (window.location.hash !== '#' + newHash) {
        logger.log('Updating URL to:', newHash);
        currentRoute = newHash;
        window.location.hash = newHash;
    }
}

/**
 * Get current route
 */
function getCurrentRoute() {
    return currentRoute;
}

export {
    initRouter,
    navigateToRoute,
    updateURL,
    getCurrentRoute
};
