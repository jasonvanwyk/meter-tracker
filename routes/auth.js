const express = require('express');
const bcrypt = require('bcrypt');
const { body, validationResult } = require('express-validator');
const { db, initializeUserSettings } = require('../config/database');
const { generateToken, authenticateToken } = require('../middleware/auth');

const router = express.Router();
const BCRYPT_ROUNDS = 12;

// Validation rules
const registerValidation = [
    body('username')
        .trim()
        .isLength({ min: 3, max: 50 })
        .withMessage('Username must be 3-50 characters')
        .matches(/^[a-zA-Z0-9_]+$/)
        .withMessage('Username can only contain letters, numbers, and underscores'),
    body('password')
        .isLength({ min: 8 })
        .withMessage('Password must be at least 8 characters'),
    body('email')
        .optional()
        .isEmail()
        .withMessage('Invalid email format')
        .normalizeEmail()
];

const loginValidation = [
    body('username').trim().notEmpty().withMessage('Username is required'),
    body('password').notEmpty().withMessage('Password is required')
];

// POST /api/auth/register - Create new user
router.post('/register', registerValidation, async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const { username, password, email } = req.body;

    try {
        // Check if username already exists
        const existingUser = await new Promise((resolve, reject) => {
            db.get("SELECT id FROM users WHERE username = ?", [username], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        if (existingUser) {
            return res.status(409).json({ error: 'Username already exists' });
        }

        // Check if email already exists (if provided)
        if (email) {
            const existingEmail = await new Promise((resolve, reject) => {
                db.get("SELECT id FROM users WHERE email = ?", [email], (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                });
            });

            if (existingEmail) {
                return res.status(409).json({ error: 'Email already registered' });
            }
        }

        // Hash password
        const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

        // Create user
        const result = await new Promise((resolve, reject) => {
            db.run(
                "INSERT INTO users (username, password_hash, email) VALUES (?, ?, ?)",
                [username, passwordHash, email || null],
                function(err) {
                    if (err) reject(err);
                    else resolve({ id: this.lastID });
                }
            );
        });

        // Initialize default settings for new user
        await initializeUserSettings(result.id);

        // Generate token
        const token = generateToken({ id: result.id, username });

        res.status(201).json({
            message: 'User created successfully',
            token,
            user: { id: result.id, username }
        });
    } catch (err) {
        console.error('Registration error:', err);
        res.status(500).json({ error: 'Registration failed' });
    }
});

// POST /api/auth/login - Authenticate user
router.post('/login', loginValidation, async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const { username, password } = req.body;

    try {
        // Find user
        const user = await new Promise((resolve, reject) => {
            db.get(
                "SELECT id, username, password_hash, is_active FROM users WHERE username = ?",
                [username],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

        if (!user) {
            return res.status(401).json({ error: 'Invalid username or password' });
        }

        if (!user.is_active) {
            return res.status(403).json({ error: 'Account is deactivated' });
        }

        // Verify password
        const validPassword = await bcrypt.compare(password, user.password_hash);
        if (!validPassword) {
            return res.status(401).json({ error: 'Invalid username or password' });
        }

        // Update last login
        db.run("UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?", [user.id]);

        // Generate token
        const token = generateToken({ id: user.id, username: user.username });

        res.json({
            message: 'Login successful',
            token,
            user: { id: user.id, username: user.username }
        });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Login failed' });
    }
});

// GET /api/auth/me - Get current user info (verify token)
router.get('/me', authenticateToken, (req, res) => {
    db.get(
        "SELECT id, username, email, created_at, last_login FROM users WHERE id = ?",
        [req.user.id],
        (err, user) => {
            if (err) {
                return res.status(500).json({ error: 'Failed to get user info' });
            }
            if (!user) {
                return res.status(404).json({ error: 'User not found' });
            }
            res.json(user);
        }
    );
});

// POST /api/auth/logout - Logout (client-side token removal)
router.post('/logout', authenticateToken, (req, res) => {
    // With JWT, logout is handled client-side by removing the token
    // This endpoint exists for consistency and could be used for token blacklisting in future
    res.json({ message: 'Logout successful' });
});

module.exports = router;
