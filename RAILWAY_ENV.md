# Railway Environment Variables

Add these environment variables in Railway Settings > Variables:

## Required Variables

### Database
- `DATABASE_URL` - Auto-filled by Railway when you link PostgreSQL database

### Google OAuth
- `GOOGLE_CLIENT_ID` - Your Google OAuth Client ID
- `GOOGLE_CLIENT_SECRET` - Your Google OAuth Client Secret

### Application URL
- `APP_URL` - Set to: `https://www.0xdatatrade.xyz`
  (This is critical for OAuth callbacks and session cookies)

### Session Security
- `SESSION_SECRET` - Generate a random string (at least 32 characters)
  Example: `openssl rand -base64 32`

### Twitter/X API (Optional)
- `TWITTER_BEARER_TOKEN` - Twitter API Bearer Token for news scraping

## Production Settings
- `NODE_ENV` - Set to: `production`
- `PORT` - Set to: `3000`

## Notes
- After adding `APP_URL`, you need to redeploy the service
- Make sure `APP_URL` matches your custom domain in Railway networking settings
- The `.0xdatatrade.xyz` domain prefix allows cookies to work on both www and root domain
