# Railway Deployment - Complete Setup Guide

Your Railway app is deployed at: **https://prep-data-trading-terminal-production.up.railway.app**

Follow these steps to complete the configuration:

---

## Step 1: Add Environment Variables in Railway ✅

1. **Go to Railway Dashboard**
   - Visit: https://railway.app/
   - Click on your project: `prep-data-trading-terminal`

2. **Open Variables Tab**
   - Click on your service
   - Click "Variables" in the left sidebar

3. **Add These Variables** (copy-paste each one):

```
GOOGLE_CLIENT_ID=92823922796-qi6t619qntfai7fpdgkpeeugt8q6fc6s.apps.googleusercontent.com
```

```
GOOGLE_CLIENT_SECRET=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
```

```
SESSION_SECRET=a8f4c9e2b7d6f1a3c8e5b2d9f6a3c7e4b1d8f5a2c9e6b3d0f7a4c1e8b5d2f9a6
```

```
NODE_ENV=production
```

```
APP_URL=https://prep-data-trading-terminal-production.up.railway.app
```

4. **Railway will automatically redeploy** after you add the variables (takes ~2 minutes)

---

## Step 2: Update Google OAuth Settings ✅

1. **Go to Google Cloud Console**
   - Visit: https://console.cloud.google.com/apis/credentials

2. **Click on your OAuth 2.0 Client ID**
   - Find: `92823922796-qi6t619qntfai7fpdgkpeeugt8q6fc6s.apps.googleusercontent.com`

3. **Update "Authorized redirect URIs"**

   Add these TWO URLs:
   ```
   http://localhost:3000/auth/google/callback
   ```
   ```
   https://prep-data-trading-terminal-production.up.railway.app/auth/google/callback
   ```

4. **Update "Authorized JavaScript origins"**

   Add these TWO URLs:
   ```
   http://localhost:3000
   ```
   ```
   https://prep-data-trading-terminal-production.up.railway.app
   ```

5. **Click SAVE** ⚠️ Important!

---

## Step 3: Test Your Deployment! 🎉

1. **Wait for Railway redeploy to complete** (~2 minutes)
   - Check Railway dashboard for green "Deployed" status

2. **Visit your production app:**
   ```
   https://prep-data-trading-terminal-production.up.railway.app
   ```

3. **You should see the login page**

4. **Click "Continue with Google"**

5. **Sign in with your Google account**

6. **You're in! 🚀**

---

## Local Development

Your local `.env` file has been updated with the NEW credentials.

To run locally:
```bash
npm run dev:express
```

Then visit: http://localhost:3000

---

## Quick Reference

| Environment | URL |
|-------------|-----|
| **Production** | https://prep-data-trading-terminal-production.up.railway.app |
| **Local Dev** | http://localhost:3000 |

| Credential | Value |
|------------|-------|
| **Client ID** | `92823922796-qi6t619qntfai7fpdgkpeeugt8q6fc6s` |
| **Railway Project** | `prep-data-trading-terminal` |

---

## Troubleshooting

### "Error 400: redirect_uri_mismatch"
✅ Make sure you added BOTH redirect URIs in Google Cloud Console (Step 2)

### App shows "Missing Google OAuth credentials"
✅ Check Railway Variables tab - all 5 environment variables should be there

### Changes not showing
✅ Railway redeploys automatically after adding variables (check Deployments tab)

### Database empty in production
✅ This is normal on first deploy - start adding your journal entries!

---

## Security Notes

✅ Your NEW credentials are now active
✅ OLD credentials (the exposed ones) should be deleted from Google Cloud Console
✅ `.env` file is in `.gitignore` - never committed to GitHub
✅ Railway environment variables are encrypted and secure

---

## Next Steps After Setup

Once everything works:

1. **Delete old OAuth credentials** in Google Cloud Console
   - The old exposed ones: `92823922796-blgqe9gef00e8q24lccrp8trqq428rsb`

2. **Test both environments:**
   - Local: http://localhost:3000
   - Production: https://prep-data-trading-terminal-production.up.railway.app

3. **Start using your app!** 🎉

---

## Support

- **Railway Logs:** Dashboard → Deployments → Click deployment → View logs
- **Railway Docs:** https://docs.railway.app/
- **Google OAuth:** https://console.cloud.google.com/apis/credentials

---

**Your app is ready! Follow the steps above to complete the setup.** ✨
