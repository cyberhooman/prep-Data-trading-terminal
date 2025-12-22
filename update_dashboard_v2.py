#!/usr/bin/env python3
"""
Update dashboard to match v2.5 reference design exactly
"""

import re

# Read the file
with open('index.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Find the dashboard content section
old_dashboard = '''          <!-- Dashboard Content -->
          <div class="dashboard-content">
            <!-- Dashboard Header -->
            <div class="dashboard-header">
              <div class="dashboard-title">
                <h1>Market Dashboard</h1>
                <span class="version-badge">v2.5 PRO</span>
              </div>
            </div>

            ${message ? '<div class="mb-4 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 text-sm">' + escapeHtml(message) + '</div>' : ''}

            <!-- Dashboard Grid -->
            <div class="dashboard-grid">
              <!-- Countdown Block -->
              <div class="block countdown-block col-span-12 lg:col-span-4">
                <div class="block-inner">
                  <div class="glow"></div>
                  <span class="countdown-label">Next Event</span>
                  <div id="next-event-panel">
                    ${nextEventPanel}
                  </div>
                </div>
              </div>

              <!-- Events Block -->
              <div class="block events-block col-span-12 lg:col-span-4">
                <div class="block-header">
                  <div class="block-header-left">
                    <div class="block-header-icon teal">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                    </div>
                    <span class="block-title">Upcoming Events</span>
                  </div>
                  <p id="events-count-text" class="text-xs text-notion-muted">Loading...</p>
                </div>
                <div class="block-content events-preview">
                  <div class="events-limited"></div>
                </div>
                <div class="px-3 pb-3">
                  <button id="toggle-events-btn" class="w-full py-2 px-3 text-xs font-semibold rounded-lg bg-teal-500/10 text-teal-400 border border-teal-500/20 hover:bg-teal-500/20 transition-all">
                    Show All Events
                  </button>
                </div>
                <div id="events-expanded" style="display: none;">
                  <div class="events-scroll px-3 pb-3" style="max-height: 300px; overflow-y: auto;">
                    <div class="events-all"></div>
                  </div>
                </div>
              </div>

              <!-- Trading Prep Block -->
              <div class="block prep-block col-span-12 lg:col-span-4">
                <div id="todo-root"></div>
              </div>

              <!-- News Feed Block -->
              <div class="block news-block col-span-12 lg:col-span-8">
                <div id="financial-news-root"></div>
              </div>

              <!-- Quick Notes Block -->
              <div class="block notes-block col-span-12 lg:col-span-4">
                <div id="notes-root"></div>
              </div>
            </div>
          </div><!-- end dashboard-content -->'''

new_dashboard = '''          <!-- Dashboard Content -->
          <div class="flex-1 flex flex-col overflow-y-auto overflow-x-hidden p-4 md:p-6 gap-5 custom-scrollbar">
            <!-- Dashboard Header -->
            <div class="flex items-center justify-between shrink-0 mb-2 lg:mb-0">
              <div class="flex items-center gap-3 md:gap-4">
                <h1 class="text-xl md:text-2xl font-display font-bold text-notion-text tracking-tight">Market Dashboard</h1>
                <span class="px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-gradient-to-r from-blue-500/20 to-purple-500/20 text-blue-300 border border-blue-500/20 shadow-[0_0_10px_rgba(59,130,246,0.2)]">v2.5 PRO</span>
              </div>
            </div>

            ${message ? '<div class="mb-4 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 text-sm">' + escapeHtml(message) + '</div>' : ''}

            <!-- Dashboard Grid - 3 Column Layout -->
            <div class="flex flex-col lg:grid lg:grid-cols-12 gap-5 lg:flex-1">

              <!-- LEFT COLUMN: Countdown + Trading Prep -->
              <div class="col-span-12 lg:col-span-3 flex flex-col gap-5 h-auto lg:h-full min-h-0 order-1">

                <!-- Countdown Block -->
                <div class="h-40 lg:flex-[4] shrink-0 bg-notion-overlay backdrop-blur-xl border border-notion-border rounded-2xl p-6 flex flex-col relative overflow-hidden group shadow-2xl transition-colors duration-300">
                  <!-- Glow effect -->
                  <div class="absolute -top-10 -right-10 w-32 h-32 bg-blue-500/10 blur-[50px] rounded-full pointer-events-none group-hover:bg-blue-500/20 transition-colors duration-700"></div>

                  <div class="flex items-center justify-between relative z-10 mb-4">
                    <span class="text-[10px] font-bold font-mono text-blue-300 uppercase tracking-widest bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20">Next Event</span>
                    <div class="flex items-center gap-1.5" id="auto-badge-container">
                      <span class="text-[9px] font-mono text-green-400 opacity-80">AUTO</span>
                      <span class="w-1.5 h-1.5 bg-green-400 rounded-full shadow-[0_0_8px_rgba(74,222,128,0.8)] animate-pulse"></span>
                    </div>
                  </div>

                  <div class="flex-1 flex flex-col items-center justify-center relative z-10">
                    <div id="countdown-time" class="text-5xl xl:text-6xl font-display font-bold text-notion-text tracking-wider tabular-nums leading-none mb-4 drop-shadow-sm">
                      00:00:00
                    </div>
                    <div class="flex flex-col items-center gap-1">
                      <div class="flex items-center gap-2">
                        <span id="countdown-currency" class="font-mono font-bold text-sm text-blue-400 bg-blue-500/10 px-1.5 rounded">[GBP]</span>
                        <span id="countdown-name" class="text-notion-muted text-sm font-medium font-display tracking-wide">CPI y/y</span>
                      </div>
                      <div id="countdown-local" class="text-xs text-notion-muted font-mono mt-2 opacity-60">
                        14:00:00 LOCAL
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Trading Prep Block -->
                <div class="h-auto lg:flex-[6] min-h-0 bg-notion-overlay backdrop-blur-xl border border-notion-border rounded-2xl p-5 flex flex-col shadow-2xl relative overflow-hidden transition-colors duration-300">
                  <div class="absolute inset-0 bg-gradient-to-br from-notion-hover/10 to-transparent opacity-50 pointer-events-none"></div>
                  <div id="todo-root" class="relative z-10 flex flex-col h-full"></div>
                </div>
              </div>

              <!-- CENTER COLUMN: Live Newswire -->
              <div class="col-span-12 lg:col-span-6 h-[500px] lg:h-full min-h-0 order-3 lg:order-2">
                <div class="bg-notion-overlay backdrop-blur-xl border border-notion-border rounded-2xl flex flex-col h-full overflow-hidden shadow-2xl relative group transition-colors duration-300">
                  <!-- Header -->
                  <div class="px-5 py-4 border-b border-notion-border flex items-center justify-between shrink-0 bg-notion-block/50">
                    <div class="flex items-center gap-2.5">
                      <div class="p-1.5 bg-red-500/10 rounded-md border border-red-500/20">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-red-500 animate-pulse">
                          <circle cx="12" cy="12" r="10"/><polygon points="10,8 16,12 10,16"/></svg>
                      </div>
                      <h3 class="text-sm font-display font-semibold text-notion-text tracking-wide">Live Newswire</h3>
                    </div>
                    <div class="flex items-center gap-2">
                      <span class="text-[10px] font-mono text-notion-muted hidden lg:block">REAL-TIME</span>
                      <button id="refresh-news-btn" class="p-1.5 hover:bg-notion-hover rounded-md text-notion-muted hover:text-notion-text transition-all">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 21h5v-5"/></svg>
                      </button>
                    </div>
                  </div>

                  <!-- News Feed -->
                  <div id="financial-news-root" class="flex-1 overflow-y-auto custom-scrollbar"></div>

                  <!-- Gradient fade at bottom -->
                  <div class="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-notion-bg to-transparent pointer-events-none opacity-80"></div>
                </div>
              </div>

              <!-- RIGHT COLUMN: Schedule + Scratchpad -->
              <div class="col-span-12 lg:col-span-3 flex flex-col gap-5 h-auto lg:h-full min-h-0 order-2 lg:order-3">

                <!-- Schedule Block -->
                <div class="h-64 lg:flex-[6] min-h-0 bg-notion-overlay backdrop-blur-xl border border-notion-border rounded-2xl flex flex-col overflow-hidden shadow-xl transition-colors duration-300">
                  <div class="p-4 border-b border-notion-border flex items-center justify-between shrink-0 bg-notion-block/50">
                    <div class="flex items-center gap-2">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-teal-500"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                      <h3 class="text-sm font-display font-semibold text-notion-text tracking-wide">Schedule</h3>
                    </div>
                    <button class="text-notion-muted hover:text-notion-text">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>
                    </button>
                  </div>

                  <div class="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-2">
                    <div class="events-limited"></div>
                    <div id="events-expanded" style="display: none;">
                      <div class="events-all"></div>
                    </div>
                  </div>
                </div>

                <!-- Scratchpad Block -->
                <div class="h-64 lg:flex-[4] min-h-0 bg-notion-overlay backdrop-blur-xl border border-notion-border rounded-2xl p-4 flex flex-col shadow-xl transition-colors duration-300">
                  <div class="flex items-center gap-2 mb-3 shrink-0">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-yellow-500"><path d="M12 3l1.912 5.813a2 2 0 0 0 1.275 1.275L21 12l-5.813 1.912a2 2 0 0 0-1.275 1.275L12 21l-1.912-5.813a2 2 0 0 0-1.275-1.275L3 12l5.813-1.912a2 2 0 0 0 1.275-1.275L12 3Z"/></svg>
                    <h3 class="text-sm font-display font-semibold text-notion-text tracking-wide">Scratchpad</h3>
                    <span id="notes-count" class="text-[10px] text-notion-muted ml-auto font-mono bg-notion-block/50 px-1.5 py-0.5 rounded border border-notion-border">0</span>
                  </div>

                  <div id="notes-root" class="flex-1 flex flex-col min-h-0"></div>
                </div>
              </div>
            </div>
          </div><!-- end dashboard-content -->'''

# Replace
if old_dashboard in content:
    content = content.replace(old_dashboard, new_dashboard)
    print("Dashboard layout updated successfully!")
else:
    print("Could not find exact dashboard content to replace. Trying partial match...")
    # Try finding by markers
    start_marker = '<!-- Dashboard Content -->'
    end_marker = '</div><!-- end dashboard-content -->'

    start_idx = content.find(start_marker)
    end_idx = content.find(end_marker)

    if start_idx != -1 and end_idx != -1:
        end_idx = end_idx + len(end_marker)
        content = content[:start_idx] + new_dashboard + content[end_idx:]
        print("Dashboard layout updated using markers!")
    else:
        print("ERROR: Could not find dashboard content section")

# Write back
with open('index.js', 'w', encoding='utf-8') as f:
    f.write(content)

print("Done!")
