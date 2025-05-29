// Initialize Supabase client
const supabaseUrl = 'https://qlqhlqesxxyvdhaeiuxf.supabase.co'; // Replace with your actual Supabase URL
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFscWhscWVzeHh5dmRoYWVpdXhmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc4MjgwODAsImV4cCI6MjA2MzQwNDA4MH0.vKQF9_5byQUXk8CPbg0FN73I_OiB4K_t4-cAP5T6YS8'; // Replace with your actual Supabase anon key
const supabase = window.supabase.createClient(supabaseUrl, supabaseKey);

// State variables
let isLoading = false;
let currentUser = null;

// DOM elements
const loginForm = document.getElementById('adminLoginForm');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const loginBtn = document.getElementById('loginBtn');
const btnText = document.querySelector('.btn-text');
const loadingSpinner = document.querySelector('.loading-spinner');
const errorMessage = document.getElementById('errorMessage');

// Initialize
document.addEventListener('DOMContentLoaded', function() {
    // Check if user is already logged in
    checkExistingSession();
    
    // Add form event listener
    loginForm.addEventListener('submit', handleLogin);
});

async function checkExistingSession() {
    try {
        console.log('Checking for existing admin session...');
        
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError) {
            console.error('Error getting session:', sessionError);
            return;
        }
        
        if (session && session.user) {
            console.log('Active session found for user:', session.user.email);
            currentUser = session.user;
            
            // Check if the logged-in user is an admin
            await verifyAdminRole();
        } else {
            console.log('No active session found');
        }
    } catch (error) {
        console.error('Error checking existing session:', error);
    }
}

async function handleLogin(event) {
    event.preventDefault();
    
    if (isLoading) return;
    
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    
    // Basic validation
    if (!email || !password) {
        showError('Please fill in all fields.');
        return;
    }
    
    if (!isValidEmail(email)) {
        showError('Please enter a valid email address.');
        return;
    }
    
    setLoading(true);
    hideError();
    
    try {
        // Attempt to sign in with Supabase
        const { data, error } = await supabase.auth.signInWithPassword({
            email: email,
            password: password
        });
        
        if (error) {
            throw error;
        }
        
        if (data.user) {
            currentUser = data.user;
            console.log('Login successful:', data.user.email);
            
            // Proceed to admin role verification
            await verifyAdminRole();
        } else {
            throw new Error('No user data returned from login.');
        }
        
    } catch (error) {
        console.error('Login error:', error);
        
        // Handle specific error types
        if (error.message.includes('Invalid login credentials') || 
            error.message.includes('Email not confirmed')) {
            showError('Invalid email or password. Please check your credentials.');
        } else if (error.message.includes('Email not confirmed')) {
            showError('Please verify your email address before logging in.');
        } else if (error.message.includes('Too many requests')) {
            showError('Too many login attempts. Please wait a moment before trying again.');
        } else {
            showError(error.message || 'An error occurred during login. Please try again.');
        }
    } finally {
        setLoading(false);
    }
}

async function verifyAdminRole() {
    if (!currentUser) {
        showError('User session not found.');
        return;
    }
    
    try {
        // Get the current session to access the JWT token
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError || !session) {
            throw new Error('No valid session found');
        }
        
        // Call the is-user-admin Edge Function with proper JWT authorization
        const response = await fetch(`${supabaseUrl}/functions/v1/is-user-admin`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${session.access_token}`,
                'Content-Type': 'application/json',
                'apikey': supabaseKey
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        
        if (result.error) {
            throw new Error(result.error);
        }
        
        if (result.isAdmin === true) {
            // User is admin, redirect to admin moderation page
            console.log('Admin access granted for user:', currentUser.email);
            showSuccess('Login successful! Redirecting to admin panel...');
            
            // Redirect to admin moderation page after a brief delay
            setTimeout(() => {
                window.location.href = '/admin-moderation.html';
            }, 1500);
        } else {
            // User is not admin
            showError('Login successful, but you do not have admin privileges.');
            console.log('Admin access denied for user:', currentUser.email);
            
            // Sign out the user to prevent confusion
            await supabase.auth.signOut();
            currentUser = null;
        }
        
    } catch (error) {
        console.error('Admin verification error:', error);
        
        // Handle specific error cases
        if (error.message.includes('HTTP error')) {
            showError('Could not verify admin status. Please try again.');
        } else if (error.message.includes('No valid session')) {
            showError('Session expired. Please log in again.');
        } else {
            showError('Could not verify admin status. Please try again.');
        }
        
        // Sign out the user on verification errors
        try {
            await supabase.auth.signOut();
            currentUser = null;
        } catch (signOutError) {
            console.error('Error signing out user:', signOutError);
        }
    }
}

function setLoading(loading) {
    isLoading = loading;
    loginBtn.disabled = loading;
    
    if (loading) {
        btnText.style.display = 'none';
        loadingSpinner.style.display = 'inline-block';
    } else {
        btnText.style.display = 'inline';
        loadingSpinner.style.display = 'none';
    }
}

function showError(message) {
    errorMessage.textContent = message;
    errorMessage.style.display = 'block';
    errorMessage.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function hideError() {
    errorMessage.style.display = 'none';
}

function showSuccess(message) {
    errorMessage.textContent = message;
    errorMessage.style.display = 'block';
    errorMessage.style.background = '#f0f9ff';
    errorMessage.style.borderColor = '#93c5fd';
    errorMessage.style.color = '#1d4ed8';
}

function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

// Handle auth state changes
supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') {
        currentUser = null;
        console.log('User signed out');
    }
});
