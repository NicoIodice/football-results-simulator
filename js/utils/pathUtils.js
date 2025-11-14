/**
 * Path utilities for handling routing in both local and GitHub Pages environments
 */

/**
 * Get the base path for the application
 * In GitHub Pages: /{repo-name}/
 * Locally: /
 */
function getBasePath() {
    const path = window.location.pathname;
    
    // Check if we're in GitHub Pages (has repo name in path)
    // GitHub Pages pattern: /repo-name/... or /repo-name/pages/...
    const pathParts = path.split('/').filter(p => p);
    
    // If we're in GitHub Pages, the first part is the repo name
    // We can detect this by checking if we're not on localhost and have path segments
    if (window.location.hostname !== 'localhost' && 
        window.location.hostname !== '127.0.0.1' && 
        pathParts.length > 0 && 
        !pathParts[0].endsWith('.html')) {
        return `/${pathParts[0]}/`;
    }
    
    return '/';
}

/**
 * Get a path relative to the base path
 * @param {string} path - The path to resolve (e.g., 'pages/app.html' or '/pages/app.html')
 * @returns {string} - The resolved path
 */
function resolvePath(path) {
    const basePath = getBasePath();
    
    // Remove leading slash if present
    const cleanPath = path.startsWith('/') ? path.substring(1) : path;
    
    // Combine base path with clean path
    return basePath + cleanPath;
}

/**
 * Navigate to a path
 * @param {string} path - The path to navigate to
 */
function navigateTo(path) {
    window.location.href = resolvePath(path);
}

export {
    getBasePath,
    resolvePath,
    navigateTo
};
