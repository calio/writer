// Writer AI - Content Script for Twitter/X
// Integrates with Twitter/X UI to provide AI-powered reply assistance

(function() {
  'use strict';

  // State
  let state = {
    candidates: [],
    selectedIndex: 0,
    isLoading: false,
    currentTextarea: null,
    currentPanel: null,
    userHistory: [],
    // Persisted state
    tone: 'match',
    feedback: '',
    lastCandidates: [],
    contextInvalidated: false
  };

  // Check if extension context is still valid
  function isExtensionContextValid() {
    try {
      // Multiple checks to ensure context is truly valid
      if (!chrome?.runtime) return false;
      if (!chrome.runtime.id) return false;
      // Try to access storage - this will throw if context is invalid
      if (!chrome?.storage?.local) return false;
      return true;
    } catch (e) {
      return false;
    }
  }

  // Show context invalidated error
  function showContextInvalidatedError(container) {
    state.contextInvalidated = true;
    if (container) {
      container.innerHTML = `
        <div class="tweetcraft-error" style="text-align: center;">
          <span>🔄 Extension was updated. Please refresh the page to continue.</span>
          <button class="tweetcraft-retry-btn" onclick="location.reload()">Refresh Page</button>
        </div>
      `;
    }
  }

  // Safe wrapper for Chrome API calls
  async function safeChromeSend(message) {
    if (!isExtensionContextValid()) {
      throw new Error('Extension context invalidated');
    }
    try {
      return await chrome.runtime.sendMessage(message);
    } catch (e) {
      if (e.message?.includes('Extension context invalidated') || 
          e.message?.includes('context invalidated') ||
          e.message?.includes('Receiving end does not exist')) {
        state.contextInvalidated = true;
        throw new Error('Extension context invalidated');
      }
      throw e;
    }
  }

  // Safe wrapper for Chrome storage
  async function safeChromeStorageGet(keys) {
    if (!isExtensionContextValid()) {
      throw new Error('Extension context invalidated');
    }
    try {
      return await chrome.storage.local.get(keys);
    } catch (e) {
      if (e.message?.includes('Extension context invalidated') || 
          e.message?.includes('context invalidated')) {
        state.contextInvalidated = true;
        throw new Error('Extension context invalidated');
      }
      throw e;
    }
  }

  // Safe wrapper for Chrome storage set
  async function safeChromeStorageSet(data) {
    if (!isExtensionContextValid()) {
      return; // Silently fail for set operations
    }
    try {
      await chrome.storage.local.set(data);
    } catch (e) {
      // Silently fail for storage set
      console.log('Writer: Could not save to storage', e.message);
    }
  }

  // Initialize
  function init() {
    console.log('Writer: Initializing...');
    
    // Remove any stale buttons from previous extension loads
    document.querySelectorAll('.tweetcraft-btn-wrapper').forEach(el => el.remove());
    document.querySelectorAll('.tweetcraft-inline-panel').forEach(el => el.remove());
    
    loadPanelState(); // Load persisted state
    setupGlobalClickHandler(); // Use event delegation for reliable click handling
    observeDOM();
    loadUserHistory();
  }
  
  // Global click handler using event delegation
  function setupGlobalClickHandler() {
    // Use multiple event types to ensure we catch the click
    const handleTweetCraftClick = (e) => {
      const btn = e.target.closest('.tweetcraft-btn');
      const wrapper = e.target.closest('.tweetcraft-btn-wrapper');
      
      if (!btn && !wrapper) return;
      
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      
      console.log('Writer: Button clicked via delegation!', e.type);
      
      // Debounce to prevent multiple fires
      if (window._tweetcraftClickDebounce) return;
      window._tweetcraftClickDebounce = true;
      setTimeout(() => { window._tweetcraftClickDebounce = false; }, 300);
      
      handleButtonClick(btn || wrapper.querySelector('.tweetcraft-btn'));
    };
    
    // Listen on multiple event types at capture phase
    document.addEventListener('click', handleTweetCraftClick, true);
    document.addEventListener('pointerdown', handleTweetCraftClick, true);
    document.addEventListener('mousedown', handleTweetCraftClick, true);
  }
  
  // Handle button click
  function handleButtonClick(btn) {
    const wrapper = btn.closest('.tweetcraft-btn-wrapper') || btn.parentElement;
    
    // Find container and textarea fresh at click time
    const toolbar = wrapper.closest('[role="group"]') || wrapper.closest('[role="tablist"]') || wrapper.closest('nav');
    const container = toolbar?.closest('form') || 
                     toolbar?.closest('[role="dialog"]') || 
                     toolbar?.closest('[data-testid="tweetTextarea_0"]')?.parentElement?.parentElement ||
                     toolbar?.parentElement?.parentElement;
    
    // Try multiple ways to find the textarea
    let textarea = container?.querySelector('[data-testid="tweetTextarea_0"], [data-testid="tweetTextarea_1"], [role="textbox"]');
    
    // If not found in container, search up and around the toolbar
    if (!textarea) {
      const parentContainer = toolbar?.closest('[data-testid="primaryColumn"]') || 
                             toolbar?.closest('[role="dialog"]') ||
                             toolbar?.parentElement?.parentElement?.parentElement;
      textarea = parentContainer?.querySelector('[data-testid="tweetTextarea_0"], [data-testid="tweetTextarea_1"], [role="textbox"]');
    }
    
    // Last resort - find any visible textarea on the page
    if (!textarea) {
      textarea = document.querySelector('[data-testid="tweetTextarea_0"]') || 
                document.querySelector('[role="dialog"] [role="textbox"]');
    }
    
    console.log('Writer: Context found', { toolbar: !!toolbar, container: !!container, textarea: !!textarea });
    toggleInlinePanel(textarea, container, btn);
  }

  // Load persisted panel state
  async function loadPanelState() {
    if (state.contextInvalidated) return;
    
    try {
      const saved = await safeChromeStorageGet(['panelTone', 'panelFeedback', 'panelCandidates']);
      if (saved.panelTone) state.tone = saved.panelTone;
      if (saved.panelFeedback) state.feedback = saved.panelFeedback;
      if (saved.panelCandidates) state.lastCandidates = saved.panelCandidates;
      console.log('Writer: Loaded panel state', { tone: state.tone, feedback: state.feedback?.substring(0, 20) });
    } catch (error) {
      console.log('Writer: Could not load panel state', error.message);
    }
  }

  // Save panel state
  async function savePanelState() {
    if (state.contextInvalidated) return;
    
    await safeChromeStorageSet({
      panelTone: state.tone,
      panelFeedback: state.feedback,
      panelCandidates: state.lastCandidates
    });
  }

  // Observe DOM for compose areas
  function observeDOM() {
    const observer = new MutationObserver(() => {
      clearTimeout(window.tweetcraftDebounce);
      window.tweetcraftDebounce = setTimeout(injectButtons, 100);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    setTimeout(injectButtons, 500);
    setTimeout(injectButtons, 1500);
  }

  // Inject TweetCraft buttons
  function injectButtons() {
    const mediaInputs = document.querySelectorAll('input[data-testid="fileInput"]');
    mediaInputs.forEach(input => {
      let toolbar = input.closest('[role="group"]') || input.closest('[role="tablist"]');
      if (!toolbar) toolbar = input.parentElement?.parentElement?.parentElement;
      if (!toolbar || toolbar.querySelector('.tweetcraft-btn-wrapper')) return;

      const btn = createTweetCraftButton();
      
      const mediaBtn = toolbar.querySelector('[aria-label="Add photos or video"]');
      if (mediaBtn && mediaBtn.parentElement) {
        mediaBtn.parentElement.insertBefore(btn, mediaBtn);
      } else {
        const firstBtn = toolbar.querySelector('button:not([disabled])');
        if (firstBtn && firstBtn.parentElement) {
          firstBtn.parentElement.insertBefore(btn, firstBtn);
        }
      }
    });
  }

  // Create TweetCraft button
  function createTweetCraftButton() {
    const wrapper = document.createElement('div');
    wrapper.className = 'tweetcraft-btn-wrapper';
    wrapper.style.cssText = 'display: inline-flex; align-items: center; justify-content: center;';
    
    // Use actual button element for better compatibility
    const btn = document.createElement('button');
    btn.className = 'tweetcraft-btn';
    btn.type = 'button';
    btn.title = 'Generate AI Reply';
    btn.setAttribute('aria-label', 'Generate AI Reply');
    btn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 2L2 7L12 12L22 7L12 2Z"/>
        <path d="M2 17L12 22L22 17"/>
        <path d="M2 12L12 17L22 12"/>
      </svg>
    `;
    
    // Event handling is done via delegation in setupGlobalClickHandler()
    // No need to attach listeners here - they would be lost on extension reload anyway

    wrapper.appendChild(btn);
    return wrapper;
  }

  // Toggle inline panel
  function toggleInlinePanel(textarea, container, btn) {
    // Remove existing panel if any
    const existingPanel = document.querySelector('.tweetcraft-inline-panel');
    if (existingPanel) {
      // Save state before closing
      const feedbackInput = existingPanel.querySelector('.tweetcraft-feedback-input');
      if (feedbackInput) {
        state.feedback = feedbackInput.value;
      }
      savePanelState();
      
      existingPanel.remove();
      state.currentPanel = null;
      document.querySelectorAll('.tweetcraft-btn.active, .tweetcraft-btn-wrapper .tweetcraft-btn.active').forEach(b => b.classList.remove('active'));
      return;
    }

    state.currentTextarea = textarea;
    btn.classList.add('active');
    
    // Create panel as a fixed overlay
    const panel = createInlinePanel(container);
    state.currentPanel = panel;

    // Get button position for panel placement
    const wrapper = btn.closest('.tweetcraft-btn-wrapper') || btn;
    const rect = wrapper.getBoundingClientRect();
    
    // Calculate center position
    const panelWidth = 450;
    const viewportWidth = window.innerWidth;
    let leftPos = rect.left + (rect.width / 2) - (panelWidth / 2);
    
    // Keep panel within viewport
    leftPos = Math.max(10, Math.min(leftPos, viewportWidth - panelWidth - 10));
    
    // Position panel below the toolbar
    panel.style.position = 'fixed';
    panel.style.left = `${leftPos}px`;
    panel.style.top = `${Math.min(rect.bottom + 10, window.innerHeight - 400)}px`;
    panel.style.width = `${panelWidth}px`;
    panel.style.maxWidth = 'calc(100vw - 20px)';
    panel.style.maxHeight = 'calc(100vh - 100px)';
    panel.style.overflowY = 'auto';
    panel.style.zIndex = '10000';
    panel.style.boxShadow = '0 8px 32px rgba(0,0,0,0.3)';
    
    // Append to body to avoid Twitter's DOM manipulation
    document.body.appendChild(panel);
    console.log('Writer: Panel added to body as fixed overlay');

    // Animate in
    requestAnimationFrame(() => panel.classList.add('visible'));
    
    // Auto-generate if no cached candidates
    if (!state.lastCandidates || state.lastCandidates.length === 0) {
      // Small delay to let the panel render first
      setTimeout(() => generateReplies(panel), 300);
    }
    
    // Close when clicking outside
    const closeOnClickOutside = (e) => {
      if (!panel.contains(e.target) && !btn.contains(e.target) && !wrapper.contains(e.target)) {
        // Save feedback before closing
        const feedbackInput = panel.querySelector('.tweetcraft-feedback-input');
        if (feedbackInput) {
          state.feedback = feedbackInput.value;
          savePanelState();
        }
        
        panel.classList.remove('visible');
        setTimeout(() => {
          panel.remove();
          state.currentPanel = null;
          btn.classList.remove('active');
        }, 200);
        document.removeEventListener('click', closeOnClickOutside);
      }
    };
    setTimeout(() => document.addEventListener('click', closeOnClickOutside), 100);
  }

  // Create inline panel
  function createInlinePanel(container) {
    const originalTweet = extractOriginalTweet(container);
    const imageUrls = extractTweetImages(container);

    // Use persisted tone and feedback
    const savedTone = state.tone || 'match';
    const savedFeedback = state.feedback || '';

    const panel = document.createElement('div');
    panel.className = 'tweetcraft-inline-panel';
    panel.innerHTML = `
      <div class="tweetcraft-panel-header">
        <div class="tweetcraft-panel-title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 2L2 7L12 12L22 7L12 2Z"/>
            <path d="M2 17L12 22L22 17"/>
            <path d="M2 12L12 17L22 12"/>
          </svg>
          <span>Writer AI</span>
          ${imageUrls.length > 0 ? `<span class="tweetcraft-vision-badge">📷 ${imageUrls.length} image${imageUrls.length > 1 ? 's' : ''}</span>` : ''}
        </div>
        <button class="tweetcraft-panel-close" title="Close">×</button>
      </div>
      
      <div class="tweetcraft-tone-row">
        <button class="tweetcraft-tone-chip ${savedTone === 'match' ? 'active' : ''}" data-tone="match">Match Style</button>
        <button class="tweetcraft-tone-chip ${savedTone === 'professional' ? 'active' : ''}" data-tone="professional">Pro</button>
        <button class="tweetcraft-tone-chip ${savedTone === 'casual' ? 'active' : ''}" data-tone="casual">Casual</button>
        <button class="tweetcraft-tone-chip ${savedTone === 'witty' ? 'active' : ''}" data-tone="witty">Witty</button>
        <button class="tweetcraft-tone-chip ${savedTone === 'thoughtful' ? 'active' : ''}" data-tone="thoughtful">Deep</button>
      </div>

      <div class="tweetcraft-feedback-row">
        <input type="text" class="tweetcraft-feedback-input" placeholder="Instructions: e.g., make it shorter, add a question..." value="${escapeHtml(savedFeedback)}" />
        <button class="tweetcraft-generate-btn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
          </svg>
          Generate
        </button>
      </div>

      <div class="tweetcraft-results" id="tweetcraft-results">
        <div class="tweetcraft-empty">Click "Generate" to create AI-powered replies</div>
      </div>
    `;

    // Store data
    panel.dataset.originalTweet = originalTweet;
    panel.dataset.imageUrls = JSON.stringify(imageUrls);
    panel.dataset.tone = savedTone;

    // Setup event listeners
    setupPanelListeners(panel);

    // Show last candidates if available
    if (state.lastCandidates && state.lastCandidates.length > 0) {
      state.candidates = state.lastCandidates;
      state.selectedIndex = 0;
      setTimeout(() => {
        const resultsContainer = panel.querySelector('#tweetcraft-results');
        if (resultsContainer) renderResults(resultsContainer);
      }, 50);
    }

    return panel;
  }

  // Setup panel event listeners
  function setupPanelListeners(panel) {
    // Close button
    panel.querySelector('.tweetcraft-panel-close').addEventListener('click', () => {
      // Save feedback before closing
      const feedbackInput = panel.querySelector('.tweetcraft-feedback-input');
      if (feedbackInput) {
        state.feedback = feedbackInput.value;
        savePanelState();
      }
      
      panel.classList.remove('visible');
      setTimeout(() => {
        panel.remove();
        state.currentPanel = null;
        document.querySelectorAll('.tweetcraft-btn.active').forEach(b => b.classList.remove('active'));
      }, 200);
    });

    // Tone chips
    panel.querySelectorAll('.tweetcraft-tone-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        panel.querySelectorAll('.tweetcraft-tone-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        panel.dataset.tone = chip.dataset.tone;
        
        // Save tone state
        state.tone = chip.dataset.tone;
        savePanelState();
      });
    });

    // Generate button
    panel.querySelector('.tweetcraft-generate-btn').addEventListener('click', () => {
      generateReplies(panel);
    });

    // Feedback input - save on change
    const feedbackInput = panel.querySelector('.tweetcraft-feedback-input');
    feedbackInput.addEventListener('input', () => {
      state.feedback = feedbackInput.value;
      // Debounce save
      clearTimeout(window.tweetcraftFeedbackSaveTimeout);
      window.tweetcraftFeedbackSaveTimeout = setTimeout(savePanelState, 500);
    });

    // Enter key in feedback input
    feedbackInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        generateReplies(panel);
      }
    });
  }

  // Extract original tweet text
  function extractOriginalTweet(container) {
    // Try to find the tweet we're replying to
    const article = container?.closest('article') || document.querySelector('article[data-testid="tweet"]');
    if (article) {
      const tweetText = article.querySelector('[data-testid="tweetText"]');
      if (tweetText) return tweetText.innerText;
    }

    // Look in dialogs for quoted tweet
    const dialog = container?.closest('[role="dialog"]');
    if (dialog) {
      const tweetText = dialog.querySelector('[data-testid="tweetText"]');
      if (tweetText) return tweetText.innerText;
    }

    return '';
  }

  // Extract images from tweet
  function extractTweetImages(container) {
    const imageUrls = [];
    
    // Find the tweet article
    const article = container?.closest('article') || document.querySelector('article[data-testid="tweet"]');
    const dialog = container?.closest('[role="dialog"]');
    const searchContainer = dialog || article;
    
    if (!searchContainer) return imageUrls;

    // Find images
    const images = searchContainer.querySelectorAll('img[src*="pbs.twimg.com/media"], img[src*="twimg.com/media"]');
    images.forEach(img => {
      let src = img.src;
      // Get higher quality version
      if (src.includes('name=')) {
        src = src.replace(/name=\w+/, 'name=large');
      }
      if (!imageUrls.includes(src)) {
        imageUrls.push(src);
      }
    });

    // Find video thumbnails
    const videoThumbs = searchContainer.querySelectorAll('video[poster]');
    videoThumbs.forEach(video => {
      if (video.poster && !imageUrls.includes(video.poster)) {
        imageUrls.push(video.poster);
      }
    });

    return imageUrls.slice(0, 4); // Limit to 4 images
  }

  // Generate replies
  async function generateReplies(panel) {
    const resultsContainer = panel.querySelector('#tweetcraft-results');
    const generateBtn = panel.querySelector('.tweetcraft-generate-btn');
    
    // Check if extension context is already known to be invalid
    if (state.contextInvalidated) {
      showContextInvalidatedError(resultsContainer);
      return;
    }
    
    const feedback = panel.querySelector('.tweetcraft-feedback-input').value;
    const tone = panel.dataset.tone;
    const originalTweet = panel.dataset.originalTweet;
    const imageUrls = JSON.parse(panel.dataset.imageUrls || '[]');

    // Show loading
    state.isLoading = true;
    generateBtn.disabled = true;
    generateBtn.innerHTML = `
      <svg class="spinning" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
      </svg>
      Generating...
    `;
    resultsContainer.innerHTML = `
      <div class="tweetcraft-loading">
        <div class="tweetcraft-spinner"></div>
        <span>Crafting replies...</span>
      </div>
    `;

    try {
      // Use safe wrappers for Chrome API calls
      const settings = await safeChromeStorageGet(['candidates', 'useHistory']);
      
      let context = '';
      if (settings.useHistory !== false && state.userHistory.length > 0) {
        context = `\n\nUser's previous tweets for style reference:\n${state.userHistory.slice(0, 5).map((t, i) => `${i + 1}. "${t}"`).join('\n')}`;
      }

      const response = await safeChromeSend({
        type: 'GENERATE_REPLIES',
        payload: {
          originalTweet,
          tone,
          context,
          feedback,
          numCandidates: settings.candidates || 3,
          imageUrls
        }
      });

      if (response?.error) {
        throw new Error(response.error);
      }

      state.candidates = response?.candidates || [];
      state.lastCandidates = state.candidates; // Save for persistence
      state.selectedIndex = 0;
      savePanelState(); // Persist candidates
      renderResults(resultsContainer);

    } catch (error) {
      console.error('Writer error:', error);
      
      // Check if it's a context invalidation error
      if (state.contextInvalidated || 
          error.message?.includes('Extension context invalidated') || 
          error.message?.includes('context invalidated')) {
        showContextInvalidatedError(resultsContainer);
      } else {
        resultsContainer.innerHTML = `
          <div class="tweetcraft-error">
            <span>⚠️ ${error.message}</span>
            <button class="tweetcraft-retry-btn">Retry</button>
          </div>
        `;
        resultsContainer.querySelector('.tweetcraft-retry-btn')?.addEventListener('click', () => generateReplies(panel));
      }
    } finally {
      state.isLoading = false;
      if (generateBtn) {
        generateBtn.disabled = false;
        generateBtn.innerHTML = `
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
          </svg>
          Generate
        `;
      }
    }
  }

  // Render results
  function renderResults(container) {
    if (state.candidates.length === 0) {
      container.innerHTML = `<div class="tweetcraft-empty">No replies generated. Try again with different instructions.</div>`;
      return;
    }

    container.innerHTML = state.candidates.map((text, i) => `
      <div class="tweetcraft-result ${i === state.selectedIndex ? 'selected' : ''}" data-index="${i}">
        <div class="tweetcraft-result-text">${escapeHtml(text)}</div>
        <div class="tweetcraft-result-footer">
          <span class="tweetcraft-char-count ${text.length > 280 ? 'over' : ''}">${text.length}/280</span>
          <button class="tweetcraft-use-btn" data-index="${i}">Use this</button>
        </div>
      </div>
    `).join('');

    // Click to select
    container.querySelectorAll('.tweetcraft-result').forEach(result => {
      result.addEventListener('click', (e) => {
        if (e.target.closest('.tweetcraft-use-btn')) return;
        container.querySelectorAll('.tweetcraft-result').forEach(r => r.classList.remove('selected'));
        result.classList.add('selected');
        state.selectedIndex = parseInt(result.dataset.index);
      });
    });

    // Use buttons
    container.querySelectorAll('.tweetcraft-use-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const index = parseInt(btn.dataset.index);
        useReply(state.candidates[index]);
      });
    });
  }

  // Use selected reply
  function useReply(text) {
    if (!text) return;

    // Find the textarea if not already set
    let editable = state.currentTextarea;
    
    // If no textarea stored, find it fresh
    if (!editable) {
      editable = document.querySelector('[role="dialog"] [data-testid="tweetTextarea_0"]') ||
                document.querySelector('[role="dialog"] [role="textbox"]') ||
                document.querySelector('[data-testid="tweetTextarea_0"]') ||
                document.querySelector('[role="textbox"]');
    }

    // Find the actual editable element
    if (editable && !editable.isContentEditable) {
      editable = editable.closest('[role="textbox"]') || 
                 editable.querySelector('[data-text="true"]') ||
                 document.activeElement;
    }

    if (editable) {
      // Focus and select all
      editable.focus();
      
      // Try multiple methods to insert text
      if (document.execCommand) {
        document.execCommand('selectAll', false, null);
        document.execCommand('insertText', false, text);
      } else {
        editable.textContent = text;
        editable.dispatchEvent(new InputEvent('input', { bubbles: true, data: text }));
      }
      
      // Dispatch additional events for React
      editable.dispatchEvent(new Event('input', { bubbles: true }));
      editable.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // Clear candidates after use (user will want fresh replies for next tweet)
    state.candidates = [];
    state.lastCandidates = [];
    savePanelState();

    // Close panel
    if (state.currentPanel) {
      state.currentPanel.classList.remove('visible');
      setTimeout(() => {
        state.currentPanel?.remove();
        state.currentPanel = null;
        document.querySelectorAll('.tweetcraft-btn.active').forEach(b => b.classList.remove('active'));
      }, 200);
    }
  }

  // Load user history
  async function loadUserHistory() {
    if (state.contextInvalidated) return;
    
    try {
      const cached = await safeChromeStorageGet(['userHistory', 'historyTimestamp']);
      if (cached.userHistory && cached.historyTimestamp) {
        const age = Date.now() - cached.historyTimestamp;
        if (age < 60 * 60 * 1000) {
          state.userHistory = cached.userHistory;
          return;
        }
      }
      state.userHistory = scrapeUserTweets();
      await safeChromeStorageSet({
        userHistory: state.userHistory,
        historyTimestamp: Date.now()
      });
    } catch (error) {
      console.log('Writer: Could not load history', error.message);
    }
  }

  // Scrape user tweets
  function scrapeUserTweets() {
    const tweets = [];
    const userHandle = getCurrentUserHandle();
    document.querySelectorAll('article[data-testid="tweet"]').forEach(tweet => {
      const handle = tweet.querySelector('[data-testid="User-Name"] a[href^="/"]')?.getAttribute('href')?.replace('/', '');
      const text = tweet.querySelector('[data-testid="tweetText"]')?.innerText?.trim();
      if (handle === userHandle && text) tweets.push(text);
    });
    return tweets.slice(0, 20);
  }

  // Get current user handle
  function getCurrentUserHandle() {
    const link = document.querySelector('[data-testid="AppTabBar_Profile_Link"]');
    return link?.getAttribute('href')?.replace('/', '') || null;
  }

  // Escape HTML
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Initialize
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
