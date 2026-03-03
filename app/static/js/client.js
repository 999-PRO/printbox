/**
 * 999 PRO Terminal - Client Page JavaScript
 * JARVIS-Style Upload Button with Progress Animation
 */

// State
let isUploading = false;
let currentProgress = 0;

// DOM Elements
const uploadContainer = document.getElementById('uploadContainer');
const uploadBtn = document.getElementById('uploadBtn');
const uploadIcon = document.getElementById('uploadIcon');
const uploadText = document.getElementById('uploadText');
const progressRing = document.getElementById('progressRing');
const jarvisSegments = document.getElementById('jarvisSegments');
const statusCard = document.getElementById('statusCard');
const fileInput = document.getElementById('fileInput');
const clientName = document.getElementById('clientName');

// Constants
const CIRCUMFERENCE = 2 * Math.PI * 100; // radius = 100

/**
 * Initialize
 */
document.addEventListener('DOMContentLoaded', () => {
    // Set initial ring state
    progressRing.style.strokeDasharray = CIRCUMFERENCE;
    progressRing.style.strokeDashoffset = CIRCUMFERENCE;
    
    // Focus name input
    clientName.focus();
    
    // Load theme
    loadTheme();
});

/**
 * Theme Management
 */
function toggleTheme() {
    const html = document.documentElement;
    const isLight = html.getAttribute('data-theme') === 'light';
    
    if (isLight) {
        html.removeAttribute('data-theme');
        document.getElementById('themeText').textContent = 'День';
    } else {
        html.setAttribute('data-theme', 'light');
        document.getElementById('themeText').textContent = 'Ночь';
    }
    
    localStorage.setItem('printbox-theme', isLight ? 'dark' : 'light');
}

function loadTheme() {
    const saved = localStorage.getItem('printbox-theme');
    if (saved === 'light') {
        document.documentElement.setAttribute('data-theme', 'light');
        document.getElementById('themeText').textContent = 'Ночь';
    }
}

/**
 * Trigger file selection
 */
function triggerUpload() {
    // Check name
    if (!clientName.value.trim()) {
        clientName.focus();
        shakeElement(clientName);
        return;
    }
    
    // Prevent double upload
    if (isUploading) return;
    
    // Trigger file input
    fileInput.click();
}

/**
 * Handle selected files
 */
function handleFiles(files) {
    if (!files || files.length === 0) return;
    
    // Check name again
    if (!clientName.value.trim()) {
        clientName.focus();
        return;
    }
    
    uploadFiles(clientName.value.trim(), files);
}

/**
 * Upload files with progress animation
 */
async function uploadFiles(name, files) {
    isUploading = true;
    
    // Hide status if visible
    statusCard.classList.add('hidden');
    
    // Update button state
    uploadBtn.classList.add('uploading');
    uploadIcon.classList.add('hidden');
    uploadText.innerHTML = '<span class="upload-progress" id="progressText">0%</span>';
    
    // Prepare form data
    const formData = new FormData();
    formData.append('name', name);
    
    for (let i = 0; i < files.length; i++) {
        formData.append('files', files[i]);
    }
    
    // Calculate total size for progress
    const totalSize = Array.from(files).reduce((sum, f) => sum + f.size, 0);
    let uploadedSize = 0;
    
    try {
        // Use XMLHttpRequest for real progress
        const xhr = new XMLHttpRequest();
        
        // Progress handler
        xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable) {
                const progress = Math.round((e.loaded / e.total) * 100);
                updateProgress(progress);
            }
        });
        
        // Create promise for XHR
        const uploadPromise = new Promise((resolve, reject) => {
            xhr.addEventListener('load', () => {
                if (xhr.status === 200) {
                    try {
                        resolve(JSON.parse(xhr.responseText));
                    } catch (e) {
                        reject(new Error('Invalid response'));
                    }
                } else {
                    reject(new Error('Upload failed'));
                }
            });
            
            xhr.addEventListener('error', () => reject(new Error('Network error')));
            xhr.addEventListener('abort', () => reject(new Error('Upload aborted')));
        });
        
        // Start upload
        xhr.open('POST', '/api/upload');
        xhr.send(formData);
        
        // Wait for completion
        const result = await uploadPromise;
        
        // Complete progress
        updateProgress(100);
        
        // Show success
        showSuccess(result);
        
        // Reset for next upload
        setTimeout(() => {
            resetButton();
            clientName.value = '';
            fileInput.value = '';
        }, 2000);
        
    } catch (error) {
        console.error('Upload error:', error);
        alert('Ошибка при отправке. Попробуйте ещё раз.');
        resetButton();
    }
}

/**
 * Update progress ring and text
 */
function updateProgress(percent) {
    currentProgress = percent;
    
    // Update ring
    const offset = CIRCUMFERENCE - (percent / 100) * CIRCUMFERENCE;
    progressRing.style.strokeDashoffset = offset;
    
    // Update text
    const progressText = document.getElementById('progressText');
    if (progressText) {
        progressText.textContent = `${percent}%`;
    }
}

/**
 * Show success state
 */
function showSuccess(result) {
    // Update button
    uploadBtn.classList.remove('uploading');
    uploadBtn.classList.add('success');
    
    // Show checkmark
    uploadText.innerHTML = `
        <svg class="upload-success-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
            <polyline points="22 4 12 14.01 9 11.01"/>
        </svg>
    `;
    
    // Show status card
    document.getElementById('statusOrderId').textContent = result.order_id;
    document.getElementById('statusFiles').textContent = `Отправлено файлов: ${result.file_count}`;
    statusCard.classList.remove('hidden');
}

/**
 * Reset button to initial state
 */
function resetButton() {
    isUploading = false;
    currentProgress = 0;
    
    uploadBtn.classList.remove('uploading', 'success');
    uploadIcon.classList.remove('hidden');
    uploadText.textContent = 'ОТПРАВИТЬ ФАЙЛЫ';
    
    // Reset progress ring
    progressRing.style.strokeDashoffset = CIRCUMFERENCE;
}

/**
 * Shake animation for validation
 */
function shakeElement(element) {
    element.style.animation = 'none';
    element.offsetHeight; // Trigger reflow
    element.style.animation = 'shake 0.5s ease';
    
    // Add shake keyframes if not exists
    if (!document.querySelector('#shake-style')) {
        const style = document.createElement('style');
        style.id = 'shake-style';
        style.textContent = `
            @keyframes shake {
                0%, 100% { transform: translateX(0); }
                20%, 60% { transform: translateX(-5px); }
                40%, 80% { transform: translateX(5px); }
            }
        `;
        document.head.appendChild(style);
    }
}

/**
 * Keyboard shortcuts
 */
document.addEventListener('keydown', (e) => {
    // Enter on name input triggers upload
    if (e.key === 'Enter' && document.activeElement === clientName) {
        e.preventDefault();
        triggerUpload();
    }
});
