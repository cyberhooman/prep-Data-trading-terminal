/**
 * Google OAuth Authentication Setup
 * ------------------------------------------------
 * Handles Google OAuth login for the trading dashboard
 */

const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const LocalStrategy = require('passport-local').Strategy;
const bcrypt = require('bcrypt');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

const USERS_FILE = path.join(__dirname, 'users.json');

// Trial configuration
const TRIAL_DAYS = 7; // 7-day free trial

// Subscription plans (in days)
const SUBSCRIPTION_PLANS = {
  '1_month': { days: 30, label: '1 Month' },
  '3_months': { days: 90, label: '3 Months' },
  '1_year': { days: 365, label: '1 Year' }
};

// Admin emails (only these users can access admin panel)
const ADMIN_EMAILS = ['aaidilfadly12@gmail.com'];

// Helper functions for user management
async function readUsers() {
  try {
    const data = await fs.readFile(USERS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    return [];
  }
}

async function writeUsers(users) {
  await fs.writeFile(USERS_FILE, JSON.stringify(users, null, 2));
}

async function findUserByEmail(email) {
  const users = await readUsers();
  return users.find(u => u.email === email);
}

async function createUser(email, password, displayName) {
  const users = await readUsers();
  const hashedPassword = await bcrypt.hash(password, 10);
  const now = new Date();
  const trialEndDate = new Date(now.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);

  const newUser = {
    id: Date.now().toString(),
    email,
    password: hashedPassword,
    displayName: displayName || email.split('@')[0],
    createdAt: now.toISOString(),
    // Trial fields
    trialStartDate: now.toISOString(),
    trialEndDate: trialEndDate.toISOString(),
    subscriptionStatus: 'trial', // trial, active, expired
    plan: 'free' // free, pro (for future use)
  };
  users.push(newUser);
  await writeUsers(users);
  return newUser;
}

/**
 * Calculate trial/subscription status for a user
 * @param {Object} user - User object
 * @returns {Object} - Status info
 */
function getTrialStatus(user) {
  const now = new Date();

  // If user has active paid subscription, check if it's still valid
  if (user.subscriptionStatus === 'active' && user.subscriptionEndDate) {
    const subEnd = new Date(user.subscriptionEndDate);
    const diffMs = subEnd - now;
    const daysRemaining = Math.ceil(diffMs / (24 * 60 * 60 * 1000));

    if (diffMs <= 0) {
      // Subscription expired
      return {
        isValid: false,
        isActive: false,
        isTrial: false,
        isExpired: true,
        isPaid: true,
        subscriptionPlan: user.subscriptionPlan,
        daysRemaining: 0,
        message: 'Subscription expired'
      };
    }

    // Active paid subscription
    const planInfo = SUBSCRIPTION_PLANS[user.subscriptionPlan] || { label: 'Pro' };
    return {
      isValid: true,
      isActive: true,
      isTrial: false,
      isPaid: true,
      subscriptionStatus: 'active',
      subscriptionPlan: user.subscriptionPlan,
      subscriptionEndDate: user.subscriptionEndDate,
      daysRemaining: daysRemaining,
      message: `${planInfo.label} - ${daysRemaining} day${daysRemaining !== 1 ? 's' : ''} left`
    };
  }

  // Legacy active status without end date (grandfathered users)
  if (user.subscriptionStatus === 'active' && !user.subscriptionEndDate) {
    return {
      isValid: true,
      isActive: true,
      isTrial: false,
      isPaid: true,
      daysRemaining: null,
      message: 'Active subscription (lifetime)'
    };
  }

  // If no trial fields, user is from before trial system (migrate them)
  if (!user.trialEndDate) {
    return {
      isValid: true,
      isActive: true,
      isTrial: false,
      needsMigration: true,
      daysRemaining: null,
      message: 'Legacy user - needs migration'
    };
  }

  // Check trial status
  const trialEnd = new Date(user.trialEndDate);
  const diffMs = trialEnd - now;
  const daysRemaining = Math.ceil(diffMs / (24 * 60 * 60 * 1000));

  if (diffMs <= 0) {
    return {
      isValid: false,
      isActive: false,
      isTrial: true,
      isExpired: true,
      daysRemaining: 0,
      message: 'Trial expired'
    };
  }

  return {
    isValid: true,
    isActive: true,
    isTrial: true,
    isExpired: false,
    daysRemaining: daysRemaining,
    message: `${daysRemaining} day${daysRemaining !== 1 ? 's' : ''} left in trial`
  };
}

/**
 * Migrate existing users to trial system
 * Starts their 7-day trial from now
 */
async function migrateExistingUsers() {
  const users = await readUsers();
  let migrated = 0;

  const now = new Date();
  const trialEndDate = new Date(now.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);

  for (const user of users) {
    if (!user.trialStartDate) {
      user.trialStartDate = now.toISOString();
      user.trialEndDate = trialEndDate.toISOString();
      user.subscriptionStatus = 'trial';
      user.plan = 'free';
      migrated++;
    }
  }

  if (migrated > 0) {
    await writeUsers(users);
    console.log(`Migrated ${migrated} existing user(s) to trial system`);
  }

  return migrated;
}

/**
 * Update user subscription status (legacy function)
 * @param {string} email - User email
 * @param {string} status - New status (trial, active, expired)
 * @param {string} plan - Plan type (free, pro)
 */
async function updateSubscription(email, status, plan = 'pro') {
  const users = await readUsers();
  const user = users.find(u => u.email === email);

  if (!user) {
    return null;
  }

  user.subscriptionStatus = status;
  user.plan = plan;

  if (status === 'active') {
    user.subscriptionActivatedAt = new Date().toISOString();
  }

  await writeUsers(users);
  return user;
}

/**
 * Activate a paid subscription for a user
 * @param {string} email - User email
 * @param {string} planType - Plan type: '1_month', '3_months', or '1_year'
 * @returns {Object|null} - Updated user or null if not found
 */
async function activateSubscription(email, planType) {
  const users = await readUsers();
  const user = users.find(u => u.email === email);

  if (!user) {
    return { error: 'User not found' };
  }

  const planInfo = SUBSCRIPTION_PLANS[planType];
  if (!planInfo) {
    return { error: 'Invalid plan type' };
  }

  const now = new Date();
  const endDate = new Date(now.getTime() + planInfo.days * 24 * 60 * 60 * 1000);

  user.subscriptionStatus = 'active';
  user.subscriptionPlan = planType;
  user.subscriptionStartDate = now.toISOString();
  user.subscriptionEndDate = endDate.toISOString();
  user.plan = 'pro';

  await writeUsers(users);
  return { success: true, user };
}

/**
 * Cancel/expire a user's subscription
 * @param {string} email - User email
 * @returns {Object|null} - Updated user or null if not found
 */
async function cancelSubscription(email) {
  const users = await readUsers();
  const user = users.find(u => u.email === email);

  if (!user) {
    return { error: 'User not found' };
  }

  user.subscriptionStatus = 'expired';
  user.plan = 'free';
  delete user.subscriptionEndDate;
  delete user.subscriptionPlan;

  await writeUsers(users);
  return { success: true, user };
}

/**
 * Get all users (for admin panel)
 * @returns {Array} - All users with subscription info
 */
async function getAllUsers() {
  const users = await readUsers();
  // Return users without passwords
  return users.map(user => {
    const { password, resetToken, resetTokenExpires, ...safeUser } = user;
    return {
      ...safeUser,
      trialStatus: getTrialStatus(user)
    };
  });
}

/**
 * Check if a user is an admin
 * @param {Object} user - User object
 * @returns {boolean}
 */
function isAdmin(user) {
  if (!user) return false;
  const email = user.email || (user.emails && user.emails[0]?.value);
  return email && ADMIN_EMAILS.includes(email);
}

async function createPasswordResetToken(email) {
  const users = await readUsers();
  const user = users.find(u => u.email === email);

  if (!user) {
    return null;
  }

  // Generate a secure random token
  const crypto = require('crypto');
  const token = crypto.randomBytes(32).toString('hex');
  const expires = Date.now() + (60 * 60 * 1000); // 1 hour from now

  // Store reset token with user
  user.resetToken = token;
  user.resetTokenExpires = expires;

  await writeUsers(users);
  return token;
}

async function validateResetToken(token) {
  const users = await readUsers();
  const user = users.find(u => u.resetToken === token && u.resetTokenExpires > Date.now());
  return user;
}

async function resetPassword(token, newPassword) {
  const users = await readUsers();
  const userIndex = users.findIndex(u => u.resetToken === token && u.resetTokenExpires > Date.now());

  if (userIndex === -1) {
    return false;
  }

  // Hash new password
  const hashedPassword = await bcrypt.hash(newPassword, 10);

  // Update password and remove reset token
  users[userIndex].password = hashedPassword;
  delete users[userIndex].resetToken;
  delete users[userIndex].resetTokenExpires;

  await writeUsers(users);
  return true;
}

// Validate required environment variables
if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
  console.error('ERROR: Missing Google OAuth credentials!');
  console.error('Please create a .env file with GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET');
  console.error('See .env.example for template');
}

// Configure Local Strategy for email/password login
passport.use(new LocalStrategy({
  usernameField: 'email',
  passwordField: 'password'
}, async (email, password, done) => {
  try {
    const user = await findUserByEmail(email);
    if (!user) {
      return done(null, false, { message: 'Invalid email or password' });
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return done(null, false, { message: 'Invalid email or password' });
    }

    return done(null, user);
  } catch (err) {
    return done(err);
  }
}));

// Configure Google OAuth Strategy
passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID || 'missing',
  clientSecret: process.env.GOOGLE_CLIENT_SECRET || 'missing',
  callbackURL: `${process.env.APP_URL || 'http://localhost:3000'}/auth/google/callback`
},
function(accessToken, refreshToken, profile, cb) {
  // Check if user email domain is allowed (if ALLOWED_DOMAINS is set)
  const allowedDomains = process.env.ALLOWED_DOMAINS ? process.env.ALLOWED_DOMAINS.split(',').map(d => d.trim()) : [];

  if (allowedDomains.length > 0) {
    const email = profile.emails[0].value;
    const emailDomain = email.split('@')[1];

    if (!allowedDomains.includes(emailDomain)) {
      return cb(null, false, { message: 'Email domain not allowed' });
    }
  }

  // Return user profile
  return cb(null, profile);
}));

// Serialize user for session
passport.serializeUser((user, done) => {
  done(null, user);
});

// Deserialize user from session
passport.deserializeUser((user, done) => {
  done(null, user);
});

// Middleware to check if user is authenticated
function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.redirect('/login');
}

/**
 * Middleware to check if user's trial is valid
 * Redirects to upgrade page if trial has expired
 */
function ensureTrialValid(req, res, next) {
  if (!req.isAuthenticated()) {
    return res.redirect('/login');
  }

  const user = req.user;
  const trialStatus = getTrialStatus(user);

  // Attach trial status to request for use in templates
  req.trialStatus = trialStatus;
  res.locals.trialStatus = trialStatus;

  if (!trialStatus.isValid) {
    // Trial expired - redirect to upgrade page
    return res.redirect('/upgrade');
  }

  next();
}

/**
 * Middleware to attach trial status to all authenticated requests
 * Does not block access, just adds info for UI display
 */
function attachTrialStatus(req, res, next) {
  if (req.isAuthenticated() && req.user) {
    const trialStatus = getTrialStatus(req.user);
    req.trialStatus = trialStatus;
    res.locals.trialStatus = trialStatus;
  }
  next();
}

/**
 * Middleware to ensure user is an admin
 * Returns 403 for non-admin users
 */
function ensureAdmin(req, res, next) {
  if (!req.isAuthenticated()) {
    return res.redirect('/login');
  }

  if (!isAdmin(req.user)) {
    return res.status(403).send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Access Denied</title>
          <style>
            body { font-family: system-ui; background: #0a0a0f; color: #fff; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
            .container { text-align: center; }
            h1 { color: #ef4444; }
            a { color: #6366f1; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>403 - Access Denied</h1>
            <p>You don't have permission to access this page.</p>
            <a href="/">Return to Dashboard</a>
          </div>
        </body>
      </html>
    `);
  }

  next();
}

module.exports = {
  passport,
  ensureAuthenticated,
  ensureTrialValid,
  attachTrialStatus,
  ensureAdmin,
  isAdmin,
  findUserByEmail,
  createUser,
  getTrialStatus,
  migrateExistingUsers,
  updateSubscription,
  activateSubscription,
  cancelSubscription,
  getAllUsers,
  createPasswordResetToken,
  validateResetToken,
  resetPassword,
  TRIAL_DAYS,
  SUBSCRIPTION_PLANS,
  ADMIN_EMAILS
};
