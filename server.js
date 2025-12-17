require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const { db, initializeDatabase, migrateFromSingleUser } = require('./config/database');
const { authenticateToken } = require('./middleware/auth');
const authRoutes = require('./routes/auth');

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", "data:"],
        },
    },
}));

// Rate limiting
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100,
    message: { error: 'Too many requests, please try again later' }
});

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 login attempts per 15 min
    message: { error: 'Too many login attempts, please try again later' }
});

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

// Apply rate limiting
app.use('/api/', apiLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

// Auth routes (no authentication required)
app.use('/api/auth', authRoutes);

// ============================================
// Protected API Routes (require authentication)
// ============================================

// Get all readings for authenticated user
app.get('/api/readings', authenticateToken, (req, res) => {
    const { start_date, end_date } = req.query;
    const userId = req.user.id;

    let query = "SELECT * FROM readings WHERE user_id = ?";
    const params = [userId];

    if (start_date && end_date) {
        query += " AND reading_date BETWEEN ? AND ?";
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

// Add a new reading for authenticated user
app.post('/api/readings', authenticateToken, (req, res) => {
    const { reading_value, reading_date, reading_time } = req.body;
    const userId = req.user.id;

    if (!reading_value || !reading_date || !reading_time) {
        res.status(400).json({ error: 'Missing required fields' });
        return;
    }

    const query = "INSERT INTO readings (user_id, reading_value, reading_date, reading_time) VALUES (?, ?, ?, ?)";

    db.run(query, [userId, reading_value, reading_date, reading_time], function(err) {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json({
            id: this.lastID,
            user_id: userId,
            reading_value,
            reading_date,
            reading_time
        });
    });
});

// Delete a reading (only if owned by user)
app.delete('/api/readings/:id', authenticateToken, (req, res) => {
    const { id } = req.params;
    const userId = req.user.id;

    db.run("DELETE FROM readings WHERE id = ? AND user_id = ?", [id, userId], function(err) {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        if (this.changes === 0) {
            res.status(404).json({ error: 'Reading not found or unauthorized' });
            return;
        }
        res.json({ message: 'Reading deleted successfully' });
    });
});

// Get all settings for authenticated user
app.get('/api/settings', authenticateToken, (req, res) => {
    const userId = req.user.id;

    db.all("SELECT * FROM settings WHERE user_id = ?", [userId], (err, rows) => {
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

// Update settings for authenticated user
app.put('/api/settings', authenticateToken, (req, res) => {
    const settings = req.body;
    const userId = req.user.id;

    const stmt = db.prepare("INSERT OR REPLACE INTO settings (user_id, setting_key, setting_value) VALUES (?, ?, ?)");

    for (const [key, value] of Object.entries(settings)) {
        stmt.run(userId, key, value);
    }

    stmt.finalize((err) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json({ message: 'Settings updated successfully' });
    });
});

// Get statistics for authenticated user's current billing period
app.get('/api/statistics', authenticateToken, (req, res) => {
    const userId = req.user.id;

    // First get billing period settings
    db.all(
        "SELECT * FROM settings WHERE user_id = ? AND setting_key IN ('billing_start_day', 'billing_end_day')",
        [userId],
        (err, settingRows) => {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }

            const settings = {};
            settingRows.forEach(row => {
                settings[row.setting_key] = parseInt(row.setting_value);
            });

            // Default billing period if not set
            if (!settings.billing_start_day) settings.billing_start_day = 1;
            if (!settings.billing_end_day) settings.billing_end_day = 31;

            const today = new Date();
            const currentYear = today.getFullYear();
            const currentMonth = today.getMonth();
            const currentDay = today.getDate();

            let startDate, endDate;

            if (currentDay >= settings.billing_start_day) {
                startDate = new Date(currentYear, currentMonth, settings.billing_start_day);
                if (settings.billing_end_day < settings.billing_start_day) {
                    endDate = new Date(currentYear, currentMonth + 1, settings.billing_end_day);
                } else {
                    endDate = new Date(currentYear, currentMonth, settings.billing_end_day);
                }
            } else {
                startDate = new Date(currentYear, currentMonth - 1, settings.billing_start_day);
                endDate = new Date(currentYear, currentMonth, settings.billing_end_day);
            }

            const startDateStr = startDate.toISOString().split('T')[0];
            const endDateStr = endDate.toISOString().split('T')[0];

            // Get readings for the period (user-specific)
            db.all(
                "SELECT * FROM readings WHERE user_id = ? AND reading_date BETWEEN ? AND ? ORDER BY reading_date, reading_time",
                [userId, startDateStr, endDateStr],
                (err, readings) => {
                    if (err) {
                        res.status(500).json({ error: err.message });
                        return;
                    }

                    // Get all settings for cost calculation
                    db.all("SELECT * FROM settings WHERE user_id = ?", [userId], (err, allSettings) => {
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
        }
    );
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
                current: { waterBasic: 0, waterUsage: 0, sewage: 0, total: 0 },
                projected: { waterBasic: 0, waterUsage: 0, sewage: 0, total: 0 }
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
            usage: Math.max(0, usage)
        });
    }

    const totalUsage = dailyUsage.reduce((sum, day) => sum + day.usage, 0);
    const daysWithReadings = dailyUsage.length;
    const avgDailyUsage = daysWithReadings > 0 ? totalUsage / daysWithReadings : 0;

    const currentCostBreakdown = calculateCostBreakdown(totalUsage, settings);

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

    const waterBlocks = [
        { limit: parseFloat(settings.water_block_1_limit || 6), rate: parseFloat(settings.water_block_1_rate || 0) },
        { limit: parseFloat(settings.water_block_2_limit || 15), rate: parseFloat(settings.water_block_2_rate || 0) },
        { limit: parseFloat(settings.water_block_3_limit || 25), rate: parseFloat(settings.water_block_3_rate || 0) },
        { limit: parseFloat(settings.water_block_4_limit || 35), rate: parseFloat(settings.water_block_4_rate || 0) },
        { limit: Infinity, rate: parseFloat(settings.water_block_5_rate || settings.water_block_4_rate || 0) }
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

    remainingUsage = usage;
    const sewageBlocks = [
        { limit: parseFloat(settings.sewage_block_1_limit || 6), rate: parseFloat(settings.sewage_block_1_rate || 0) },
        { limit: parseFloat(settings.sewage_block_2_limit || 15), rate: parseFloat(settings.sewage_block_2_rate || 0) },
        { limit: parseFloat(settings.sewage_block_3_limit || 25), rate: parseFloat(settings.sewage_block_3_rate || 0) },
        { limit: Infinity, rate: parseFloat(settings.sewage_block_4_rate || 0) }
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
        waterBasic,
        waterUsage: waterUsageCost,
        sewage: sewageCost,
        total: waterBasic + waterUsageCost + sewageCost
    };
}

// Initialize database and start server
async function startServer() {
    try {
        // Check for migration needs
        await migrateFromSingleUser();

        // Initialize database tables
        await initializeDatabase();

        // Start server
        app.listen(PORT, '0.0.0.0', () => {
            console.log(`Water Monitor app is running on http://0.0.0.0:${PORT}`);
            console.log(`Access locally at: http://localhost:${PORT}`);

            // Get the actual network IP
            const os = require('os');
            const interfaces = os.networkInterfaces();
            let primaryIP = null;

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
                console.log(`\nAccess from other devices at: http://${primaryIP}:${PORT}`);
            }

            if (!process.env.JWT_SECRET) {
                console.warn('\nWARNING: JWT_SECRET not set. Using default secret. Set JWT_SECRET in .env for production!');
            }
        });
    } catch (err) {
        console.error('Failed to start server:', err);
        process.exit(1);
    }
}

startServer();
