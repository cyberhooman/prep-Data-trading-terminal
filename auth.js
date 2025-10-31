/**
 * Google OAuth Authentication Setup
 * ------------------------------------------------
 * Handles Google OAuth login for the trading dashboard
 */

const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
require('dotenv').config();

// Validate required environment variables
if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
  console.error('ERROR: Missing Google OAuth credentials!');
  console.error('Please create a .env file with GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET');
  console.error('See .env.example for template');
}

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
  ensureAuthenticated
};
