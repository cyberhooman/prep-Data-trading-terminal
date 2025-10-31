# Google Authentication Setup Guide

Your trading dashboard now requires Google login before access. Follow these steps to set it up:

## Step 1: Create Google OAuth Credentials

1. **Go to Google Cloud Console**
   - Visit: https://console.cloud.google.com/

2. **Create a New Project** (or select existing)
   - Click "Select a project" at the top
   - Click "NEW PROJECT"
   - Name it: "Alphalabs Trading Dashboard"
   - Click "CREATE"

3. **Enable Google+ API**
   - Go to: https://console.cloud.google.com/apis/library
   - Search for "Google+ API"
   - Click on it and click "ENABLE"

4. **Create OAuth Credentials**
   - Go to: https://console.cloud.google.com/apis/credentials
   - Click "CREATE CREDENTIALS" → "OAuth client ID"
   - If prompted, configure OAuth consent screen:
     - User Type: External
     - App name: "Alphalabs Trading Dashboard"
     - User support email: your email
     - Developer contact: your email
     - Click "SAVE AND CONTINUE" through the steps

5. **Configure OAuth Client**
   - Application type: **Web application**
   - Name: "Alphalabs Trading Dashboard"
   - **Authorized JavaScript origins:**
     - `http://localhost:3000`
   - **Authorized redirect URIs:**
     - `http://localhost:3000/auth/google/callback`
   - Click "CREATE"

6. **Copy Your Credentials**
   - You'll see a dialog with:
     - **Client ID** (looks like: `xxxxx.apps.googleusercontent.com`)
     - **Client Secret** (random string)
   - **SAVE THESE!** You'll need them in the next step

## Step 2: Configure Your App

1. **Create .env file**
   - Copy `.env.example` to `.env`:
     ```bash
     copy .env.example .env
     ```

2. **Edit .env file** with your credentials:
   ```env
   GOOGLE_CLIENT_ID=your-client-id-here.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=your-client-secret-here
   SESSION_SECRET=generate-a-random-string-here
   APP_URL=http://localhost:3000
   ALLOWED_DOMAINS=
   ```

3. **Generate Session Secret**
   - Use any random string generator, or run:
     ```bash
     node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
     ```

4. **Optional: Restrict to Specific Email Domains**
   - If you want to allow only specific email domains (e.g., your company):
     ```env
     ALLOWED_DOMAINS=yourdomain.com,anotherdomain.com
     ```
   - Leave empty to allow any Gmail user

## Step 3: Start Your App

1. **Start the server:**
   ```bash
   npm run dev:express
   ```

2. **Open your browser:**
   - Go to: http://localhost:3000
   - You'll be redirected to the login page

3. **Sign in with Google:**
   - Click "Continue with Google"
   - Select your Google account
   - Grant permissions
   - You'll be redirected to your dashboard!

## Features

✅ **Secure Login** - Google OAuth 2.0
✅ **Session Management** - 24-hour sessions
✅ **Domain Restrictions** - Optional email domain filtering
✅ **Logout** - Visit `/logout` to sign out

## Troubleshooting

### "Error: Missing Google OAuth credentials"
- Make sure you created the `.env` file
- Check that `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set correctly

### "Error 400: redirect_uri_mismatch"
- Go back to Google Cloud Console → Credentials
- Make sure `http://localhost:3000/auth/google/callback` is in Authorized redirect URIs
- Check that there are no extra spaces or typos

### "Access blocked: Authorization Error"
- Your OAuth consent screen needs to be configured
- Go to Google Cloud Console → OAuth consent screen
- Add your email to "Test users" if app is in testing mode

### "Email domain not allowed"
- Check your `ALLOWED_DOMAINS` in `.env`
- Make sure the domain matches your email (e.g., `gmail.com` for Gmail users)
- Leave empty to allow all users

## Production Deployment

When deploying to production (Vercel, etc.):

1. **Update OAuth Credentials:**
   - Add your production URL to Authorized JavaScript origins
   - Add `https://your-domain.com/auth/google/callback` to redirect URIs

2. **Update Environment Variables:**
   ```env
   GOOGLE_CLIENT_ID=your-client-id
   GOOGLE_CLIENT_SECRET=your-client-secret
   SESSION_SECRET=generate-new-random-secret
   APP_URL=https://your-domain.com
   ```

3. **Set in Vercel/Hosting:**
   - Add all environment variables in your hosting dashboard
   - Make sure to enable HTTPS (automatic in Vercel)

## Security Notes

- 🔒 Never commit your `.env` file to git
- 🔒 Use a strong random `SESSION_SECRET`
- 🔒 Keep your `GOOGLE_CLIENT_SECRET` private
- 🔒 Use HTTPS in production
- 🔒 Regularly rotate your secrets

## Adding a Logout Button

To add a logout button to your dashboard, add this to your HTML:

```html
<a href="/logout" style="color: #f87171; text-decoration: none;">🚪 Logout</a>
```

---

**Need help?** Check the Google OAuth documentation: https://developers.google.com/identity/protocols/oauth2
