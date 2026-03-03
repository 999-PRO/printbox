/**
 * 999 PRO Terminal - Operator Panel JavaScript
 * WebSocket Live Updates & Order Management
 */

// State
let orders = [];
let selectedOrderId = null;
let ws = null;
let wsReconnectInterval = null;

// DOM Elements
const ordersList = document.getElementById('ordersList');
const ordersCount = document.getElementById('ordersCount');
const searchInput = document.getElementById('searchInput');
const detailEmpty = document.getElementById('detailEmpty');
const detailInfo = document.getElementById('detailInfo');
const notificationSound = document.getElementById('notificationSound');

/**
 * Initialize
 */
document.addEventListener('DOMContentLoaded', () => {
    loadTheme();
    loadOrders();
    connectWebSocket();
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
 * WebSocket Connection
 */
function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    
    ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
        console.log('WebSocket connected');
        if (wsReconnectInterval) {
            clearInterval(wsReconnectInterval);
            wsReconnectInterval = null;
        }
    };
    
    ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            handleWebSocketMessage(data);
        } catch (e) {
            console.error('WebSocket message error:', e);
        }
    };
    
    ws.onclose = () => {
        console.log('WebSocket disconnected');
        // Reconnect after 2 seconds
        if (!wsReconnectInterval) {
            wsReconnectInterval = setInterval(() => {
                if (!ws || ws.readyState === WebSocket.CLOSED) {
                    connectWebSocket();
                }
            }, 2000);
        }
    };
    
    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
    };
}

/**
 * Handle WebSocket messages
 */
function handleWebSocketMessage(data) {
    switch (data.type) {
        case 'new_order':
            handleNewOrder(data.order);
            break;
        case 'delete_order':
            handleDeleteOrder(data.order_id);
            break;
        case 'pong':
            // Keepalive
            break;
    }
}

/**
 * Handle new order notification
 */
function handleNewOrder(order) {
    // Add to beginning of list
    orders.unshift(order);
    
    // Re-render list
    renderOrders(orders);
    
    // Update count
    updateOrderCount();
    
    // Play notification sound
    playNotificationSound();
    
    // Highlight new order
    setTimeout(() => {
        const newCard = document.querySelector(`[data-order-id="${order.id}"]`);
        if (newCard) {
            newCard.classList.add('new-order');
        }
    }, 50);
}

/**
 * Handle order deletion
 */
function handleDeleteOrder(orderId) {
    orders = orders.filter(o => o.id !== orderId);
    renderOrders(orders);
    updateOrderCount();
    
    if (selectedOrderId === orderId) {
        selectedOrderId = null;
        showEmptyDetail();
    }
}

/**
 * Load orders from API
 */
async function loadOrders() {
    try {
        const response = await fetch('/api/orders');
        const data = await response.json();
        orders = data.orders || [];
        renderOrders(orders);
        updateOrderCount();
    } catch (error) {
        console.error('Error loading orders:', error);
    }
}

/**
 * Search orders
 */
async function searchOrders() {
    const query = searchInput.value.trim();
    
    if (!query) {
        renderOrders(orders);
        return;
    }
    
    try {
        const response = await fetch(`/api/orders/search?q=${encodeURIComponent(query)}`);
        const data = await response.json();
        renderOrders(data.orders || []);
    } catch (error) {
        console.error('Error searching orders:', error);
    }
}

/**
 * Render orders list
 */
function renderOrders(orderList) {
    if (orderList.length === 0) {
        ordersList.innerHTML = `
            <div class="empty-state">
                <svg class="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                </svg>
                <p>Нет заказов</p>
            </div>
        `;
        return;
    }
    
    ordersList.innerHTML = orderList.map(order => `
        <div class="order-card ${selectedOrderId === order.id ? 'selected' : ''}" 
             data-order-id="${order.id}"
             onclick="selectOrder('${order.id}')">
            <div class="order-header">
                <span class="order-name">${escapeHtml(order.name)}</span>
                <span class="order-time">${order.time}</span>
            </div>
            <div class="order-meta">
                <span class="order-id">${escapeHtml(order.id)}</span>
                <span class="order-files">${order.file_count} файл(ов)</span>
            </div>
        </div>
    `).join('');
}

/**
 * Select order
 */
function selectOrder(orderId) {
    selectedOrderId = orderId;
    
    // Update UI
    document.querySelectorAll('.order-card').forEach(card => {
        card.classList.remove('selected');
        if (card.dataset.orderId === orderId) {
            card.classList.add('selected');
        }
    });
    
    // Show details
    const order = orders.find(o => o.id === orderId);
    if (order) {
        showOrderDetail(order);
    }
}

/**
 * Show order detail
 */
function showOrderDetail(order) {
    detailEmpty.classList.add('hidden');
    detailInfo.classList.remove('hidden');
    
    document.getElementById('detailName').textContent = order.name;
    document.getElementById('detailId').textContent = order.id;
    document.getElementById('detailDate').textContent = order.date;
    document.getElementById('detailTime').textContent = order.time;
    document.getElementById('detailFileCount').textContent = order.file_count;
    
    // Render files
    const fileList = document.getElementById('fileList');
    if (order.files && order.files.length > 0) {
        fileList.innerHTML = order.files.map(file => `
            <div class="file-item">
                <svg class="file-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                </svg>
                <span class="file-name">${escapeHtml(file)}</span>
            </div>
        `).join('');
    } else {
        fileList.innerHTML = '<div class="file-item"><span class="file-name">Нет информации о файлах</span></div>';
    }
}

/**
 * Show empty detail state
 */
function showEmptyDetail() {
    detailEmpty.classList.remove('hidden');
    detailInfo.classList.add('hidden');
}

/**
 * Update order count
 */
function updateOrderCount() {
    ordersCount.textContent = orders.length;
}

/**
 * Open order folder
 */
async function openFolder() {
    if (!selectedOrderId) return;
    
    try {
        await fetch(`/api/open-folder/${selectedOrderId}`);
    } catch (error) {
        console.error('Error opening folder:', error);
    }
}

/**
 * Delete selected order
 */
async function deleteOrder() {
    if (!selectedOrderId) return;
    
    const order = orders.find(o => o.id === selectedOrderId);
    if (!order) return;
    
    if (!confirm(`Удалить заказ "${order.name}"?\nФайлы будут удалены безвозвратно.`)) {
        return;
    }
    
    try {
        const response = await fetch(`/api/orders/${selectedOrderId}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            selectedOrderId = null;
            showEmptyDetail();
        }
    } catch (error) {
        console.error('Error deleting order:', error);
        alert('Ошибка при удалении');
    }
}

/**
 * Play notification sound
 */
function playNotificationSound() {
    try {
        notificationSound.currentTime = 0;
        notificationSound.play().catch(() => {
            // Browser may block autoplay
            console.log('Sound blocked by browser');
        });
    } catch (e) {
        console.log('Could not play notification sound');
    }
}

/**
 * Escape HTML
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
}

/**
 * Keep WebSocket alive
 */
setInterval(() => {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send('ping');
    }
}, 30000);
