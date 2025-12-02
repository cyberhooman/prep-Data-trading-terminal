# X (Twitter) API Setup Guide for Financial News

This guide will help you set up X API access to fetch financial news from @FinancialJuice's X account.

## Why X API?

✅ **More reliable** than web scraping (no modal popups, no HTML changes)
✅ **Real-time** tweets as they're posted
✅ **Free tier** includes 500k tweets/month (more than enough)
✅ **Clean data** in JSON format
✅ **No browser overhead** (lighter than Puppeteer)

## Step 1: Create X Developer Account

1. Go to **https://developer.twitter.com/en/portal/dashboard**
2. Sign in with your X (Twitter) account
3. Click **"Sign up for Free Account"**
4. Fill out the application:
   - **What's your name?** Your name
   - **What country do you live in?** Your country
   - **What's your use case?** Select **"Making a bot"** or **"Exploring the API"**
   - **Will you make X content available to government entities?** Select **"No"**
5. Accept the Terms and click **"Submit"**

## Step 2: Create an App

1. Once approved, go to the **Developer Portal Dashboard**
2. Click **"Create App"** or **"+ Create Project"**
3. Name your app (e.g., "AlphaLabs Financial News")
4. Click **"Next"** and complete the setup

## Step 3: Get Your Bearer Token

1. In your app's dashboard, go to the **"Keys and tokens"** tab
2. Under **"Bearer Token"**, click **"Generate"**
3. **IMPORTANT:** Copy the Bearer Token immediately - you won't see it again!
4. It looks like: `AAAAAAAAAAAAAAAAAAAAABcdefghijklmnopqrstuvwxyz1234567890`

## Step 4: Add Token to Railway

### Option A: Via Railway Dashboard (Recommended)
1. Go to https://railway.app/dashboard
2. Select your project: **prep-Data-trading-terminal**
3. Click on your service
4. Go to the **"Variables"** tab
5. Click **"+ New Variable"**
6. Add:
   - **Variable name:** `X_BEARER_TOKEN`
   - **Value:** [Paste your Bearer Token]
7. Click **"Add"**
8. Railway will automatically redeploy with the new variable

### Option B: Via Railway CLI
```bash
railway variables set X_BEARER_TOKEN="your-bearer-token-here"
```

## Step 5: Verify It's Working

After Railway redeploys (takes ~2 minutes):

1. Check the news API:
   ```bash
   curl https://www.0xdatatrade.xyz/api/financial-news
   ```

2. Look for `"source": "x_api"` in the response
   - If you see `"source": "x_api"` ✅ X API is working!
   - If you see `"source": "web_scraping"` ❌ Token not configured or invalid

3. Check Railway logs for:
   ```
   Fetching news from X API...
   Successfully fetched X items from X API
   ```

## Testing Locally (Optional)

To test on your local machine:

1. Create a `.env` file in the project root:
   ```
   X_BEARER_TOKEN=your-bearer-token-here
   ```

2. Start the server:
   ```bash
   npm start
   ```

3. Test the API:
   ```bash
   curl http://localhost:3000/api/financial-news
   ```

## Troubleshooting

### Error: "X_BEARER_TOKEN not found"
- ✅ Add the token to Railway variables
- ✅ Make sure the variable name is exactly `X_BEARER_TOKEN`
- ✅ Check Railway logs to confirm the variable is set

### Error: "Failed to fetch user: Unauthorized"
- ❌ Bearer Token is invalid or expired
- ✅ Regenerate the token in X Developer Portal
- ✅ Update Railway variable with new token

### Error: "Failed to fetch tweets: Too Many Requests"
- ❌ Hit rate limit (500k tweets/month)
- ✅ Wait a few minutes and try again
- ✅ Check usage in X Developer Portal

### Still seeing "source": "web_scraping"
- The app falls back to web scraping if X API fails
- Check Railway logs for error messages
- Verify token is correctly set in Railway variables

## API Rate Limits

**Free Tier:**
- 500,000 tweets/month
- ~16,600 tweets/day
- Our app uses ~720 requests/day (1 every 2 minutes)
- **You have plenty of headroom!**

## Need Help?

- X API Docs: https://developer.twitter.com/en/docs/twitter-api
- Railway Docs: https://docs.railway.app/
- Check Railway logs for detailed error messages

## What Happens Next?

Once configured, the app will:
1. Fetch tweets from @FinancialJuice every 2 minutes
2. Filter for high-impact news (economic data, breaking news)
3. Mark critical items with red badges
4. Store news for 1 week (same as before)
5. Display in the "Critical Market News" section

**No code changes needed - just add the token and it works!**
