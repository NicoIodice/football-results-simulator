// Login Page Script
import { authenticate, isAuthenticated } from './auth.js';

// Check if already authenticated
if (isAuthenticated()) {
    window.location.href = '/pages/tournaments.html';
}

const loginForm = document.getElementById('loginForm');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const loginBtn = document.getElementById('loginBtn');
const alert = document.getElementById('alert');

// Clear error on input
usernameInput.addEventListener('input', () => {
    clearFieldError('username');
});

passwordInput.addEventListener('input', () => {
    clearFieldError('password');
});

// Handle form submission
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Clear previous errors
    clearAllErrors();

    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();

    // Validation
    let hasError = false;

    if (!username) {
        showFieldError('username', 'Username is required');
        hasError = true;
    }

    if (!password) {
        showFieldError('password', 'Password is required');
        hasError = true;
    }

    if (hasError) {
        return;
    }

    // Show loading state
    loginBtn.classList.add('loading');
    loginBtn.disabled = true;

    try {
        // Authenticate
        const result = await authenticate(username, password);

        if (result.success) {
            showAlert('Login successful! Redirecting...', 'success');
            setTimeout(() => {
                window.location.href = '/pages/tournaments.html';
            }, 500);
        } else {
            showAlert(result.error || 'Invalid username or password', 'error');
            loginBtn.classList.remove('loading');
            loginBtn.disabled = false;
        }
    } catch (error) {
        showAlert('An error occurred. Please try again.', 'error');
        loginBtn.classList.remove('loading');
        loginBtn.disabled = false;
    }
});

function showFieldError(field, message) {
    const input = document.getElementById(field);
    const errorDiv = document.getElementById(`${field}-error`);
    input.classList.add('error');
    errorDiv.textContent = message;
    errorDiv.classList.add('show');
}

function clearFieldError(field) {
    const input = document.getElementById(field);
    const errorDiv = document.getElementById(`${field}-error`);
    input.classList.remove('error');
    errorDiv.classList.remove('show');
}

function clearAllErrors() {
    clearFieldError('username');
    clearFieldError('password');
    alert.classList.remove('show');
}

function showAlert(message, type) {
    alert.textContent = message;
    alert.className = `alert alert-${type} show`;
}
