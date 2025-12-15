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
  const newUser = {
    id: Date.now().toString(),
    email,
    password: hashedPassword,
    displayName: displayName || email.split('@')[0],
    createdAt: new Date().toISOString()
  };
  users.push(newUser);
  await writeUsers(users);
  return newUser;
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

module.exports = {
  passport,
  ensureAuthenticated,
  findUserByEmail,
  createUser,
  createPasswordResetToken,
  validateResetToken,
  resetPassword
};
