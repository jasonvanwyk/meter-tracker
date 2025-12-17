// API base URL - will work on local network
const API_URL = '';

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    initializeTabs();
    initializeForms();
    setDefaultDateTime();
    loadSettings();
    loadDashboard();
});

// Tab navigation
function initializeTabs() {
    const tabs = document.querySelectorAll('.nav-tab');
    const contents = document.querySelectorAll('.tab-content');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const targetTab = tab.dataset.tab;

            // Update active states
            tabs.forEach(t => t.classList.remove('active'));
            contents.forEach(c => c.classList.remove('active'));

            tab.classList.add('active');
            document.getElementById(targetTab).classList.add('active');

            // Load content for active tab
            switch(targetTab) {
                case 'dashboard':
                    loadDashboard();
                    break;
                case 'history':
                    loadHistory();
                    break;
                case 'settings':
                    loadSettings();
                    break;
            }
        });
    });
}

// Initialize forms
function initializeForms() {
    // Reading form
    const readingForm = document.getElementById('reading-form');
    readingForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        await saveReading();
    });

    // Settings form
    const settingsForm = document.getElementById('settings-form');
    settingsForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        await saveSettings();
    });

    // Update tariff block start values when limits change
    document.getElementById('water-block-1-limit').addEventListener('input', updateTariffBlockStarts);
    document.getElementById('water-block-2-limit').addEventListener('input', updateTariffBlockStarts);
    document.getElementById('water-block-3-limit').addEventListener('input', updateTariffBlockStarts);
    document.getElementById('water-block-4-limit').addEventListener('input', updateTariffBlockStarts);

    document.getElementById('sewage-block-1-limit').addEventListener('input', updateTariffBlockStarts);
    document.getElementById('sewage-block-2-limit').addEventListener('input', updateTariffBlockStarts);
    document.getElementById('sewage-block-3-limit').addEventListener('input', updateTariffBlockStarts);
}

// Update tariff block start values
function updateTariffBlockStarts() {
    // Water blocks
    const waterBlock1Limit = document.getElementById('water-block-1-limit').value;
    const waterBlock2Limit = document.getElementById('water-block-2-limit').value;
    const waterBlock3Limit = document.getElementById('water-block-3-limit').value;
    const waterBlock4Limit = document.getElementById('water-block-4-limit').value;

    document.getElementById('water-block-2-start').textContent =
        waterBlock1Limit ? (parseFloat(waterBlock1Limit) + 0.001).toFixed(3) : '7';
    document.getElementById('water-block-3-start').textContent =
        waterBlock2Limit ? (parseFloat(waterBlock2Limit) + 0.001).toFixed(3) : '16';
    document.getElementById('water-block-4-start').textContent =
        waterBlock3Limit ? (parseFloat(waterBlock3Limit) + 0.001).toFixed(3) : '26';
    document.getElementById('water-block-5-start').textContent =
        waterBlock4Limit || '35';

    // Sewage blocks
    const sewageBlock1Limit = document.getElementById('sewage-block-1-limit').value;
    const sewageBlock2Limit = document.getElementById('sewage-block-2-limit').value;
    const sewageBlock3Limit = document.getElementById('sewage-block-3-limit').value;

    document.getElementById('sewage-block-2-start').textContent =
        sewageBlock1Limit ? (parseFloat(sewageBlock1Limit) + 0.001).toFixed(3) : '7';
    document.getElementById('sewage-block-3-start').textContent =
        sewageBlock2Limit ? (parseFloat(sewageBlock2Limit) + 0.001).toFixed(3) : '16';
    document.getElementById('sewage-block-4-start').textContent =
        sewageBlock3Limit || '25';
}

// Set default date and time for new reading
function setDefaultDateTime() {
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = now.toTimeString().slice(0, 5);

    document.getElementById('reading-date').value = dateStr;
    document.getElementById('reading-time').value = timeStr;

    // Also set history filter dates
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - 1);
    document.getElementById('history-start').value = startDate.toISOString().split('T')[0];
    document.getElementById('history-end').value = dateStr;
}

// Load dashboard data
async function loadDashboard() {
    try {
        const response = await fetch(`${API_URL}/api/statistics`);
        const stats = await response.json();

        // Update billing period display
        document.getElementById('billing-period-display').textContent =
            `${formatDate(stats.billingPeriod.start)} - ${formatDate(stats.billingPeriod.end)}`;

        // Update statistics
        document.getElementById('total-usage').textContent = stats.totalUsage || '0';
        document.getElementById('avg-daily').textContent = stats.avgDailyUsage || '0';
        document.getElementById('current-cost').textContent = stats.currentCost || '0';
        document.getElementById('projected-cost').textContent = stats.projectedCost || '0';

        // Update cost breakdown if available
        if (stats.costBreakdown) {
            document.getElementById('current-water-basic').textContent = stats.costBreakdown.current.waterBasic || '0.00';
            document.getElementById('current-water-usage').textContent = stats.costBreakdown.current.waterUsage || '0.00';
            document.getElementById('current-sewage').textContent = stats.costBreakdown.current.sewage || '0.00';
            document.getElementById('current-total').textContent = stats.costBreakdown.current.total || '0.00';

            document.getElementById('projected-water-basic').textContent = stats.costBreakdown.projected.waterBasic || '0.00';
            document.getElementById('projected-water-usage').textContent = stats.costBreakdown.projected.waterUsage || '0.00';
            document.getElementById('projected-sewage').textContent = stats.costBreakdown.projected.sewage || '0.00';
            document.getElementById('projected-total').textContent = stats.costBreakdown.projected.total || '0.00';
        }

        // Display daily usage
        const dailyUsageList = document.getElementById('daily-usage-list');
        if (stats.dailyUsage && stats.dailyUsage.length > 0) {
            dailyUsageList.innerHTML = stats.dailyUsage
                .map(day => `
                    <div class="usage-item">
                        <span>${formatDate(day.date)}</span>
                        <span><strong>${day.usage.toFixed(3)} kL</strong></span>
                    </div>
                `).join('');
        } else {
            dailyUsageList.innerHTML = '<p>No usage data available. Add at least 2 readings to see daily usage.</p>';
        }
    } catch (error) {
        console.error('Error loading dashboard:', error);
    }
}

// Save water reading
async function saveReading() {
    let readingValue = document.getElementById('reading-value').value;
    const readingDate = document.getElementById('reading-date').value;
    const readingTime = document.getElementById('reading-time').value;

    const messageDiv = document.getElementById('capture-message');

    // Convert meter reading to kiloliters
    // If user enters a large number (like 1287309), it's in liters with decimal
    let readingInKL = parseFloat(readingValue);
    if (readingInKL > 1000) {
        // This is likely a raw meter reading in liters (with last digit as decimal)
        // First divide by 10 to get actual liters, then by 1000 to get kL
        const readingInLiters = readingInKL / 10;  // e.g., 1287309 → 128730.9 liters
        readingInKL = readingInLiters / 1000;      // e.g., 128730.9 → 128.7309 kL
    }

    try {
        const response = await fetch(`${API_URL}/api/readings`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                reading_value: readingInKL,
                reading_date: readingDate,
                reading_time: readingTime
            })
        });

        if (response.ok) {
            showMessage(messageDiv, 'Reading saved successfully!', 'success');
            document.getElementById('reading-form').reset();
            setDefaultDateTime();

            // Reload dashboard if it's active
            if (document.getElementById('dashboard').classList.contains('active')) {
                loadDashboard();
            }
        } else {
            const error = await response.json();
            showMessage(messageDiv, `Error: ${error.error}`, 'error');
        }
    } catch (error) {
        showMessage(messageDiv, 'Error saving reading', 'error');
        console.error('Error:', error);
    }
}

// Load history
async function loadHistory() {
    const startDate = document.getElementById('history-start').value;
    const endDate = document.getElementById('history-end').value;

    try {
        const params = new URLSearchParams();
        if (startDate) params.append('start_date', startDate);
        if (endDate) params.append('end_date', endDate);

        const response = await fetch(`${API_URL}/api/readings?${params}`);
        const readings = await response.json();

        const historyList = document.getElementById('history-list');

        if (readings.length > 0) {
            historyList.innerHTML = readings.map(reading => `
                <div class="history-item">
                    <div class="history-info">
                        <div class="history-date">${formatDate(reading.reading_date)} ${reading.reading_time}</div>
                        <div class="history-value">${parseFloat(reading.reading_value).toFixed(4)} kL</div>
                    </div>
                    <button class="btn-danger" onclick="deleteReading(${reading.id})">Delete</button>
                </div>
            `).join('');
        } else {
            historyList.innerHTML = '<p>No readings found for this period.</p>';
        }
    } catch (error) {
        console.error('Error loading history:', error);
    }
}

// Delete reading
async function deleteReading(id) {
    if (confirm('Are you sure you want to delete this reading?')) {
        try {
            const response = await fetch(`${API_URL}/api/readings/${id}`, {
                method: 'DELETE'
            });

            if (response.ok) {
                loadHistory();
                // Reload dashboard if it's active
                if (document.getElementById('dashboard').classList.contains('active')) {
                    loadDashboard();
                }
            }
        } catch (error) {
            console.error('Error deleting reading:', error);
        }
    }
}

// Load settings
async function loadSettings() {
    try {
        const response = await fetch(`${API_URL}/api/settings`);
        const settings = await response.json();

        // Populate form fields
        document.getElementById('billing-start').value = settings.billing_start_day || '1';
        document.getElementById('billing-end').value = settings.billing_end_day || '31';

        document.getElementById('water-basic').value = settings.water_basic_monthly_cost || '0';
        document.getElementById('water-block-1-limit').value = settings.water_block_1_limit || '6';
        document.getElementById('water-block-1-rate').value = settings.water_block_1_rate || '22.25';
        document.getElementById('water-block-2-limit').value = settings.water_block_2_limit || '15';
        document.getElementById('water-block-2-rate').value = settings.water_block_2_rate || '42.99';
        document.getElementById('water-block-3-limit').value = settings.water_block_3_limit || '25';
        document.getElementById('water-block-3-rate').value = settings.water_block_3_rate || '68.50';
        document.getElementById('water-block-4-limit').value = settings.water_block_4_limit || '35';
        document.getElementById('water-block-4-rate').value = settings.water_block_4_rate || '95.12';
        document.getElementById('water-block-5-rate').value = settings.water_block_5_rate || '133.43';

        document.getElementById('sewage-block-1-limit').value = settings.sewage_block_1_limit || '6';
        document.getElementById('sewage-block-1-rate').value = settings.sewage_block_1_rate || '22.25';
        document.getElementById('sewage-block-2-limit').value = settings.sewage_block_2_limit || '15';
        document.getElementById('sewage-block-2-rate').value = settings.sewage_block_2_rate || '42.99';
        document.getElementById('sewage-block-3-limit').value = settings.sewage_block_3_limit || '25';
        document.getElementById('sewage-block-3-rate').value = settings.sewage_block_3_rate || '51.38';
        document.getElementById('sewage-block-4-rate').value = settings.sewage_block_4_rate || '71.34';

        updateTariffBlockStarts();
    } catch (error) {
        console.error('Error loading settings:', error);
    }
}

// Save settings
async function saveSettings() {
    const settings = {
        billing_start_day: document.getElementById('billing-start').value,
        billing_end_day: document.getElementById('billing-end').value,
        water_basic_monthly_cost: document.getElementById('water-basic').value,
        water_block_1_limit: document.getElementById('water-block-1-limit').value,
        water_block_1_rate: document.getElementById('water-block-1-rate').value,
        water_block_2_limit: document.getElementById('water-block-2-limit').value,
        water_block_2_rate: document.getElementById('water-block-2-rate').value,
        water_block_3_limit: document.getElementById('water-block-3-limit').value,
        water_block_3_rate: document.getElementById('water-block-3-rate').value,
        water_block_4_limit: document.getElementById('water-block-4-limit').value,
        water_block_4_rate: document.getElementById('water-block-4-rate').value,
        water_block_5_rate: document.getElementById('water-block-5-rate').value,
        sewage_block_1_limit: document.getElementById('sewage-block-1-limit').value,
        sewage_block_1_rate: document.getElementById('sewage-block-1-rate').value,
        sewage_block_2_limit: document.getElementById('sewage-block-2-limit').value,
        sewage_block_2_rate: document.getElementById('sewage-block-2-rate').value,
        sewage_block_3_limit: document.getElementById('sewage-block-3-limit').value,
        sewage_block_3_rate: document.getElementById('sewage-block-3-rate').value,
        sewage_block_4_rate: document.getElementById('sewage-block-4-rate').value
    };

    const messageDiv = document.getElementById('settings-message');

    try {
        const response = await fetch(`${API_URL}/api/settings`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(settings)
        });

        if (response.ok) {
            showMessage(messageDiv, 'Settings saved successfully!', 'success');

            // Reload dashboard to reflect new settings
            if (document.getElementById('dashboard').classList.contains('active')) {
                loadDashboard();
            }
        } else {
            showMessage(messageDiv, 'Error saving settings', 'error');
        }
    } catch (error) {
        showMessage(messageDiv, 'Error saving settings', 'error');
        console.error('Error:', error);
    }
}

// Helper function to show messages
function showMessage(element, message, type) {
    element.textContent = message;
    element.className = `message ${type}`;

    setTimeout(() => {
        element.className = 'message';
        element.textContent = '';
    }, 3000);
}

// Helper function to format dates
function formatDate(dateStr) {
    const date = new Date(dateStr);
    const options = { year: 'numeric', month: 'short', day: 'numeric' };
    return date.toLocaleDateString('en-US', options);
}