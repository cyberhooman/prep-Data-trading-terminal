#!/usr/bin/env python3
"""
Script to update Currency Strength, CB Speeches, and Weekly Calendar pages with new sidebar layout
"""

import re

# Read the file
with open('index.js', 'r', encoding='utf-8') as f:
    content = f.read()

def generate_page_template(page_name, page_path, page_title, active_nav, root_id, jsx_file, footer_text, extra_scripts=""):
    """Generate the new sidebar layout template for a page"""

    # Nav items with active state
    nav_items = [
        ('/', 'Dashboard', '<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>'),
        ('/currency-strength', 'Currency Strength', '<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23,6 13.5,15.5 8.5,10.5 1,18"/><polyline points="17,6 23,6 23,12"/></svg>'),
        ('/cb-speeches', 'CB Speeches', '<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>'),
        ('/weekly-calendar', 'Weekly Calendar', '<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>')
    ]

    nav_html = ""
    for path, label, icon in nav_items:
        active = "active" if path == active_nav else ""
        active_check = f"${{req.path === '{path}' ? 'active' : ''}}"
        nav_html += f'''
            <a href="{path}" class="sidebar-nav-item {active_check}">
              {icon}
              <span>{label}</span>
            </a>'''

    return f'''<!DOCTYPE html>
<html lang="en" class="dark">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>{page_title}</title>
    <link rel="icon" type="image/svg+xml" href="/public/favicon.svg" />
    <script src="https://cdn.tailwindcss.com"></script>
    <script>
      tailwind.config = {{
        darkMode: 'class',
        theme: {{
          extend: {{
            colors: {{
              notion: {{
                bg: 'var(--bg)',
                sidebar: 'var(--sidebar)',
                hover: 'var(--hover)',
                border: 'var(--border)',
                text: 'var(--text)',
                muted: 'var(--muted)',
                block: 'var(--block)',
                overlay: 'var(--overlay)',
                blue: '#4E7CFF',
                red: '#FF5C5C',
                green: '#4CAF50',
                yellow: '#D9B310'
              }}
            }},
            fontFamily: {{
              sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
              display: ['Space Grotesk', 'sans-serif'],
              mono: ['JetBrains Mono', 'monospace'],
            }}
          }}
        }}
      }}
    </script>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&family=Space+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="/public/notion-theme.css?v=${{Date.now()}}">
    <link rel="stylesheet" href="/public/theme-2025.css?v=${{Date.now()}}">
  </head>
  <body class="bg-notion-bg">
    <!-- Mobile Backdrop -->
    <div id="mobile-backdrop" class="mobile-backdrop" onclick="closeSidebar()"></div>

    <div class="app-container">
      <!-- Sidebar -->
      <aside id="sidebar" class="sidebar">
        <!-- Brand -->
        <div class="sidebar-brand">
          <div class="sidebar-brand-inner">
            <div class="sidebar-logo">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2L2 22H22L12 2ZM12 7.5L17 17.5H7L12 7.5Z" fill="currentColor"/>
              </svg>
            </div>
            <div class="sidebar-brand-text">
              <span class="sidebar-brand-name">AlphaLabs</span>
              <span class="sidebar-brand-tagline">Pro Terminal</span>
            </div>
          </div>
        </div>

        <!-- Navigation -->
        <nav class="sidebar-nav">
          <div class="sidebar-nav-label">Trading Data</div>
          <a href="/" class="sidebar-nav-item ${{req.path === '/' ? 'active' : ''}}">
            <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
            <span>Dashboard</span>
          </a>
          <a href="/currency-strength" class="sidebar-nav-item ${{req.path === '/currency-strength' ? 'active' : ''}}">
            <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23,6 13.5,15.5 8.5,10.5 1,18"/><polyline points="17,6 23,6 23,12"/></svg>
            <span>Currency Strength</span>
          </a>
          <a href="/cb-speeches" class="sidebar-nav-item ${{req.path === '/cb-speeches' ? 'active' : ''}}">
            <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
            <span>CB Speeches</span>
          </a>
          <a href="/weekly-calendar" class="sidebar-nav-item ${{req.path === '/weekly-calendar' ? 'active' : ''}}">
            <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            <span>Weekly Calendar</span>
          </a>
        </nav>

        <!-- Footer -->
        <div class="sidebar-footer">
          <div class="sidebar-footer-item" onclick="toggleTheme()">
            <svg id="theme-icon" class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
            <span id="theme-text">Light Mode</span>
          </div>
          ${{user ? '<a href="/auth/logout" class="sidebar-footer-item logout"><svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16,17 21,12 16,7"/><line x1="21" y1="12" x2="9" y2="12"/></svg><span>Logout</span></a>' : ''}}
        </div>
      </aside>

      <!-- Main Content -->
      <div class="main-content">
        <!-- Top Bar -->
        <div class="top-bar">
          <div class="top-bar-left">
            <button class="mobile-menu-btn" onclick="openSidebar()">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
            </button>
            <div class="hidden lg:flex w-6 h-6 bg-gradient-to-br from-indigo-500 to-blue-600 rounded-md text-white items-center justify-center shadow-sm">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M12 2L2 22H22L12 2ZM12 7.5L17 17.5H7L12 7.5Z" fill="currentColor"/></svg>
            </div>
            <div class="top-bar-breadcrumb">
              <span class="hidden lg:block hover:text-notion-text cursor-pointer">AlphaLabs</span>
              <span class="hidden lg:block top-bar-breadcrumb-divider">/</span>
              <span class="text-notion-text font-medium">{page_name}</span>
            </div>
          </div>
          <div class="top-bar-right">
            <div class="status-badge hidden sm:flex">
              <span class="status-dot"></span>
              <span>DATA LIVE</span>
            </div>
            <div class="hidden sm:block h-4 w-px bg-notion-border"></div>
            <button class="top-bar-btn">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
              <span class="notification-dot"></span>
            </button>
            ${{user ? '<div class="hidden sm:flex items-center gap-2"><img src="' + (user.picture || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(user.displayName || user.email) + '&background=6366f1&color=fff') + '" class="w-8 h-8 rounded-full border-2 border-indigo-500/30" alt=""/><span class="text-sm text-notion-text font-medium hidden md:block">' + (user.displayName || user.email.split('@')[0]) + '</span></div>' : ''}}
          </div>
        </div>

        <!-- Page Content -->
        <div class="dashboard-content">
          <div id="{root_id}"></div>
        </div>
      </div><!-- end main-content -->
    </div><!-- end app-container -->

    <!-- Footer -->
    <div class="fixed bottom-0 left-0 right-0 lg:left-64 py-2 px-4 text-center text-xs text-notion-muted bg-notion-bg/80 backdrop-blur-sm border-t border-notion-border">
      {footer_text}
    </div>

    <script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
    <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
    <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
    <script type="text/babel" src="{jsx_file}"></script>
    {extra_scripts}
    <script>
      // Sidebar functions
      function openSidebar() {{
        document.getElementById('sidebar').classList.add('open');
        document.getElementById('mobile-backdrop').classList.add('active');
      }}
      function closeSidebar() {{
        document.getElementById('sidebar').classList.remove('open');
        document.getElementById('mobile-backdrop').classList.remove('active');
      }}
      // Theme toggle
      function toggleTheme() {{
        const html = document.documentElement;
        const themeText = document.getElementById('theme-text');
        if (html.classList.contains('dark')) {{
          html.classList.remove('dark');
          if (themeText) themeText.textContent = 'Dark Mode';
          localStorage.setItem('theme', 'light');
        }} else {{
          html.classList.add('dark');
          if (themeText) themeText.textContent = 'Light Mode';
          localStorage.setItem('theme', 'dark');
        }}
      }}
      // Apply saved theme
      (function() {{
        const savedTheme = localStorage.getItem('theme');
        const html = document.documentElement;
        const themeText = document.getElementById('theme-text');
        if (savedTheme === 'light') {{
          html.classList.remove('dark');
          if (themeText) themeText.textContent = 'Dark Mode';
        }} else {{
          html.classList.add('dark');
          if (themeText) themeText.textContent = 'Light Mode';
        }}
      }})();
    </script>
  </body>
</html>'''


# Update Currency Strength page
currency_strength_old = r'''// Currency Strength Page
app.get\('/currency-strength', ensureAuthenticated, async \(req, res\) => \{
  const user = req\.user;

  const authControlsHtml = user
    \? `<div class="auth-controls">
         <div class="auth-user">
           <strong>\$\{user\.displayName \|\| user\.email\}</strong>
           <span>Authenticated</span>
         </div>
         \$\{user\.picture \? `<img src="\$\{user\.picture\}" alt="User" class="auth-avatar" />` : ''\}
         <a href="/logout" class="auth-button logout">Logout</a>
       </div>`
    : `<a href="/login" class="auth-button login">Login</a>`;

  const html = `<!DOCTYPE html>.*?</html>`;

  res\.send\(html\);
\}\);'''

# Use simpler approach - find start and end markers
def update_page(content, route_path, page_name, page_title, root_id, jsx_file, footer_text, extra_scripts=""):
    """Update a specific page route with new sidebar layout"""

    # Find the route start
    route_pattern = f"app.get('{route_path}', ensureAuthenticated, async (req, res) => {{"
    route_start = content.find(route_pattern)

    if route_start == -1:
        print(f"Could not find route: {route_path}")
        return content

    # Find the html template start (const html = `<!DOCTYPE html>)
    html_start = content.find("const html = `<!DOCTYPE html>", route_start)
    if html_start == -1:
        print(f"Could not find html template for {route_path}")
        return content

    # Find the closing of the html template (</html>`;)
    html_end = content.find("</html>`;", html_start)
    if html_end == -1:
        print(f"Could not find html end for {route_path}")
        return content

    # Generate new template
    new_html = generate_page_template(page_name, route_path, page_title, route_path, root_id, jsx_file, footer_text, extra_scripts)

    # Replace the template
    new_content = content[:html_start] + "const html = `" + new_html + "`" + content[html_end + len("</html>`;") - 2:]

    print(f"Updated {route_path}")
    return new_content

# Update each page
content = update_page(
    content,
    '/currency-strength',
    'Currency Strength',
    'Currency Strength - Alphalabs',
    'currency-strength-root',
    '/currency-strength.jsx',
    'Updated every 4 hours • Real-time currency strength analysis'
)

content = update_page(
    content,
    '/cb-speeches',
    'CB Speeches',
    'CB Speeches & Analysis - Alphalabs',
    'cb-speech-root',
    '/cb-speech-analysis.jsx',
    'Updated on demand • Powered by AI Analysis',
    extra_scripts='''<script type="text/babel" data-presets="env,react">
      const cbroot = ReactDOM.createRoot(document.getElementById('cb-speech-root'));
      cbroot.render(React.createElement(CBSpeechAnalysis));
    </script>'''
)

content = update_page(
    content,
    '/weekly-calendar',
    'Weekly Calendar',
    'Weekly Calendar - Alphalabs Data Trading',
    'weekly-calendar-root',
    '/weekly-calendar.jsx',
    'All events auto-updated • Tracking Forex, CB Speeches & Trump Schedule'
)

# Write back
with open('index.js', 'w', encoding='utf-8') as f:
    f.write(content)

print("All pages updated successfully!")
