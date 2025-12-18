const nodemailer = require('nodemailer');

// Create reusable transporter
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'mail.smtp2go.com',
    port: parseInt(process.env.SMTP_PORT) || 2525,
    secure: false, // true for 465, false for other ports
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    }
});

// Verify connection on startup (optional, for debugging)
async function verifyConnection() {
    try {
        await transporter.verify();
        console.log('SMTP connection verified');
        return true;
    } catch (err) {
        console.error('SMTP connection failed:', err.message);
        return false;
    }
}

// Send password reset email
async function sendPasswordResetEmail(email, username, resetToken) {
    const appUrl = process.env.APP_URL || 'http://localhost:3000';
    const resetUrl = `${appUrl}/reset-password.html?token=${resetToken}`;

    const mailOptions = {
        from: process.env.SMTP_FROM || 'noreply@meter-tracker.com',
        to: email,
        subject: 'Water Monitor - Password Reset Request',
        text: `Hello ${username},

You requested a password reset for your Water Monitor account.

Click the link below to reset your password (valid for 1 hour):
${resetUrl}

If you did not request this reset, you can safely ignore this email.

- Water Monitor Team`,
        html: `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { color: #2196F3; margin-bottom: 20px; }
        .button { display: inline-block; padding: 12px 24px; background-color: #2196F3;
                  color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
        .footer { color: #666; font-size: 12px; margin-top: 30px; }
    </style>
</head>
<body>
    <div class="container">
        <h1 class="header">Water Monitor</h1>
        <p>Hello ${username},</p>
        <p>You requested a password reset for your Water Monitor account.</p>
        <p>Click the button below to reset your password (valid for 1 hour):</p>
        <a href="${resetUrl}" class="button">Reset Password</a>
        <p>Or copy and paste this link into your browser:</p>
        <p><a href="${resetUrl}">${resetUrl}</a></p>
        <p class="footer">If you did not request this reset, you can safely ignore this email.</p>
    </div>
</body>
</html>`
    };

    return transporter.sendMail(mailOptions);
}

module.exports = {
    verifyConnection,
    sendPasswordResetEmail
};
