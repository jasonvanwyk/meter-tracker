const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '..', 'water_monitor.db');
const db = new sqlite3.Database(dbPath);

// Default settings for new users
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

function initializeDatabase() {
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            // Create users table
            db.run(`CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                email TEXT UNIQUE,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_login DATETIME,
                is_active BOOLEAN DEFAULT 1
            )`);

            // Check if readings table needs user_id column
            db.get("PRAGMA table_info(readings)", [], (err, row) => {
                if (err) {
                    console.error('Error checking readings table:', err);
                }
            });

            // Create readings table with user_id
            db.run(`CREATE TABLE IF NOT EXISTS readings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                reading_value REAL NOT NULL,
                reading_date DATE NOT NULL,
                reading_time TIME NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )`);

            // Create settings table with user_id
            db.run(`CREATE TABLE IF NOT EXISTS settings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                setting_key TEXT NOT NULL,
                setting_value TEXT NOT NULL,
                UNIQUE(user_id, setting_key),
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )`);

            // Create indexes
            db.run(`CREATE INDEX IF NOT EXISTS idx_readings_user_id ON readings(user_id)`);
            db.run(`CREATE INDEX IF NOT EXISTS idx_readings_user_date ON readings(user_id, reading_date)`);
            db.run(`CREATE INDEX IF NOT EXISTS idx_settings_user_id ON settings(user_id)`, (err) => {
                if (err) {
                    reject(err);
                } else {
                    console.log('Database initialized successfully');
                    resolve();
                }
            });
        });
    });
}

// Initialize default settings for a new user
function initializeUserSettings(userId) {
    return new Promise((resolve, reject) => {
        const stmt = db.prepare("INSERT OR IGNORE INTO settings (user_id, setting_key, setting_value) VALUES (?, ?, ?)");

        for (const [key, value] of Object.entries(defaultSettings)) {
            stmt.run(userId, key, value);
        }

        stmt.finalize((err) => {
            if (err) {
                reject(err);
            } else {
                resolve();
            }
        });
    });
}

// Migration: Check for old schema and migrate if needed
function migrateFromSingleUser() {
    return new Promise((resolve, reject) => {
        // Check if old readings table exists without user_id
        db.get("SELECT sql FROM sqlite_master WHERE type='table' AND name='readings'", [], (err, row) => {
            if (err) {
                reject(err);
                return;
            }

            if (row && !row.sql.includes('user_id')) {
                console.log('Detected old single-user schema. Migration needed.');
                console.log('Please run the migration script separately to preserve existing data.');
                console.log('For now, creating fresh multi-user schema...');

                // Rename old tables
                db.serialize(() => {
                    db.run("ALTER TABLE readings RENAME TO readings_old_backup");
                    db.run("ALTER TABLE settings RENAME TO settings_old_backup", (err) => {
                        if (err) {
                            console.log('Old tables already backed up or do not exist');
                        }
                        resolve(true); // Migration was needed
                    });
                });
            } else {
                resolve(false); // No migration needed
            }
        });
    });
}

module.exports = {
    db,
    initializeDatabase,
    initializeUserSettings,
    migrateFromSingleUser,
    defaultSettings
};
