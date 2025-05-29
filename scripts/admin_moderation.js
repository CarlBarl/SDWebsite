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
        
        // First, try a simple query to fetch all brands
        const { data: brands, error } = await supabase
            .from('brands')
            .select(`
                id,
                name,
                description,
                website_url,
                pending_logo_url,
                logo_url,
                created_by_user_id,
                logo_uploaded_by,
                created_at,
                logo_moderation_status
            `)
            .order('created_at', { ascending: false });
        
        if (error) {
            console.error('Error fetching brands:', error);
            console.error('Error details:', {
                message: error.message,
                details: error.details,
                hint: error.hint,
                code: error.code
            });
            throw error;
        }
        
        console.log('Raw fetched brands:', brands);
        console.log('Total brands fetched:', brands?.length || 0);
        
        // Filter brands that need moderation on the client side
        const filteredBrands = brands?.filter(brand => {
            const status = brand.logo_moderation_status;
            
            // Log each brand's status for debugging
            console.log(`Brand ${brand.id} (${brand.name}): status = ${status}`);
            
            // Include brands that are:
            // 1. pending
            // 2. null/undefined (never been moderated)
            // 3. needs_review
            const needsModeration = status === 'pending' || status === null || status === undefined || status === 'needs_review';
            
            if (needsModeration) {
                console.log(`Brand ${brand.id} needs moderation`);
            }
            
            return needsModeration;
        }) || [];
        
        pendingBrands = filteredBrands;
        
        console.log('Filtered pending brands:', pendingBrands);
        console.log('Number of pending brands:', pendingBrands.length);
        
        // Render the pending brands
        renderPendingBrands();
        
    } catch (error) {
        console.error('Error loading pending logos:', error);
        console.error('Full error object:', JSON.stringify(error, null, 2));
        
        // Show more specific error message
        let errorMsg = 'Failed to load pending logos. Please try again.';
        if (error.message) {
            errorMsg += ` Error: ${error.message}`;
        }
        if (error.code) {
            errorMsg += ` (Code: ${error.code})`;
        }
        
        showError(errorMsg);
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
    
    // Check if brand has a logo
    const hasLogo = brand.pending_logo_url && brand.pending_logo_url.trim() !== '';
    
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
                
                ${brand.created_by_user_id ? `
                    <div class="detail-item">
                        <span class="detail-label">Created by:</span>
                        <span class="user-id">${brand.created_by_user_id}</span>
                    </div>
                ` : ''}
                
                ${brand.logo_uploaded_by ? `
                    <div class="detail-item">
                        <span class="detail-label">Logo uploaded by:</span>
                        <span class="user-id">${brand.logo_uploaded_by}</span>
                    </div>
                ` : ''}
            </div>
        </div>
        
        <div class="logo-section">
            <div class="logo-container ${!hasLogo ? 'no-logo' : ''}">
                ${hasLogo ? `
                    <img src="${escapeHtml(brand.pending_logo_url)}" 
                         alt="Pending logo for ${escapeHtml(brand.name)}" 
                         class="pending-logo"
                         onerror="this.onerror=null; this.src='data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgdmlld0JveD0iMCAwIDIwMCAyMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIyMDAiIGhlaWdodD0iMjAwIiBmaWxsPSIjRjNGNEY2Ii8+CjxwYXRoIGQ9Ik0xMDAgNzVWMTI1TTc1IDEwMEgxMjUiIHN0cm9rZT0iIzlDQTNBRiIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtbGluZWNhcD0icm91bmQiLz4KPHN2Zz4K'; this.classList.add('error-placeholder');">
                ` : `
                    <div class="no-logo-placeholder">
                        <svg viewBox="0 0 24 24" width="48" height="48" fill="currentColor">
                            <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/>
                        </svg>
                        <span class="no-logo-text">No logo uploaded</span>
                        <span class="no-logo-hint">Admin can upload a logo below</span>
                    </div>
                `}
            </div>
            
            <!-- Admin logo upload section (initially hidden) -->
            <div class="admin-upload-section" id="uploadSection_${brand.id}" style="display: none;">
                <input type="file" 
                       id="adminLogoInput_${brand.id}" 
                       class="admin-logo-input" 
                       accept="image/*" 
                       onchange="handleFileSelected('${brand.id}', this)"
                       style="display: none;">
                
                <div class="upload-controls">
                    <button class="select-file-btn" onclick="document.getElementById('adminLogoInput_${brand.id}').click()">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                            <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z"/>
                        </svg>
                        Choose File
                    </button>
                    <span class="file-name" id="fileName_${brand.id}">No file selected</span>
                </div>
                
                <div class="upload-preview" id="preview_${brand.id}" style="display: none;">
                    <img class="preview-image" alt="Logo preview">
                    <div class="preview-actions">
                        <button class="cancel-upload-btn" onclick="cancelUpload('${brand.id}')">Cancel</button>
                        <button class="confirm-upload-btn" onclick="confirmUpload('${brand.id}')">Upload Logo</button>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="moderation-actions">
            <button class="approve-btn ${!hasLogo ? 'approve-no-logo' : ''}" 
                    onclick="handleApprove('${brand.id}')" 
                    title="${hasLogo ? 'Approve this brand logo' : 'Approve this brand (no logo will be set)'}">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                </svg>
                ${hasLogo ? 'Approve' : 'Approve (No Logo)'}
            </button>
            
            <button class="upload-logo-btn" onclick="toggleUploadSection('${brand.id}')" title="Upload or replace logo for this brand">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                    <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z"/>
                </svg>
                ${hasLogo ? 'Replace Logo' : 'Upload Logo'}
            </button>
        </div>
    `;
    
    return item;
}

// Function to toggle the upload section visibility
function toggleUploadSection(brandId) {
    const uploadSection = document.getElementById(`uploadSection_${brandId}`);
    const uploadBtn = document.querySelector(`[data-brand-id="${brandId}"] .upload-logo-btn`);
    
    if (uploadSection.style.display === 'none' || uploadSection.style.display === '') {
        // Show upload section
        uploadSection.style.display = 'block';
        uploadBtn.innerHTML = `
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
            Cancel Upload
        `;
        uploadBtn.title = 'Cancel logo upload';
    } else {
        // Hide upload section
        hideUploadSection(brandId);
    }
}

// Function to hide upload section and reset state
function hideUploadSection(brandId) {
    const uploadSection = document.getElementById(`uploadSection_${brandId}`);
    const uploadBtn = document.querySelector(`[data-brand-id="${brandId}"] .upload-logo-btn`);
    const fileInput = document.getElementById(`adminLogoInput_${brandId}`);
    const fileName = document.getElementById(`fileName_${brandId}`);
    const preview = document.getElementById(`preview_${brandId}`);
    
    // Find brand data to determine button text
    const brandData = pendingBrands.find(brand => brand.id === brandId);
    const hasLogo = brandData && brandData.pending_logo_url && brandData.pending_logo_url.trim() !== '';
    
    uploadSection.style.display = 'none';
    uploadBtn.innerHTML = `
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
            <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z"/>
        </svg>
        ${hasLogo ? 'Replace Logo' : 'Upload Logo'}
    `;
    uploadBtn.title = hasLogo ? 'Upload or replace logo for this brand' : 'Upload logo for this brand';
    
    // Reset file input and preview
    fileInput.value = '';
    fileName.textContent = 'No file selected';
    preview.style.display = 'none';
}

// Function to handle file selection
function handleFileSelected(brandId, inputElement) {
    const file = inputElement.files[0];
    const fileName = document.getElementById(`fileName_${brandId}`);
    const preview = document.getElementById(`preview_${brandId}`);
    const previewImage = preview.querySelector('.preview-image');
    
    if (!file) {
        fileName.textContent = 'No file selected';
        preview.style.display = 'none';
        return;
    }
    
    // Validate file type
    if (!file.type.startsWith('image/')) {
        showError('Please select a valid image file.');
        inputElement.value = '';
        fileName.textContent = 'No file selected';
        preview.style.display = 'none';
        return;
    }
    
    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
        showError('Image size must be less than 5MB.');
        inputElement.value = '';
        fileName.textContent = 'No file selected';
        preview.style.display = 'none';
        return;
    }
    
    // Update file name display
    fileName.textContent = file.name;
    
    // Show preview
    const reader = new FileReader();
    reader.onload = function(e) {
        previewImage.src = e.target.result;
        preview.style.display = 'block';
    };
    reader.readAsDataURL(file);
    
    console.log(`File selected for brand ${brandId}:`, file);
}

// Function to cancel upload
function cancelUpload(brandId) {
    hideUploadSection(brandId);
}

// Function to confirm upload (placeholder for now)
function confirmUpload(brandId) {
    const fileInput = document.getElementById(`adminLogoInput_${brandId}`);
    const file = fileInput.files[0];
    
    if (!file) {
        showError('No file selected.');
        return;
    }
    
    console.log(`Confirming upload for brand ${brandId}:`, file);
    
    // Call the placeholder function
    handleAdminUploadLogo(brandId, file);
}

// Implement actual admin logo upload functionality
async function handleAdminUploadLogo(brandId, fileObject) {
    console.log('handleAdminUploadLogo called with:', {
        brandId: brandId,
        fileObject: fileObject,
        fileName: fileObject.name,
        fileSize: fileObject.size,
        fileType: fileObject.type
    });
    
    try {
        // Show upload progress
        const confirmBtn = document.querySelector(`[data-brand-id="${brandId}"] .confirm-upload-btn`);
        const cancelBtn = document.querySelector(`[data-brand-id="${brandId}"] .cancel-upload-btn`);
        const originalConfirmText = confirmBtn.innerHTML;
        
        confirmBtn.disabled = true;
        cancelBtn.disabled = true;
        confirmBtn.innerHTML = `
            <svg class="processing-spinner" viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" fill="none" stroke-dasharray="31.416" stroke-dashoffset="31.416">
                    <animate attributeName="stroke-dasharray" dur="2s" values="0 31.416;15.708 15.708;0 31.416" repeatCount="indefinite"/>
                    <animate attributeName="stroke-dashoffset" dur="2s" values="0;-15.708;-31.416" repeatCount="indefinite"/>
                </circle>
            </svg>
            Uploading...
        `;

        // Create FormData for multipart upload
        const formData = new FormData();
        formData.append('brand_id', brandId);
        formData.append('logo_file', fileObject);

        // Call the admin-upload-brand-logo Edge Function
        const { data, error } = await supabase.functions.invoke('admin-upload-brand-logo', {
            body: formData
        });

        if (error) {
            console.error('Error uploading admin logo:', error);
            throw error;
        }

        console.log('Logo upload successful:', data);

        // Update the brand data in memory to keep it pending for approval
        const brandIndex = pendingBrands.findIndex(brand => brand.id === brandId);
        if (brandIndex !== -1) {
            pendingBrands[brandIndex].pending_logo_url = data.newLogoUrl;
            pendingBrands[brandIndex].logo_url = data.newLogoUrl;
            pendingBrands[brandIndex].admin_uploaded_logo = true;
            pendingBrands[brandIndex].logo_moderation_status = 'pending'; // Keep as pending
        }

        // Update the UI to reflect the uploaded logo
        const logoContainer = document.querySelector(`[data-brand-id="${brandId}"] .logo-container`);
        logoContainer.classList.remove('no-logo');
        logoContainer.innerHTML = `
            <img src="${data.newLogoUrl}" 
                 alt="Admin uploaded logo for ${data.brandName}" 
                 class="pending-logo"
                 onerror="this.onerror=null; this.src='data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgdmlld0JveD0iMCAwIDIwMCAyMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIyMDAiIGhlaWdodD0iMjAwIiBmaWxsPSIjRjNGNEY2Ii8+CjxwYXRoIGQ9Ik0xMDAgNzVWMTI1TTc1IDEwMEgxMjUiIHN0cm9rZT0iIzlDQTNBRiIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtbGluZWNhcD0icm91bmQiLz4KPHN2Zz4K'; this.classList.add('error-placeholder');">
            <div class="admin-uploaded-badge">Admin Uploaded</div>
        `;

        // Update the approve button to show it's ready for approval
        const approveBtn = document.querySelector(`[data-brand-id="${brandId}"] .approve-btn`);
        approveBtn.classList.remove('approve-no-logo');
        approveBtn.innerHTML = `
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
            </svg>
            Approve Admin Logo
        `;
        approveBtn.title = 'Approve this brand with admin-uploaded logo';

        // Update the upload button
        const uploadBtn = document.querySelector(`[data-brand-id="${brandId}"] .upload-logo-btn`);
        uploadBtn.innerHTML = `
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z"/>
            </svg>
            Replace Logo
        `;
        uploadBtn.title = 'Replace the admin-uploaded logo';

        // Add visual indicator that this is now admin-managed
        const brandItem = document.querySelector(`[data-brand-id="${brandId}"]`);
        brandItem.classList.add('admin-managed');

        // Hide the upload section
        hideUploadSection(brandId);

        showSuccessNotification(`Logo uploaded successfully for ${data.brandName}! Ready for approval.`);

        // Don't update statistics yet since it's still pending

    } catch (error) {
        console.error('Error uploading admin logo:', error);
        
        // Re-enable buttons and restore original text
        const confirmBtn = document.querySelector(`[data-brand-id="${brandId}"] .confirm-upload-btn`);
        const cancelBtn = document.querySelector(`[data-brand-id="${brandId}"] .cancel-upload-btn`);
        
        if (confirmBtn && cancelBtn) {
            confirmBtn.disabled = false;
            cancelBtn.disabled = false;
            confirmBtn.innerHTML = 'Upload Logo';
        }
        
        // Show error message
        const errorMsg = error.message || 'Failed to upload logo. Please try again.';
        showError(`Error uploading logo: ${errorMsg}`);
    }
}

// Replace the placeholder handleApprove function
async function handleApprove(brandId) {
    console.log('Approving brand:', brandId);
    
    // Find the brand data to check if it has a logo
    const brandData = pendingBrands.find(brand => brand.id === brandId);
    const hasLogo = brandData && brandData.pending_logo_url && brandData.pending_logo_url.trim() !== '';
    
    // Show confirmation for brands without logos
    if (!hasLogo) {
        const confirmApproval = confirm(
            `This brand "${brandData?.name || brandId}" does not have a logo uploaded. ` +
            'Approving will create the brand without a logo. Do you want to continue?'
        );
        
        if (!confirmApproval) {
            console.log('Approval cancelled by user for brand without logo');
            return;
        }
    }
    
    try {
        // Find the brand item in the UI
        const brandItem = document.querySelector(`[data-brand-id="${brandId}"]`);
        if (!brandItem) {
            console.error('Brand item not found in UI');
            return;
        }
        
        // Disable buttons and show processing state
        const approveBtn = brandItem.querySelector('.approve-btn');
        const rejectBtn = brandItem.querySelector('.upload-logo-btn');
        const originalApproveText = approveBtn.innerHTML;
        
        approveBtn.disabled = true;
        rejectBtn.disabled = true;
        approveBtn.innerHTML = `
            <svg class="processing-spinner" viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" fill="none" stroke-dasharray="31.416" stroke-dashoffset="31.416">
                    <animate attributeName="stroke-dasharray" dur="2s" values="0 31.416;15.708 15.708;0 31.416" repeatCount="indefinite"/>
                    <animate attributeName="stroke-dashoffset" dur="2s" values="0;-15.708;-31.416" repeatCount="indefinite"/>
                </circle>
            </svg>
            Processing...
        `;
        
        // Call the approve-logo Edge Function
        const { data, error } = await supabase.functions.invoke('approve-logo', {
            body: { brand_id: brandId }
        });
        
        if (error) {
            console.error('Error approving logo:', error);
            throw error;
        }
        
        console.log('Brand approved successfully:', data);
        
        // Remove the item from the UI with a smooth animation
        brandItem.style.transition = 'opacity 0.3s ease-out, transform 0.3s ease-out';
        brandItem.style.opacity = '0';
        brandItem.style.transform = 'translateX(-20px)';
        
        setTimeout(() => {
            brandItem.remove();
            
            // Update the pending brands array
            pendingBrands = pendingBrands.filter(brand => brand.id !== brandId);
            
            // Update counts
            updateStatsCounts();
            
            // Check if queue is now empty
            if (pendingBrands.length === 0) {
                emptyState.style.display = 'block';
            }
        }, 300);
        
        // Show success notification with appropriate message
        const successMessage = hasLogo ? 'Logo approved successfully!' : 'Brand approved successfully (no logo)!';
        showSuccessNotification(successMessage);
        
    } catch (error) {
        console.error('Error in handleApprove:', error);
        
        // Re-enable buttons and restore original text
        const brandItem = document.querySelector(`[data-brand-id="${brandId}"]`);
        if (brandItem) {
            const approveBtn = brandItem.querySelector('.approve-btn');
            const rejectBtn = brandItem.querySelector('.upload-logo-btn');
            
            approveBtn.disabled = false;
            rejectBtn.disabled = false;
            approveBtn.innerHTML = originalApproveText;
        }
        
        // Show error message
        const errorMsg = error.message || 'Failed to approve brand. Please try again.';
        showError(`Error approving brand: ${errorMsg}`);
    }
}

async function loadStatistics() {
    try {
        console.log('Loading moderation statistics...');
        
        // Simplify the statistics queries as well
        
        // Get all brands first
        const { data: allBrands, error: allBrandsError } = await supabase
            .from('brands')
            .select('logo_moderation_status');
        
        if (allBrandsError) {
            console.error('Error getting all brands for stats:', allBrandsError);
            return;
        }
        
        console.log('All brands for stats:', allBrands);
        
        // Count pending brands
        const pendingCount = allBrands?.filter(brand => {
            const status = brand.logo_moderation_status;
            return status === 'pending' || status === null || status === undefined || status === 'needs_review';
        }).length || 0;
        
        // Count processed brands
        const processedCount = allBrands?.filter(brand => {
            const status = brand.logo_moderation_status;
            return status === 'approved' || status === 'rejected' || status === 'admin_set';
        }).length || 0;
        
        console.log('Statistics:', { pendingCount, processedCount });
        
        document.getElementById('pendingCount').textContent = pendingCount;
        document.getElementById('processedCount').textContent = processedCount;
        
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

// Add helper functions for UI feedback
function updateStatsCounts() {
    // Update pending count
    document.getElementById('pendingCount').textContent = pendingBrands.length;
    
    // Increment processed count
    const processedElement = document.getElementById('processedCount');
    const currentProcessed = parseInt(processedElement.textContent) || 0;
    processedElement.textContent = currentProcessed + 1;
}

function showSuccessNotification(message) {
    // Create and show a temporary success notification
    const notification = document.createElement('div');
    notification.className = 'success-notification';
    notification.innerHTML = `
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
        </svg>
        ${message}
    `;
    
    // Add styles for the notification
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #059669;
        color: white;
        padding: 12px 16px;
        border-radius: 8px;
        display: flex;
        align-items: center;
        gap: 8px;
        z-index: 1000;
        animation: slideInRight 0.3s ease-out;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    `;
    
    document.body.appendChild(notification);
    
    // Auto-remove after 3 seconds
    setTimeout(() => {
        notification.style.animation = 'slideOutRight 0.3s ease-in';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, 3000);
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

// Add missing escapeHtml function
function escapeHtml(text) {
    if (!text) return '';
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, function(m) { return map[m]; });
}
