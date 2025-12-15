const nodemailer = require('nodemailer');
require('dotenv').config();

class EmailService {
  constructor() {
    this.isConfigured = !!(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);

    if (this.isConfigured) {
      this.transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: process.env.GMAIL_USER,
          pass: process.env.GMAIL_APP_PASSWORD
        }
      });
      console.log('Email service configured with Gmail SMTP');
    } else {
      console.warn('Email service not configured - missing GMAIL_USER or GMAIL_APP_PASSWORD in .env');
      console.warn('Password reset emails will be logged to console instead');
    }
  }

  /**
   * Send password reset email
   * @param {string} toEmail - Recipient email address
   * @param {string} resetUrl - Full URL to reset password page with token
   * @returns {Promise<boolean>} - True if sent successfully
   */
  async sendPasswordResetEmail(toEmail, resetUrl) {
    const subject = 'Reset Your Password - Alphalabs Trading';

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background-color: #f3f4f6;
      margin: 0;
      padding: 0;
    }
    .container {
      max-width: 600px;
      margin: 40px auto;
      background: white;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    }
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      padding: 40px 30px;
      text-align: center;
    }
    .logo {
      width: 60px;
      height: 60px;
      background: linear-gradient(135deg, #00D9FF, #8B5CF6);
      border-radius: 12px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-weight: 800;
      font-size: 1.8rem;
      color: #0B0F19;
      margin-bottom: 10px;
    }
    .header h1 {
      color: white;
      margin: 0;
      font-size: 24px;
      font-weight: 600;
    }
    .content {
      padding: 40px 30px;
    }
    .content h2 {
      color: #1f2937;
      font-size: 20px;
      margin-top: 0;
      margin-bottom: 20px;
    }
    .content p {
      color: #6b7280;
      line-height: 1.6;
      margin-bottom: 20px;
      font-size: 15px;
    }
    .button {
      display: inline-block;
      padding: 14px 32px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white !important;
      text-decoration: none;
      border-radius: 8px;
      font-weight: 600;
      font-size: 16px;
      margin: 20px 0;
      transition: transform 0.2s;
    }
    .button:hover {
      transform: translateY(-2px);
    }
    .security-notice {
      background: #fef3c7;
      border-left: 4px solid #f59e0b;
      padding: 15px;
      margin: 20px 0;
      border-radius: 4px;
    }
    .security-notice p {
      margin: 0;
      color: #78350f;
      font-size: 14px;
    }
    .footer {
      background: #f9fafb;
      padding: 30px;
      text-align: center;
      border-top: 1px solid #e5e7eb;
    }
    .footer p {
      color: #9ca3af;
      font-size: 13px;
      margin: 5px 0;
    }
    .link {
      color: #667eea;
      word-break: break-all;
      font-size: 13px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">A</div>
      <h1>Alphalabs Trading</h1>
    </div>

    <div class="content">
      <h2>Reset Your Password</h2>

      <p>We received a request to reset the password for your Alphalabs Trading account.</p>

      <p>Click the button below to create a new password:</p>

      <center>
        <a href="${resetUrl}" class="button">Reset Password</a>
      </center>

      <div class="security-notice">
        <p><strong>⚠️ Security Notice:</strong> This link will expire in 1 hour. If you didn't request this password reset, please ignore this email and your password will remain unchanged.</p>
      </div>

      <p>If the button doesn't work, you can copy and paste this link into your browser:</p>
      <p class="link">${resetUrl}</p>

      <p>For your security, never share this link with anyone.</p>
    </div>

    <div class="footer">
      <p><strong>Alphalabs Trading</strong></p>
      <p>Live Currency Strength & Economic Events</p>
      <p style="margin-top: 15px;">This is an automated email. Please do not reply to this message.</p>
    </div>
  </div>
</body>
</html>
    `;

    const textContent = `
Alphalabs Trading - Password Reset

We received a request to reset the password for your account.

To reset your password, visit this link:
${resetUrl}

This link will expire in 1 hour.

If you didn't request this password reset, please ignore this email and your password will remain unchanged.

For your security, never share this link with anyone.

---
Alphalabs Trading
Live Currency Strength & Economic Events
    `;

    // If Gmail is not configured, fall back to console logging (development mode)
    if (!this.isConfigured) {
      console.log('\n' + '='.repeat(80));
      console.log('📧 PASSWORD RESET EMAIL (Development Mode - Gmail not configured)');
      console.log('='.repeat(80));
      console.log(`To: ${toEmail}`);
      console.log(`Subject: ${subject}`);
      console.log(`Reset URL: ${resetUrl}`);
      console.log('='.repeat(80) + '\n');
      return true; // Return success even in dev mode
    }

    // Send the email
    try {
      const info = await this.transporter.sendMail({
        from: `"Alphalabs Trading" <${process.env.GMAIL_USER}>`,
        to: toEmail,
        subject: subject,
        text: textContent,
        html: htmlContent
      });

      console.log(`✅ Password reset email sent to ${toEmail}`);
      console.log(`Message ID: ${info.messageId}`);
      return true;
    } catch (error) {
      console.error('❌ Failed to send password reset email:', error.message);

      // Log to console as fallback
      console.log('\n' + '='.repeat(80));
      console.log('📧 PASSWORD RESET EMAIL (Fallback - SMTP failed)');
      console.log('='.repeat(80));
      console.log(`To: ${toEmail}`);
      console.log(`Reset URL: ${resetUrl}`);
      console.log('='.repeat(80) + '\n');

      // Don't throw error - we don't want to reveal to user if email failed
      return false;
    }
  }

  /**
   * Verify email service is working
   * @returns {Promise<boolean>}
   */
  async verifyConnection() {
    if (!this.isConfigured) {
      console.log('⚠️  Email service not configured');
      return false;
    }

    try {
      await this.transporter.verify();
      console.log('✅ Email service connection verified');
      return true;
    } catch (error) {
      console.error('❌ Email service connection failed:', error.message);
      return false;
    }
  }
}

// Export singleton instance
module.exports = new EmailService();
