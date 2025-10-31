# Deployment Shortcuts for Alphalabs Trading Dashboard

## Quick Setup

### Step 1: Create Desktop Shortcut
Double-click **`create-desktop-shortcut.vbs`** to create a desktop shortcut for one-click deployment.

### Step 2: Install Vercel CLI (First Time Only)
```bash
npm install -g vercel
```

### Step 3: Login to Vercel (First Time Only)
```bash
vercel login
```

## Available Scripts

### 🚀 quick-deploy.bat
**One-click deployment** - Automatically commits, pushes to GitHub, and deploys to Vercel production.

**Usage:**
- Double-click the file, or
- Click the desktop shortcut "Deploy Trading Dashboard"

**What it does:**
1. ✅ Commits all changes to Git
2. ✅ Pushes to GitHub
3. ✅ Deploys to Vercel production
4. ✅ Shows deployment URL

### 📦 deploy-to-vercel.bat
**Interactive deployment** - More detailed output with step-by-step feedback.

**Usage:**
- Double-click the file
- Follow the prompts

**What it does:**
1. ✅ Checks if Vercel CLI is installed
2. ✅ Commits and pushes changes
3. ✅ Deploys to Vercel production
4. ✅ Pauses to show results

### 🔧 create-desktop-shortcut.vbs
Creates a desktop shortcut for quick-deploy.bat

**Usage:**
- Double-click once to create the shortcut
- Find "Deploy Trading Dashboard" on your desktop

## First Time Deployment

1. **Install Vercel CLI:**
   ```bash
   npm install -g vercel
   ```

2. **Login to Vercel:**
   ```bash
   vercel login
   ```
   - Opens browser for authentication
   - Choose your Vercel account

3. **First Deployment:**
   - Double-click `quick-deploy.bat` or use desktop shortcut
   - Vercel will ask configuration questions:
     - **Set up and deploy?** → Yes
     - **Which scope?** → Choose your account
     - **Link to existing project?** → No (first time)
     - **Project name?** → alphalabs-trading-dashboard
     - **Directory?** → ./ (press Enter)
     - **Override settings?** → No (press Enter)

4. **Subsequent Deployments:**
   - Just click the desktop shortcut!
   - No questions asked, instant deployment

## Deployment URLs

After deployment, you'll get two URLs:

- **Preview URL**: Unique URL for this deployment (e.g., `your-app-xyz123.vercel.app`)
- **Production URL**: Your main domain (e.g., `alphalabs-trading-dashboard.vercel.app`)

## Troubleshooting

### "Vercel CLI not found"
```bash
npm install -g vercel
```

### "Git not initialized"
```bash
git init
git remote add origin https://github.com/cyberhooman/prep-Data-trading-terminal.git
```

### "Authentication required"
```bash
vercel login
```

### "Permission denied"
- Right-click the .bat file
- Select "Run as administrator"

## Custom Domain Setup

1. Go to [vercel.com/dashboard](https://vercel.com/dashboard)
2. Select your project
3. Go to "Settings" → "Domains"
4. Add your custom domain
5. Follow DNS configuration instructions

## Environment Variables

To add API keys or secrets:

1. Go to [vercel.com/dashboard](https://vercel.com/dashboard)
2. Select your project
3. Go to "Settings" → "Environment Variables"
4. Add your variables:
   - `FOREX_API_KEY`
   - `DATABASE_URL`
   - etc.

## Tips

- 💡 **Quick Updates**: Just click the desktop shortcut to deploy changes
- 💡 **View Logs**: Visit Vercel dashboard to see deployment logs
- 💡 **Rollback**: Vercel keeps all deployments, you can rollback anytime
- 💡 **Preview Branches**: Create a branch, Vercel auto-deploys previews

## Files in This Package

- ✅ `quick-deploy.bat` - One-click deployment script
- ✅ `deploy-to-vercel.bat` - Interactive deployment with details
- ✅ `create-desktop-shortcut.vbs` - Creates desktop shortcut
- ✅ `DEPLOYMENT_SHORTCUTS.md` - This documentation

---

**Happy Deploying! 🚀**

Your trading dashboard will be live on Vercel in seconds!
