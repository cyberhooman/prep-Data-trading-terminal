# Railway Deployment Guide
## Alphalabs Data Trading Dashboard

This guide will help you deploy your trading dashboard to Railway for 70 users.

---

## Prerequisites

- [x] Railway account with Hobby plan subscription
- [x] GitHub repository (this repo)
- [ ] Google OAuth credentials (for user authentication)

---

## Step 1: Create Railway Project

1. Go to [Railway.app](https://railway.app)
2. Click "New Project"
3. Select "Deploy from GitHub repo"
4. Choose this repository: `prep-Data-trading-terminal`
5. Railway will automatically detect Node.js and start building

---

## Step 2: Add PostgreSQL Database

1. In your Railway project, click "+ New"
2. Select "Database" → "PostgreSQL"
3. Railway will automatically:
   - Create a PostgreSQL database
   - Generate a `DATABASE_URL` environment variable
   - Link it to your app

**Important**: The `DATABASE_URL` is automatically injected into your app. No manual configuration needed!

---

## Step 3: Configure Environment Variables

Go to your app's "Variables" tab and add:

### Required Variables:

```env
NODE_ENV=production
PORT=3000
SESSION_SECRET=<generate-random-string-32-chars>
GOOGLE_CLIENT_ID=<your-google-oauth-client-id>
GOOGLE_CLIENT_SECRET=<your-google-oauth-client-secret>
GOOGLE_CALLBACK_URL=https://your-app-name.railway.app/auth/google/callback
```

### How to Get Google OAuth Credentials:

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or select existing)
3. Navigate to "APIs & Services" → "Credentials"
4. Click "Create Credentials" → "OAuth 2.0 Client ID"
5. Application type: "Web application"
6. Authorized redirect URIs: Add your Railway URL + `/auth/google/callback`
   - Example: `https://alphalabs-trading.railway.app/auth/google/callback`
7. Copy the Client ID and Client Secret to Railway environment variables

### Generate SESSION_SECRET:

```bash
# On your local machine, run:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copy the output and paste it as `SESSION_SECRET` in Railway.

---

## Step 4: Deploy

1. Railway will automatically deploy when you push to `main` branch
2. Watch the deployment logs in Railway dashboard
3. First deployment takes ~5-10 minutes (installing Chromium for Puppeteer)

---

## Step 5: Verify Deployment

1. Open your Railway app URL: `https://your-app-name.railway.app`
2. You should see the login page
3. Click "Login with Google"
4. Authorize the app
5. You should see your trading dashboard!

---

## Architecture

### Development Mode (Local):
- Uses JSON files for data storage (`data/*.json`)
- SQLite for trading database
- File-based news history

### Production Mode (Railway):
- Uses PostgreSQL for all data
- News history stored in `news_history` table
- Automatic 1-week retention cleanup
- Survives restarts and deployments

### Database Schema:

```sql
CREATE TABLE news_history (
  id SERIAL PRIMARY KEY,
  headline TEXT NOT NULL,
  timestamp TIMESTAMPTZ,
  economic_data JSONB,
  tags TEXT[],
  has_chart BOOLEAN,
  link TEXT,
  is_critical BOOLEAN,
  first_seen_at BIGINT NOT NULL,
  scraped_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(headline, timestamp)
);
```

---

## Features for 70 Users

✅ **Multi-user Support**: Each user has isolated OAuth session
✅ **Persistent Data**: PostgreSQL database survives restarts
✅ **News History**: 1-week retention for critical market news
✅ **Web Scraping**: Puppeteer with Chromium for FinancialJuice scraping
✅ **Auto-scaling**: Railway handles traffic spikes
✅ **HTTPS**: Automatic SSL certificates
✅ **CDN**: Fast global delivery

---

## Monitoring

### Railway Dashboard:
- **Metrics**: CPU, Memory, Network usage
- **Logs**: Real-time application logs
- **Deployments**: History of all deployments

### Useful Logs to Watch:
```
Loaded X news items from history
PostgreSQL connection pool initialized
Alphalabs data trading server running on http://0.0.0.0:3000
```

---

## Troubleshooting

### Issue: Puppeteer fails to launch

**Solution**: Check that `nixpacks.toml` includes Chromium:
```toml
[phases.setup]
nixPkgs = ['nodejs-20_x', 'chromium']
```

### Issue: Database connection fails

**Solution**: Ensure PostgreSQL is added and `DATABASE_URL` is injected by Railway

### Issue: OAuth redirect fails

**Solution**: Update `GOOGLE_CALLBACK_URL` to match your Railway domain exactly

### Issue: News history not persisting

**Solution**: Check that `NODE_ENV=production` is set in Railway variables

---

## Costs

**Railway Hobby Plan**: $5/month
- Included usage:
  - $5 worth of usage credits
  - Unlimited projects
  - PostgreSQL database
  - Automatic deployments

**Estimated monthly cost for 70 users**:
- ~$5-15/month (depending on traffic and scraping frequency)

---

## Scaling Beyond 70 Users

If you grow beyond 70 users, consider:

1. **Upgrade to Pro Plan** ($20/month for more resources)
2. **Optimize scraping**: Increase cache timeout to reduce FinancialJuice requests
3. **Add caching layer**: Use Redis for frequently accessed data
4. **Database optimization**: Add indexes for common queries

---

## Security Best Practices

✅ **Environment Variables**: Never commit `.env` to Git
✅ **OAuth Only**: Users must authenticate with Google
✅ **HTTPS**: Railway provides automatic SSL
✅ **Session Management**: Express-session with secure cookies
✅ **Rate Limiting**: Already configured in the app

---

## Support

- Railway Docs: https://docs.railway.app
- GitHub Issues: Create an issue in this repo
- Railway Discord: https://discord.gg/railway

---

## Quick Commands

### View Logs:
```bash
# In Railway dashboard, click on your app → "View Logs"
```

### Restart App:
```bash
# In Railway dashboard, click "Restart"
```

### Trigger Redeploy:
```bash
git commit --allow-empty -m "Trigger redeploy"
git push origin main
```

---

## What's Next?

1. ✅ Deploy to Railway
2. ✅ Add PostgreSQL
3. ✅ Configure environment variables
4. ✅ Test with 5-10 users first
5. [ ] Share the Railway URL with your 70 users
6. [ ] Monitor performance in Railway dashboard
7. [ ] Set up uptime monitoring (optional): UptimeRobot or Pingdom

---

**Deployment Status**: Ready to deploy! 🚀

Push your code to GitHub and let Railway handle the rest!
