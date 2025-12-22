#!/usr/bin/env python3
"""
Script to update the dashboard bento grid and closing tags
"""

# Read the file
with open('index.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Remove the duplicate message div and fix the bento container
old_bento = '''            <!-- Dashboard Grid -->
            <div class="dashboard-grid">
        ${message ? `<div class="message" style="max-width: 1480px; margin: 0 auto 1rem;">${escapeHtml(message)}</div>` : ''}

        <!-- BENTO LAYOUT: Event Countdown, Upcoming Events, Notes, Todo List -->
        <div class="bento-container" style="max-width: 1480px; margin: 0 auto 2rem;">
          <!-- Event Countdown Box (Top Left) -->
          <div class="bento-box bento-countdown">
            <h2 style="margin-bottom: 1rem; font-size: 1.3rem; font-weight: 700;">⏰ Next Event Countdown</h2>
            <div id="next-event-panel">
              ${nextEventPanel}
            </div>
          </div>

          <!-- Upcoming Events Box (Top Right) -->
          <div class="bento-box bento-events">
            <h2 style="margin-bottom: 1rem; font-size: 1.3rem; font-weight: 700;">📰 Upcoming High Impact News</h2>
            <p id="events-count-text" style="margin-bottom: 1rem; font-size: 0.85rem; color: rgba(226, 232, 240, 0.7);">
              Loading events...
            </p>
            <div class="events-preview">
              <div class="events-limited"></div>
            </div>
            <button id="toggle-events-btn" class="toggle-events-btn" style="margin-top: 1rem; padding: 0.6rem 1.2rem; background: rgba(251, 146, 60, 0.18); border: 1px solid rgba(251, 146, 60, 0.3); border-radius: 8px; cursor: pointer; font-weight: 600; font-size: 0.85rem; width: 100%; color: #fdba74;">
              Show All Events
            </button>
            <div id="events-expanded" style="display: none; margin-top: 1rem;">
              <div class="events-scroll" style="max-height: 350px; overflow-y: auto; padding: 0.5rem 0;">
                <div class="events-all"></div>
              </div>
            </div>
          </div>

          <!-- Quick Notes & Warnings Box (Bottom Right) -->
          <div class="bento-box bento-notes">
            <div id="notes-root"></div>
          </div>

          <!-- Todo List Box (Bottom Left) -->
          <div class="bento-box bento-todos">
            <div id="todo-root"></div>
          </div>
        </div>

        <!-- Financial News Feed -->
        <section style="max-width: 1480px; margin: 0 auto 1.5rem;">
          <div id="financial-news-root"></div>
        </section>

        <!-- Interest Rate Probability -->
        <section style="max-width: 1480px; margin: 0 auto 1.5rem;">
          <div id="interest-rate-root"></div>
        </section>
      </main>
      <footer>
        Updated on demand • Times are shown in your local timezone • Final 3 minutes include an audible tick
      </footer>'''

new_bento = '''            <!-- Dashboard Grid -->
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
          </div><!-- end dashboard-content -->
        </div><!-- end main-content -->
      </div><!-- end app-container -->

      <!-- Footer -->
      <div class="fixed bottom-0 left-0 right-0 lg:left-64 py-2 px-4 text-center text-xs text-notion-muted bg-notion-bg/80 backdrop-blur-sm border-t border-notion-border">
        Updated on demand • Times shown in local timezone • Final 3 minutes include audible tick
      </div>'''

if old_bento in content:
    content = content.replace(old_bento, new_bento)
    with open('index.js', 'w', encoding='utf-8') as f:
        f.write(content)
    print('Successfully updated bento grid and closing tags')
else:
    print('Could not find bento pattern')
    if 'bento-container' in content:
        print('Found bento-container')
    if 'dashboard-grid' in content:
        print('Found dashboard-grid')
