# Railway Deployment Guide

Deploy your Express.js trading dashboard to Railway.app in minutes!

## Why Railway?

✅ **Perfect for Express.js** - Supports traditional Node.js servers
✅ **Free Tier** - $5/month free credit (enough for this app)
✅ **Auto HTTPS** - Automatic SSL certificates
✅ **GitHub Integration** - Auto-deploy on push
✅ **Easy Environment Variables** - Simple dashboard setup

---

## Step 1: Create Railway Account

1. **Go to Railway.app**
   - Visit: https://railway.app/
   - Click "Start a New Project"
   - Sign in with GitHub

2. **Authorize Railway**
   - Grant Railway access to your GitHub repositories

---

## Step 2: Deploy Your App

1. **Create New Project**
   - Click "New Project"
   - Select "Deploy from GitHub repo"
   - Choose your repository: `prep-Data-trading-terminal`

2. **Railway will automatically:**
   - Detect it's a Node.js app
   - Run `npm install`
   - Start the app with `npm start`

3. **Wait for deployment** (1-2 minutes)

---

## Step 3: Configure Environment Variables

1. **Open your deployed service**
   - Click on your service in Railway dashboard

2. **Go to Variables tab**
   - Click "Variables" in the left sidebar

3. **Add these environment variables:**

   ```
   GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com

   GOOGLE_CLIENT_SECRET=your-google-client-secret

   SESSION_SECRET=your-random-session-secret

   NODE_ENV=production
   ```

   **Get your credentials from:**
   - Google Cloud Console → Credentials
   - Or from your local `.env` file

4. **Important:** Add `APP_URL` variable:
   - First, get your Railway app URL (see Step 4)
   - Then come back and add: `APP_URL=https://your-app.railway.app`

---

## Step 4: Get Your App URL

1. **Generate Public Domain**
   - Go to "Settings" tab
   - Scroll to "Networking"
   - Click "Generate Domain"
   - You'll get a URL like: `https://your-app.railway.app`

2. **Save this URL** - you'll need it for Google OAuth!

---

## Step 5: Update Google OAuth Settings

1. **Go to Google Cloud Console**
   - Visit: https://console.cloud.google.com/apis/credentials

2. **Click on your OAuth Client ID**
   - Find your OAuth 2.0 Client ID in the list

3. **Update Authorized Redirect URIs**
   - Add your Railway URL:
     ```
     https://your-app.railway.app/auth/google/callback
     ```
   - Keep the localhost one for local development:
     ```
     http://localhost:3000/auth/google/callback
     ```

4. **Update Authorized JavaScript Origins**
   - Add:
     ```
     https://your-app.railway.app
     ```

5. **Click SAVE**

---

## Step 6: Add APP_URL Environment Variable

Now that you have your Railway URL:

1. **Go back to Railway dashboard**
2. **Variables tab**
3. **Add:**
   ```
   APP_URL=https://your-app.railway.app
   ```
   (Replace with your actual Railway URL)

4. **The app will automatically redeploy**

---

## Step 7: Test Your Deployment! 🎉

1. **Visit your Railway URL**
   - `https://your-app.railway.app`

2. **You should see the login page**

3. **Click "Continue with Google"**

4. **Sign in and access your dashboard!**

---

## Monitoring & Logs

### View Logs
- Railway dashboard → Your service → "Deployments" tab
- Click on latest deployment to see logs

### Check Status
- Green dot = Running
- Red dot = Crashed (check logs)

### Restart Service
- Settings → Restart

---

## Database Persistence

Your SQLite database is stored in Railway's persistent volume:

- **Data location:** `/app/data/trading.db`
- **Automatically persisted** across deploys
- **Backed up** by Railway

---

## Auto-Deployment

Railway automatically deploys when you push to GitHub:

1. **Make changes locally**
2. **Commit and push:**
   ```bash
   git add .
   git commit -m "Your changes"
   git push origin main
   ```
3. **Railway auto-deploys** (watch in dashboard)

---

## Cost

**Free Tier:**
- $5 free credit/month
- ~550 hours runtime
- **This app uses ~$0.50/month** = 10 months free!

**After free tier:**
- Pay only for what you use
- ~$5/month for 24/7 uptime

---

## Environment Variables Reference

| Variable | Value | Purpose |
|----------|-------|---------|
| `GOOGLE_CLIENT_ID` | Your Google OAuth Client ID | Google login |
| `GOOGLE_CLIENT_SECRET` | Your Google OAuth Secret | Google login |
| `SESSION_SECRET` | Random string | Secure sessions |
| `APP_URL` | `https://your-app.railway.app` | OAuth redirects |
| `NODE_ENV` | `production` | Production mode |
| `PORT` | Auto-set by Railway | Server port |

---

## Troubleshooting

### "Error 400" on Google Login
✅ **Fix:** Make sure you added the Railway callback URL to Google OAuth settings

### App Crashes on Startup
✅ **Fix:** Check Railway logs for errors
✅ **Fix:** Make sure all environment variables are set

### "Module not found"
✅ **Fix:** Railway will auto-run `npm install`, wait for deployment to finish

### Database Issues
✅ **Fix:** Railway automatically creates persistent volumes
✅ **Fix:** Check logs for SQLite errors

### Changes Not Deploying
✅ **Fix:** Make sure you pushed to GitHub (`git push origin main`)
✅ **Fix:** Check Railway dashboard for deployment status

---

## Advanced: Custom Domain

Want to use your own domain?

1. **Railway Settings → Networking**
2. **Click "Custom Domain"**
3. **Enter your domain:** `trading.yourdomain.com`
4. **Add DNS records** (Railway provides instructions)
5. **Update Google OAuth** with new domain
6. **Update `APP_URL`** environment variable

---

## Security Checklist

Before going live:

- ✅ All environment variables set in Railway
- ✅ `.env` file NOT committed to GitHub
- ✅ Google OAuth redirect URIs updated
- ✅ Strong `SESSION_SECRET` (random, 32+ chars)
- ✅ `NODE_ENV=production` set
- ✅ Test login/logout flow
- ✅ Check that data persists after redeploy

---

## Support

- **Railway Docs:** https://docs.railway.app/
- **Railway Discord:** https://discord.gg/railway
- **Check logs** in Railway dashboard for errors

---

## Summary

1. ✅ Create Railway account
2. ✅ Deploy from GitHub
3. ✅ Add environment variables
4. ✅ Generate public domain
5. ✅ Update Google OAuth settings
6. ✅ Visit your live app!

**Your app is now live and accessible from anywhere! 🚀**
