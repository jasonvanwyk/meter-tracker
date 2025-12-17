const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

// Database setup
const dbPath = path.join(__dirname, 'water_monitor.db');
const db = new sqlite3.Database(dbPath);

// Initialize database tables
db.serialize(() => {
    // Water readings table
    db.run(`CREATE TABLE IF NOT EXISTS readings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        reading_value REAL NOT NULL,
        reading_date DATE NOT NULL,
        reading_time TIME NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Settings table
    db.run(`CREATE TABLE IF NOT EXISTS settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        setting_key TEXT UNIQUE NOT NULL,
        setting_value TEXT NOT NULL
    )`);

    // Initialize default settings if not exists
    const defaultSettings = {
        'water_basic_monthly_cost': '91.79',
        'water_block_1_limit': '6',
        'water_block_1_rate': '29.67',
        'water_block_2_limit': '15',
        'water_block_2_rate': '57.32',
        'water_block_3_limit': '25',
        'water_block_3_rate': '68.50',
        'water_block_4_limit': '35',
        'water_block_4_rate': '95.12',
        'water_block_5_rate': '133.43',
        'sewage_block_1_limit': '6',
        'sewage_block_1_rate': '22.25',
        'sewage_block_2_limit': '15',
        'sewage_block_2_rate': '42.99',
        'sewage_block_3_limit': '25',
        'sewage_block_3_rate': '51.38',
        'sewage_block_4_rate': '71.34',
        'billing_start_day': '1',
        'billing_end_day': '31'
    };

    const stmt = db.prepare("INSERT OR IGNORE INTO settings (setting_key, setting_value) VALUES (?, ?)");
    for (const [key, value] of Object.entries(defaultSettings)) {
        stmt.run(key, value);
    }
    stmt.finalize();
});

// API Routes

// Get all readings for a specific period
app.get('/api/readings', (req, res) => {
    const { start_date, end_date } = req.query;
    let query = "SELECT * FROM readings";
    const params = [];

    if (start_date && end_date) {
        query += " WHERE reading_date BETWEEN ? AND ?";
        params.push(start_date, end_date);
    }

    query += " ORDER BY reading_date DESC, reading_time DESC";

    db.all(query, params, (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(rows);
    });
});

// Add a new reading
app.post('/api/readings', (req, res) => {
    const { reading_value, reading_date, reading_time } = req.body;

    if (!reading_value || !reading_date || !reading_time) {
        res.status(400).json({ error: 'Missing required fields' });
        return;
    }

    const query = "INSERT INTO readings (reading_value, reading_date, reading_time) VALUES (?, ?, ?)";

    db.run(query, [reading_value, reading_date, reading_time], function(err) {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json({
            id: this.lastID,
            reading_value,
            reading_date,
            reading_time
        });
    });
});

// Delete a reading
app.delete('/api/readings/:id', (req, res) => {
    const { id } = req.params;

    db.run("DELETE FROM readings WHERE id = ?", id, function(err) {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json({ message: 'Reading deleted successfully' });
    });
});

// Get all settings
app.get('/api/settings', (req, res) => {
    db.all("SELECT * FROM settings", [], (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }

        // Convert to object format
        const settings = {};
        rows.forEach(row => {
            settings[row.setting_key] = row.setting_value;
        });

        res.json(settings);
    });
});

// Update settings
app.put('/api/settings', (req, res) => {
    const settings = req.body;
    const stmt = db.prepare("UPDATE settings SET setting_value = ? WHERE setting_key = ?");

    for (const [key, value] of Object.entries(settings)) {
        stmt.run(value, key);
    }

    stmt.finalize(() => {
        res.json({ message: 'Settings updated successfully' });
    });
});

// Get statistics for current billing period
app.get('/api/statistics', (req, res) => {
    // First get billing period settings
    db.all("SELECT * FROM settings WHERE setting_key IN ('billing_start_day', 'billing_end_day')", [], (err, settingRows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }

        const settings = {};
        settingRows.forEach(row => {
            settings[row.setting_key] = parseInt(row.setting_value);
        });

        const today = new Date();
        const currentYear = today.getFullYear();
        const currentMonth = today.getMonth();
        const currentDay = today.getDate();

        let startDate, endDate;

        if (currentDay >= settings.billing_start_day) {
            // We're in the current billing period
            startDate = new Date(currentYear, currentMonth, settings.billing_start_day);
            if (settings.billing_end_day < settings.billing_start_day) {
                // End date is in next month
                endDate = new Date(currentYear, currentMonth + 1, settings.billing_end_day);
            } else {
                endDate = new Date(currentYear, currentMonth, settings.billing_end_day);
            }
        } else {
            // We're in the previous month's billing period that extends into this month
            startDate = new Date(currentYear, currentMonth - 1, settings.billing_start_day);
            endDate = new Date(currentYear, currentMonth, settings.billing_end_day);
        }

        const startDateStr = startDate.toISOString().split('T')[0];
        const endDateStr = endDate.toISOString().split('T')[0];

        // Get readings for the period
        db.all(
            "SELECT * FROM readings WHERE reading_date BETWEEN ? AND ? ORDER BY reading_date, reading_time",
            [startDateStr, endDateStr],
            (err, readings) => {
                if (err) {
                    res.status(500).json({ error: err.message });
                    return;
                }

                // Get all settings for cost calculation
                db.all("SELECT * FROM settings", [], (err, allSettings) => {
                    if (err) {
                        res.status(500).json({ error: err.message });
                        return;
                    }

                    const settingsObj = {};
                    allSettings.forEach(row => {
                        settingsObj[row.setting_key] = row.setting_value;
                    });

                    // Calculate statistics
                    const stats = calculateStatistics(readings, settingsObj, startDate, endDate);
                    res.json(stats);
                });
            }
        );
    });
});

// Calculate statistics helper function
function calculateStatistics(readings, settings, startDate, endDate) {
    if (readings.length < 2) {
        return {
            totalUsage: 0,
            dailyUsage: [],
            avgDailyUsage: 0,
            currentCost: 0,
            projectedCost: 0,
            costBreakdown: {
                current: {
                    waterBasic: 0,
                    waterUsage: 0,
                    sewage: 0,
                    total: 0
                },
                projected: {
                    waterBasic: 0,
                    waterUsage: 0,
                    sewage: 0,
                    total: 0
                }
            },
            billingPeriod: {
                start: startDate.toISOString().split('T')[0],
                end: endDate.toISOString().split('T')[0]
            }
        };
    }

    // Calculate daily usage
    const dailyUsage = [];
    for (let i = 1; i < readings.length; i++) {
        const usage = readings[i].reading_value - readings[i - 1].reading_value;
        dailyUsage.push({
            date: readings[i].reading_date,
            usage: Math.max(0, usage) // Ensure no negative values
        });
    }

    // Calculate total usage for the period
    const totalUsage = dailyUsage.reduce((sum, day) => sum + day.usage, 0);

    // Calculate average daily usage
    const daysWithReadings = dailyUsage.length;
    const avgDailyUsage = daysWithReadings > 0 ? totalUsage / daysWithReadings : 0;

    // Calculate current cost breakdown
    const currentCostBreakdown = calculateCostBreakdown(totalUsage, settings);

    // Calculate projected usage and cost for the full billing period
    const totalDaysInPeriod = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;
    const projectedUsage = avgDailyUsage * totalDaysInPeriod;
    const projectedCostBreakdown = calculateCostBreakdown(projectedUsage, settings);

    return {
        totalUsage: totalUsage.toFixed(4),
        dailyUsage,
        avgDailyUsage: avgDailyUsage.toFixed(4),
        currentCost: currentCostBreakdown.total.toFixed(2),
        projectedCost: projectedCostBreakdown.total.toFixed(2),
        costBreakdown: {
            current: {
                waterBasic: currentCostBreakdown.waterBasic.toFixed(2),
                waterUsage: currentCostBreakdown.waterUsage.toFixed(2),
                sewage: currentCostBreakdown.sewage.toFixed(2),
                total: currentCostBreakdown.total.toFixed(2)
            },
            projected: {
                waterBasic: projectedCostBreakdown.waterBasic.toFixed(2),
                waterUsage: projectedCostBreakdown.waterUsage.toFixed(2),
                sewage: projectedCostBreakdown.sewage.toFixed(2),
                total: projectedCostBreakdown.total.toFixed(2)
            }
        },
        billingPeriod: {
            start: startDate.toISOString().split('T')[0],
            end: endDate.toISOString().split('T')[0]
        },
        daysInPeriod: totalDaysInPeriod,
        daysWithReadings
    };
}

// Calculate cost breakdown based on usage blocks
function calculateCostBreakdown(usage, settings) {
    const waterBasic = parseFloat(settings.water_basic_monthly_cost || 0);
    let waterUsageCost = 0;
    let sewageCost = 0;
    let remainingUsage = usage;

    // Water usage cost calculation (excluding basic charge)
    const waterBlocks = [
        { limit: parseFloat(settings.water_block_1_limit), rate: parseFloat(settings.water_block_1_rate) },
        { limit: parseFloat(settings.water_block_2_limit), rate: parseFloat(settings.water_block_2_rate) },
        { limit: parseFloat(settings.water_block_3_limit), rate: parseFloat(settings.water_block_3_rate) },
        { limit: parseFloat(settings.water_block_4_limit || 35), rate: parseFloat(settings.water_block_4_rate) },
        { limit: Infinity, rate: parseFloat(settings.water_block_5_rate || settings.water_block_4_rate) }
    ];

    let prevLimit = 0;
    for (const block of waterBlocks) {
        const blockUsage = Math.min(remainingUsage, block.limit - prevLimit);
        if (blockUsage > 0) {
            waterUsageCost += blockUsage * block.rate;
            remainingUsage -= blockUsage;
        }
        prevLimit = block.limit;
        if (remainingUsage <= 0) break;
    }

    // Sewage cost calculation
    remainingUsage = usage;
    const sewageBlocks = [
        { limit: parseFloat(settings.sewage_block_1_limit), rate: parseFloat(settings.sewage_block_1_rate) },
        { limit: parseFloat(settings.sewage_block_2_limit), rate: parseFloat(settings.sewage_block_2_rate) },
        { limit: parseFloat(settings.sewage_block_3_limit), rate: parseFloat(settings.sewage_block_3_rate) },
        { limit: Infinity, rate: parseFloat(settings.sewage_block_4_rate) }
    ];

    prevLimit = 0;
    for (const block of sewageBlocks) {
        const blockUsage = Math.min(remainingUsage, block.limit - prevLimit);
        if (blockUsage > 0) {
            sewageCost += blockUsage * block.rate;
            remainingUsage -= blockUsage;
        }
        prevLimit = block.limit;
        if (remainingUsage <= 0) break;
    }

    return {
        waterBasic: waterBasic,
        waterUsage: waterUsageCost,
        sewage: sewageCost,
        total: waterBasic + waterUsageCost + sewageCost
    };
}

// Start server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Water Monitor app is running on http://0.0.0.0:${PORT}`);
    console.log(`Access locally at: http://localhost:${PORT}`);

    // Get the actual network IP
    const os = require('os');
    const interfaces = os.networkInterfaces();
    let primaryIP = null;

    // Look for the primary network interface (not docker or loopback)
    for (const [name, addrs] of Object.entries(interfaces)) {
        if (name.startsWith('enp') || name.startsWith('eth') || name.startsWith('en0')) {
            for (const addr of addrs) {
                if (addr.family === 'IPv4' && !addr.internal) {
                    primaryIP = addr.address;
                    break;
                }
            }
        }
    }

    if (primaryIP) {
        console.log(`\n✓ Access from your iPhone or other devices at:`);
        console.log(`  http://${primaryIP}:${PORT}`);
    } else {
        console.log(`\nTo access from other devices, use your network IP address`);
        console.log(`Run 'ip a' to find your IP (look for enp*/eth* interface)`);
    }
});