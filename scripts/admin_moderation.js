// Initialize Supabase client
const supabaseUrl = 'https://qlqhlqesxxyvdhaeiuxf.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFscWhscWVzeHh5dmRoYWVpdXhmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc4MjgwODAsImV4cCI6MjA2MzQwNDA4MH0.vKQF9_5byQUXk8CPbg0FN73I_OiB4K_t4-cAP5T6YS8';
const supabase = window.supabase.createClient(supabaseUrl, supabaseKey);

// State variables
let currentUser = null;
let isLoading = false;
let pendingBrands = [];

// DOM elements
const loadingState = document.getElementById('loadingState');
const accessDenied = document.getElementById('accessDenied');
const mainContent = document.getElementById('mainContent');
const adminEmail = document.getElementById('adminEmail');
const logoutBtn = document.getElementById('logoutBtn');
const backToLoginBtn = document.getElementById('backToLoginBtn');
const refreshBtn = document.getElementById('refreshBtn');
const errorMessage = document.getElementById('errorMessage');
const pendingCount = document.getElementById('pendingCount');
const processedCount = document.getElementById('processedCount');
const logoQueue = document.getElementById('logoQueue');
const emptyState = document.getElementById('emptyState');

// Initialize
document.addEventListener('DOMContentLoaded', function() {
    initializeAdminPage();
    
    // Add event listeners
    logoutBtn.addEventListener('click', handleLogout);
    backToLoginBtn.addEventListener('click', () => window.location.href = 'admin-login.html');
    refreshBtn.addEventListener('click', loadPendingLogos);
});

async function initializeAdminPage() {
    try {
        console.log('Initializing admin moderation page...');
        
        // Step 1: Check for active session
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError) {
            console.error('Error getting session:', sessionError);
            showAccessDenied();
            return;
        }
        
        if (!session || !session.user) {
            console.log('No active session found, redirecting to login');
            redirectToLogin();
            return;
        }
        
        currentUser = session.user;
        console.log('Active session found for user:', currentUser.email);
        
        // Step 2: Verify admin role
        await verifyAdminAccess(session);
        
    } catch (error) {
        console.error('Error initializing admin page:', error);
        showAccessDenied();
    }
}

async function verifyAdminAccess(session) {
    try {
        console.log('Verifying admin access for user:', currentUser.email);
        
        if (!session.access_token) {
            throw new Error('No access token available');
        }

        // Call the is-user-admin Edge Function
        const response = await fetch(`${supabaseUrl}/functions/v1/is-user-admin`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${session.access_token}`,
                'Content-Type': 'application/json',
                'apikey': supabaseKey
            }
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('Admin verification failed:', errorText);
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        console.log('Admin verification result:', result);
        
        if (result.error) {
            throw new Error(result.error);
        }
        
        if (result.isAdmin === true) {
            // User is admin, show main content
            console.log('Admin access granted for user:', currentUser.email);
            showMainContent();
            await loadInitialData();
        } else {
            // User is not admin
            console.log('Admin access denied for user:', currentUser.email);
            showAccessDenied();
        }
        
    } catch (error) {
        console.error('Admin verification error:', error);
        showAccessDenied();
    }
}

function showMainContent() {
    loadingState.style.display = 'none';
    accessDenied.style.display = 'none';
    mainContent.style.display = 'block';
    
    // Display admin email
    adminEmail.textContent = currentUser.email;
}

function showAccessDenied() {
    loadingState.style.display = 'none';
    mainContent.style.display = 'none';
    accessDenied.style.display = 'block';
}

function redirectToLogin() {
    window.location.href = 'admin-login.html';
}

async function loadInitialData() {
    try {
        await loadPendingLogos();
        await loadStatistics();
    } catch (error) {
        console.error('Error loading initial data:', error);
        showError('Failed to load moderation data. Please refresh the page.');
    }
}

async function loadPendingLogos() {
    if (isLoading) return;
    
    try {
        isLoading = true;
        refreshBtn.disabled = true;
        emptyState.style.display = 'none';
        
        console.log('Loading pending brand logos...');
        
        // Fetch brands with pending logo moderation status
        const { data: brands, error } = await supabase
            .from('brands')
            .select(`
                id,
                name,
                description,
                website_url,
                pending_logo_url,
                user_id,
                created_at,
                logo_moderation_status
            `)
            .eq('logo_moderation_status', 'pending')
            .order('created_at', { ascending: false });
        
        if (error) {
            console.error('Error fetching pending brands:', error);
            throw error;
        }
        
        console.log('Fetched pending brands:', brands);
        pendingBrands = brands || [];
        
        // Render the pending brands
        renderPendingBrands();
        
    } catch (error) {
        console.error('Error loading pending logos:', error);
        showError('Failed to load pending logos. Please try again.');
        logoQueue.innerHTML = '';
        emptyState.style.display = 'block';
    } finally {
        isLoading = false;
        refreshBtn.disabled = false;
    }
}

function renderPendingBrands() {
    logoQueue.innerHTML = '';
    
    if (!pendingBrands || pendingBrands.length === 0) {
        emptyState.style.display = 'block';
        return;
    }
    
    emptyState.style.display = 'none';
    
    pendingBrands.forEach(brand => {
        const brandItem = createBrandModerationItem(brand);
        logoQueue.appendChild(brandItem);
    });
}

function createBrandModerationItem(brand) {
    const item = document.createElement('div');
    item.className = 'moderation-item';
    item.dataset.brandId = brand.id;
    
    // Format the creation date
    const createdDate = new Date(brand.created_at).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
    
    item.innerHTML = `
        <div class="brand-info">
            <div class="brand-header">
                <h3 class="brand-name">${escapeHtml(brand.name)}</h3>
                <span class="submission-date">Submitted: ${createdDate}</span>
            </div>
            
            ${brand.description ? `<p class="brand-description">${escapeHtml(brand.description)}</p>` : ''}
            
            <div class="brand-details">
                ${brand.website_url ? `
                    <div class="detail-item">
                        <span class="detail-label">Website:</span>
                        <a href="${escapeHtml(brand.website_url)}" target="_blank" rel="noopener noreferrer" class="website-link">
                            ${escapeHtml(brand.website_url)}
                        </a>
                    </div>
                ` : ''}
                
                <div class="detail-item">
                    <span class="detail-label">Brand ID:</span>
                    <span class="brand-id">${brand.id}</span>
                </div>
                
                ${brand.user_id ? `
                    <div class="detail-item">
                        <span class="detail-label">Submitted by:</span>
                        <span class="user-id">${brand.user_id}</span>
                    </div>
                ` : ''}
            </div>
        </div>
        
        <div class="logo-section">
            <div class="logo-container">
                ${brand.pending_logo_url ? `
                    <img src="${escapeHtml(brand.pending_logo_url)}" 
                         alt="Pending logo for ${escapeHtml(brand.name)}" 
                         class="pending-logo"
                         onerror="this.onerror=null; this.src='data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgdmlld0JveD0iMCAwIDIwMCAyMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIyMDAiIGhlaWdodD0iMjAwIiBmaWxsPSIjRjNGNEY2Ii8+CjxwYXRoIGQ9Ik0xMDAgNzVWMTI1TTc1IDEwMEgxMjUiIHN0cm9rZT0iIzlDQTNBRiIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtbGluZWNhcD0icm91bmQiLz4KPHN2Zz4K'; this.classList.add('error-placeholder');">
                ` : `
                    <div class="no-logo-placeholder">
                        <svg viewBox="0 0 24 24" width="48" height="48" fill="currentColor">
                            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                        </svg>
                        <span>No logo uploaded</span>
                    </div>
                `}
            </div>
        </div>
        
        <div class="moderation-actions">
            <button class="approve-btn" onclick="handleApprove('${brand.id}')" title="Approve this brand logo">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                </svg>
                Approve
            </button>
            
            <button class="reject-btn" onclick="handleReject('${brand.id}')" title="Reject this brand logo">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                    <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                </svg>
                Reject
            </button>
        </div>
    `;
    
    return item;
}

// Placeholder functions for approve/reject actions (to be implemented in later phases)
function handleApprove(brandId) {
    console.log('Approve brand:', brandId);
    showError('Approve functionality will be implemented in the next phase.');
}

function handleReject(brandId) {
    console.log('Reject brand:', brandId);
    showError('Reject functionality will be implemented in the next phase.');
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

async function loadStatistics() {
    try {
        console.log('Loading moderation statistics...');
        
        // Get count of pending brands
        const { count: pendingCount, error: pendingError } = await supabase
            .from('brands')
            .select('*', { count: 'exact', head: true })
            .eq('logo_moderation_status', 'pending');
        
        if (pendingError) {
            console.error('Error getting pending count:', pendingError);
        } else {
            document.getElementById('pendingCount').textContent = pendingCount || 0;
        }
        
        // Get count of processed brands (approved + rejected)
        const { count: processedCount, error: processedError } = await supabase
            .from('brands')
            .select('*', { count: 'exact', head: true })
            .in('logo_moderation_status', ['approved', 'rejected']);
        
        if (processedError) {
            console.error('Error getting processed count:', processedError);
        } else {
            document.getElementById('processedCount').textContent = processedCount || 0;
        }
        
    } catch (error) {
        console.error('Error loading statistics:', error);
    }
}

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
        
        // Redirect to login page
        window.location.href = 'admin-login.html';
        
    } catch (error) {
        console.error('Logout error:', error);
        showError('Error logging out. Please try again.');
    }
}

function showError(message) {
    errorMessage.textContent = message;
    errorMessage.style.display = 'flex';
    errorMessage.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    
    // Auto-hide error after 5 seconds
    setTimeout(() => {
        errorMessage.style.display = 'none';
    }, 5000);
}

// Handle auth state changes
supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') {
        currentUser = null;
        console.log('User signed out, redirecting to login');
        redirectToLogin();
    } else if (event === 'TOKEN_REFRESHED') {
        console.log('Token refreshed for user:', session?.user?.email);
    }
});

// Handle page visibility changes to refresh data when page becomes visible
document.addEventListener('visibilitychange', () => {
    if (!document.hidden && currentUser && mainContent.style.display !== 'none') {
        loadPendingLogos();
    }
});
