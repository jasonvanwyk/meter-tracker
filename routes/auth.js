const express = require('express');
const bcrypt = require('bcrypt');
const { body, validationResult } = require('express-validator');
const { db, initializeUserSettings } = require('../config/database');
const { generateToken, authenticateToken, generateResetToken, hashToken } = require('../middleware/auth');
const { sendPasswordResetEmail } = require('../utils/email');

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

// Validation rules for forgot password
const forgotPasswordValidation = [
    body('email')
        .trim()
        .isEmail()
        .withMessage('Valid email is required')
        .normalizeEmail()
];

// Validation rules for reset password
const resetPasswordValidation = [
    body('token')
        .trim()
        .notEmpty()
        .withMessage('Reset token is required')
        .isHexadecimal()
        .isLength({ min: 64, max: 64 })
        .withMessage('Invalid reset token format'),
    body('password')
        .isLength({ min: 8 })
        .withMessage('Password must be at least 8 characters')
];

// POST /api/auth/forgot-password - Request password reset
router.post('/forgot-password', forgotPasswordValidation, async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const { email } = req.body;

    try {
        // Look up user by email (don't reveal if email exists)
        const user = await new Promise((resolve, reject) => {
            db.get(
                "SELECT id, username, email, is_active FROM users WHERE email = ?",
                [email],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

        // Always return success (security: don't reveal if email exists)
        // But only send email if user exists and is active
        if (user && user.is_active) {
            // Invalidate any existing unused tokens for this user
            await new Promise((resolve, reject) => {
                db.run(
                    "UPDATE password_reset_tokens SET used_at = CURRENT_TIMESTAMP WHERE user_id = ? AND used_at IS NULL",
                    [user.id],
                    (err) => {
                        if (err) reject(err);
                        else resolve();
                    }
                );
            });

            // Generate new token
            const token = generateResetToken();
            const tokenHash = hashToken(token);
            const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

            // Store hashed token
            await new Promise((resolve, reject) => {
                db.run(
                    "INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)",
                    [user.id, tokenHash, expiresAt.toISOString()],
                    (err) => {
                        if (err) reject(err);
                        else resolve();
                    }
                );
            });

            // Send email (fire and forget - don't block response)
            sendPasswordResetEmail(user.email, user.username, token)
                .catch(err => console.error('Failed to send reset email:', err));
        }

        // Always return success message
        res.json({
            message: 'If an account exists with that email, a password reset link has been sent.'
        });
    } catch (err) {
        console.error('Forgot password error:', err);
        res.status(500).json({ error: 'Unable to process request' });
    }
});

// GET /api/auth/verify-reset-token - Verify token is valid (for frontend)
router.get('/verify-reset-token', async (req, res) => {
    const { token } = req.query;

    if (!token || token.length !== 64 || !/^[a-f0-9]+$/i.test(token)) {
        return res.status(400).json({ error: 'Invalid token format' });
    }

    try {
        const tokenHash = hashToken(token);

        const resetToken = await new Promise((resolve, reject) => {
            db.get(
                `SELECT prt.*, u.username
                 FROM password_reset_tokens prt
                 JOIN users u ON prt.user_id = u.id
                 WHERE prt.token_hash = ?
                   AND prt.used_at IS NULL
                   AND prt.expires_at > datetime('now')
                   AND u.is_active = 1`,
                [tokenHash],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

        if (!resetToken) {
            return res.status(400).json({ error: 'Invalid or expired reset token' });
        }

        res.json({ valid: true, username: resetToken.username });
    } catch (err) {
        console.error('Token verification error:', err);
        res.status(500).json({ error: 'Unable to verify token' });
    }
});

// POST /api/auth/reset-password - Reset password with token
router.post('/reset-password', resetPasswordValidation, async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const { token, password } = req.body;

    try {
        const tokenHash = hashToken(token);

        // Find valid token
        const resetToken = await new Promise((resolve, reject) => {
            db.get(
                `SELECT prt.*, u.id as user_id, u.is_active
                 FROM password_reset_tokens prt
                 JOIN users u ON prt.user_id = u.id
                 WHERE prt.token_hash = ?
                   AND prt.used_at IS NULL
                   AND prt.expires_at > datetime('now')`,
                [tokenHash],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

        if (!resetToken) {
            return res.status(400).json({ error: 'Invalid or expired reset token' });
        }

        if (!resetToken.is_active) {
            return res.status(403).json({ error: 'Account is deactivated' });
        }

        // Hash new password
        const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

        // Update password and mark token as used
        await new Promise((resolve, reject) => {
            db.serialize(() => {
                db.run(
                    "UPDATE users SET password_hash = ? WHERE id = ?",
                    [passwordHash, resetToken.user_id]
                );
                db.run(
                    "UPDATE password_reset_tokens SET used_at = CURRENT_TIMESTAMP WHERE id = ?",
                    [resetToken.id],
                    (err) => {
                        if (err) reject(err);
                        else resolve();
                    }
                );
            });
        });

        res.json({ message: 'Password reset successful. You can now log in.' });
    } catch (err) {
        console.error('Reset password error:', err);
        res.status(500).json({ error: 'Unable to reset password' });
    }
});

module.exports = router;
