// Initialize Supabase client
const supabaseUrl = 'https://qlqhlqesxxyvdhaeiuxf.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFscWhscWVzeHh5dmRoYWVpdXhmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc4MjgwODAsImV4cCI6MjA2MzQwNDA4MH0.vKQF9_5byQUXk8CPbg0FN73I_OiB4K_t4-cAP5T6YS8';
const supabase = window.supabase.createClient(supabaseUrl, supabaseKey);

// State variables
let currentUser = null;
let isLoading = false;
let pendingReports = [];

// DOM elements
const loadingState = document.getElementById('loadingState');
const mainContent = document.getElementById('mainContent');
const accessDenied = document.getElementById('accessDenied');
const reportsQueue = document.getElementById('reportsQueue');
const emptyState = document.getElementById('emptyState');
const errorMessage = document.getElementById('errorMessage');
const successMessage = document.getElementById('successMessage');
const refreshBtn = document.getElementById('refreshBtn');
const logoutBtn = document.getElementById('logoutBtn');
const adminEmail = document.getElementById('adminEmail');
const backToLoginBtn = document.getElementById('backToLoginBtn');
const pendingReportsCount = document.getElementById('pendingReportsCount');
const processedReportsCount = document.getElementById('processedReportsCount');

// Event listeners
document.addEventListener('DOMContentLoaded', initAdminPage);
refreshBtn?.addEventListener('click', loadPendingReports);
logoutBtn?.addEventListener('click', handleLogout);
backToLoginBtn?.addEventListener('click', redirectToLogin);

// Initialize admin page
async function initAdminPage() {
    try {
        console.log('Initializing review moderation page...');
        
        // Check if user is logged in
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        
        if (authError) {
            console.error('Authentication error:', authError);
            showError(`Authentication error: ${authError.message}`);
            redirectToLogin();
            return;
        }
        
        if (!user) {
            console.log('No authenticated user found');
            showError('No authenticated user found. Please log in.');
            redirectToLogin();
            return;
        }

        console.log('User authenticated:', user.email);
        currentUser = user;
        
        // Skip role check for testing - REMOVE THIS FOR PRODUCTION
        showMainContent();
        await loadPendingReports();
        
    } catch (error) {
        console.error('Initialization error:', error);
        showError(`Failed to initialize admin page: ${error.message}`);
        showAccessDenied();
    }
}

function showMainContent() {
    loadingState.style.display = 'none';
    accessDenied.style.display = 'none';
    mainContent.style.display = 'block';
    adminEmail.textContent = currentUser?.email || '';
}

function showAccessDenied() {
    loadingState.style.display = 'none';
    mainContent.style.display = 'none';
    accessDenied.style.display = 'block';
}

function redirectToLogin() {
    window.location.href = 'admin-login.html';
}

function showError(message) {
    console.error('Error:', message);
    errorMessage.textContent = message;
    errorMessage.style.display = 'block';
    setTimeout(() => {
        errorMessage.style.display = 'none';
    }, 5000);
}

function showSuccess(message) {
    console.log('Success:', message);
    successMessage.textContent = message;
    successMessage.style.display = 'block';
    setTimeout(() => {
        successMessage.style.display = 'none';
    }, 3000);
}

// Load all pending review reports
async function loadPendingReports() {
    if (isLoading) return;
    
    isLoading = true;
    refreshBtn.disabled = true;
    emptyState.style.display = 'none';
    reportsQueue.innerHTML = '<div class="loading-message">Loading reports...</div>';

    try {
        console.log('Loading pending reports...');
        
        // Query for all pending reports
        const { data: reports, error } = await supabase
            .from('review_reports')
            .select('*')
            .eq('status', 'pending')
            .order('created_at', { ascending: true });

        if (error) {
            console.error('Database error:', error);
            throw error;
        }

        console.log('Reports loaded:', reports);
        pendingReports = reports || [];
        renderReports(pendingReports);
        updateStatistics();
        
    } catch (error) {
        console.error('Error loading reports:', error);
        reportsQueue.innerHTML = `<div class="error-message">Failed to load reports: ${error.message || 'Unknown error'}</div>`;
        showError(`Failed to load reports: ${error.message || 'Unknown error'}`);
    } finally {
        isLoading = false;
        refreshBtn.disabled = false;
    }
}

// Render pending reports
function renderReports(reports) {
    if (!reports || reports.length === 0) {
        emptyState.style.display = 'block';
        reportsQueue.innerHTML = '';
        return;
    }
    
    emptyState.style.display = 'none';
    reportsQueue.innerHTML = '';

    reports.forEach(report => {
        const reportCard = createReportCard(report);
        reportsQueue.appendChild(reportCard);
    });

    // Add event listeners to dynamically created buttons
    attachEventListeners();
}

function createReportCard(report) {
    const reportCard = document.createElement('div');
    reportCard.className = 'report-card';
    reportCard.dataset.id = report.id;

    reportCard.innerHTML = `
        <div class="report-header">
            <span class="report-title">Report #${report.id.substring(0, 8)}</span>
            <span class="report-date">${new Date(report.created_at).toLocaleDateString()}</span>
        </div>
        <div class="report-content">
            <div class="report-details">
                <h3>Report Reason:</h3>
                <p class="reason-text">${escapeHtml(report.reason)}</p>
                ${report.additional_details ? `<h3>Additional Details:</h3><p class="details-text">${escapeHtml(report.additional_details)}</p>` : ''}
                <p><strong>Reported by User ID:</strong> ${report.reported_by_user_id || 'Unknown'}</p>
                <p><strong>Review ID:</strong> ${report.review_id}</p>
            </div>
        </div>
        <div class="report-actions">
            <textarea class="admin-notes" placeholder="Add admin notes (optional)" rows="3"></textarea>
            <div class="action-buttons">
                <button class="remove-review-btn" data-report-id="${report.id}" data-review-id="${report.review_id}">
                    🗑️ Remove Review
                </button>
                <button class="dismiss-report-btn" data-report-id="${report.id}">
                    ❌ Dismiss Report
                </button>
            </div>
        </div>
    `;
    
    return reportCard;
}

function attachEventListeners() {
    document.querySelectorAll('.remove-review-btn').forEach(button => {
        button.addEventListener('click', handleRemoveReview);
    });
    document.querySelectorAll('.dismiss-report-btn').forEach(button => {
        button.addEventListener('click', handleDismissReport);
    });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Remove review using the deployed edge function
async function handleRemoveReview(event) {
    const reportId = event.target.dataset.reportId;
    const reviewId = event.target.dataset.reviewId;
    const reportCard = document.querySelector(`.report-card[data-id="${reportId}"]`);
    const adminNotesElement = reportCard.querySelector('.admin-notes');
    const adminNotes = adminNotesElement?.value?.trim() || '';

    if (!confirm('Are you sure you want to remove this review? This action cannot be undone.')) {
        return;
    }

    try {
        console.log('Starting review removal process...', { reportId, reviewId, adminNotes });
        
        // Validate inputs
        if (!reportId || !reviewId) {
            throw new Error('Missing report ID or review ID');
        }
        
        // Disable the button and show processing state
        event.target.disabled = true;
        event.target.textContent = 'Removing...';
        reportCard.classList.add('processing');
        
        // Get the current user's session
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError) {
            console.error('Session error:', sessionError);
            throw new Error(`Session error: ${sessionError.message}`);
        }
        
        if (!session || !session.access_token) {
            console.error('No active session found');
            throw new Error('No active session found. Please log in again.');
        }
        
        console.log('Session validated, calling edge function...');
        
        // Prepare the request body - ensure it's a proper object
        const requestPayload = {
            report_id: String(reportId),
            review_id: String(reviewId),
            admin_notes: adminNotes || null
        };
        
        console.log('Request payload:', requestPayload);
        console.log('Payload JSON:', JSON.stringify(requestPayload));
        
        // Try different approaches to call the edge function
        let response;
        
        try {
            // Method 1: Use supabase.functions.invoke (preferred)
            console.log('Attempting Method 1: supabase.functions.invoke');
            const result = await supabase.functions.invoke('remove-review', {
                body: requestPayload
            });
            
            console.log('Method 1 result:', result);
            response = result;
            
        } catch (invokeError) {
            console.error('Method 1 failed:', invokeError);
            
            // Method 2: Direct fetch to the edge function URL
            console.log('Attempting Method 2: direct fetch');
            const functionUrl = `${supabaseUrl}/functions/v1/remove-review`;
            
            const fetchResponse = await fetch(functionUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${session.access_token}`,
                    'Content-Type': 'application/json',
                    'apikey': supabaseKey
                },
                body: JSON.stringify(requestPayload)
            });
            
            if (!fetchResponse.ok) {
                const errorText = await fetchResponse.text();
                throw new Error(`HTTP ${fetchResponse.status}: ${errorText}`);
            }
            
            const fetchData = await fetchResponse.json();
            response = { data: fetchData, error: null };
        }

        console.log('Final response:', response);

        if (response.error) {
            console.error('Edge function error:', response.error);
            throw new Error(response.error.message || 'Failed to call remove-review function');
        }

        const data = response.data;
        if (!data) {
            console.error('No data returned from edge function');
            throw new Error('No response data from server');
        }

        if (!data.success) {
            console.error('Edge function returned error:', data);
            throw new Error(data.error || data.message || 'Review removal failed');
        }

        console.log('Review removed successfully:', data);
        
        // Show success feedback
        showSuccess('Review removed successfully!');
        reportCard.classList.add('processed');
        reportCard.innerHTML = `
            <div class="success-notification">
                <span class="success-icon">✅</span>
                <h3>Review Removed Successfully</h3>
                <p>The review has been deleted and the report has been processed.</p>
                ${adminNotes ? `<p><strong>Admin Notes:</strong> ${escapeHtml(adminNotes)}</p>` : ''}
            </div>
        `;
        
        // Remove the card after a delay and refresh the list
        setTimeout(() => {
            reportCard.remove();
            updateStatistics();
            
            // If no more pending reports, show empty state
            if (pendingReports.length <= 1) {
                loadPendingReports();
            }
        }, 3000);
        
        // Update local state
        pendingReports = pendingReports.filter(r => r.id !== reportId);
        
    } catch (error) {
        console.error('Error removing review:', error);
        showError(`Failed to remove review: ${error.message}`);
        
        // Reset button state
        event.target.disabled = false;
        event.target.textContent = '🗑️ Remove Review';
        reportCard.classList.remove('processing');
    }
}

// Dismiss report using the deployed edge function (keeps review, marks report as approved)
async function handleDismissReport(event) {
    const reportId = event.target.dataset.reportId;
    const reportCard = document.querySelector(`.report-card[data-id="${reportId}"]`);
    const adminNotesElement = reportCard.querySelector('.admin-notes');
    const adminNotes = adminNotesElement?.value?.trim() || '';

    if (!confirm('Are you sure you want to dismiss this report? The review will be kept and the report will be marked as resolved.')) {
        return;
    }

    try {
        console.log('Starting report dismissal process...', { reportId, adminNotes });
        
        // Validate inputs
        if (!reportId) {
            throw new Error('Missing report ID');
        }
        
        // Disable the button and show processing state
        event.target.disabled = true;
        event.target.textContent = 'Dismissing...';
        reportCard.classList.add('processing');
        
        // Get the current user's session
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError) {
            console.error('Session error:', sessionError);
            throw new Error(`Session error: ${sessionError.message}`);
        }
        
        if (!session || !session.access_token) {
            console.error('No active session found');
            throw new Error('No active session found. Please log in again.');
        }
        
        console.log('Session validated, calling edge function...');
        
        // Prepare the request body
        const requestPayload = {
            report_id: String(reportId),
            admin_notes: adminNotes || null
        };
        
        console.log('Request payload:', requestPayload);
        
        // Try different approaches to call the edge function
        let response;
        
        try {
            // Method 1: Use supabase.functions.invoke (preferred)
            console.log('Attempting Method 1: supabase.functions.invoke');
            const result = await supabase.functions.invoke('dismiss-report', {
                body: requestPayload
            });
            
            console.log('Method 1 result:', result);
            response = result;
            
        } catch (invokeError) {
            console.error('Method 1 failed:', invokeError);
            
            // Method 2: Direct fetch to the edge function URL
            console.log('Attempting Method 2: direct fetch');
            const functionUrl = `${supabaseUrl}/functions/v1/dismiss-report`;
            
            const fetchResponse = await fetch(functionUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${session.access_token}`,
                    'Content-Type': 'application/json',
                    'apikey': supabaseKey
                },
                body: JSON.stringify(requestPayload)
            });
            
            if (!fetchResponse.ok) {
                const errorText = await fetchResponse.text();
                throw new Error(`HTTP ${fetchResponse.status}: ${errorText}`);
            }
            
            const fetchData = await fetchResponse.json();
            response = { data: fetchData, error: null };
        }

        console.log('Final response:', response);

        if (response.error) {
            console.error('Edge function error:', response.error);
            throw new Error(response.error.message || 'Failed to call dismiss-report function');
        }

        const data = response.data;
        if (!data) {
            console.error('No data returned from edge function');
            throw new Error('No response data from server');
        }

        if (!data.success) {
            console.error('Edge function returned error:', data);
            throw new Error(data.error || data.message || 'Report dismissal failed');
        }

        console.log('Report dismissed successfully:', data);
        
        // Show success feedback
        showSuccess('Report dismissed successfully!');
        reportCard.classList.add('processed');
        reportCard.innerHTML = `
            <div class="success-notification">
                <span class="success-icon">✅</span>
                <h3>Report Dismissed</h3>
                <p>The report has been dismissed as invalid. The review remains visible.</p>
                ${adminNotes ? `<p><strong>Admin Notes:</strong> ${escapeHtml(adminNotes)}</p>` : ''}
            </div>
        `;
        
        // Remove the card after a delay and refresh the list
        setTimeout(() => {
            reportCard.remove();
            updateStatistics();
            
            // If no more pending reports, show empty state
            if (pendingReports.length <= 1) {
                loadPendingReports();
            }
        }, 3000);
        
        // Update local state
        pendingReports = pendingReports.filter(r => r.id !== reportId);
        
    } catch (error) {
        console.error('Error dismissing report:', error);
        showError(`Failed to dismiss report: ${error.message}`);
        
        // Reset button state
        event.target.disabled = false;
        event.target.textContent = '❌ Dismiss Report';
        reportCard.classList.remove('processing');
    }
}

// Update statistics
function updateStatistics() {
    if (pendingReportsCount) {
        pendingReportsCount.textContent = pendingReports.length;
    }
    
    if (pendingReports.length === 0) {
        emptyState.style.display = 'block';
        reportsQueue.innerHTML = '';
    } else {
        emptyState.style.display = 'none';
    }
}

// Logout function
async function handleLogout() {
    try {
        console.log('Logging out admin user...');
        
        const { error } = await supabase.auth.signOut();
        
        if (error) {
            console.error('Error during logout:', error);
            showError('Error logging out. Please try again.');
            return;
        }
        
        console.log('Logout successful');
        currentUser = null;
        redirectToLogin();
        
    } catch (error) {
        console.error('Logout error:', error);
        showError('Error during logout. Please try again.');
    }
}
