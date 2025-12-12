// ReplyForge AI - Reddit Content Script
// Provides AI-powered reply assistance for Reddit comments

(function() {
  'use strict';

  // State
  let state = {
    candidates: [],
    selectedIndex: 0,
    isLoading: false,
    currentTextarea: null,
    currentPanel: null,
    tone: 'match',
    feedback: '',
    lastCandidates: [],
    contextInvalidated: false
  };

  // Platform detection
  const PLATFORM = 'reddit';
  
  // Detect if old Reddit
  const isOldReddit = window.location.hostname === 'old.reddit.com' || 
                      document.querySelector('.reddit-old') !== null ||
                      document.querySelector('#header-img') !== null;

  // Check if extension context is still valid
  function isExtensionContextValid() {
    try {
      if (!chrome?.runtime) return false;
      if (!chrome.runtime.id) return false;
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
        <div class="replyforge-error" style="text-align: center;">
          <span>🔄 Extension was updated. Please refresh the page to continue.</span>
          <button class="replyforge-retry-btn" onclick="location.reload()">Refresh Page</button>
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

  async function safeChromeStorageSet(data) {
    if (!isExtensionContextValid()) return;
    try {
      await chrome.storage.local.set(data);
    } catch (e) {
      console.log('ReplyForge: Could not save to storage', e.message);
    }
  }

  // Initialize
  function init() {
    console.log('ReplyForge Reddit: Initializing...', { isOldReddit });
    
    // Remove any stale buttons from previous loads
    document.querySelectorAll('.replyforge-btn-wrapper, .tweetcraft-btn-wrapper').forEach(el => el.remove());
    document.querySelectorAll('.replyforge-inline-panel, .tweetcraft-inline-panel').forEach(el => el.remove());
    
    loadPanelState();
    setupGlobalClickHandler();
    observeDOM();
  }

  // Load persisted panel state
  async function loadPanelState() {
    if (state.contextInvalidated) return;
    try {
      const saved = await safeChromeStorageGet(['panelTone', 'panelFeedback', 'panelCandidates']);
      if (saved.panelTone) state.tone = saved.panelTone;
      if (saved.panelFeedback) state.feedback = saved.panelFeedback;
      if (saved.panelCandidates) state.lastCandidates = saved.panelCandidates;
      console.log('ReplyForge Reddit: Loaded panel state', { tone: state.tone });
    } catch (error) {
      console.log('ReplyForge Reddit: Could not load panel state', error.message);
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

  // Global click handler using event delegation
  function setupGlobalClickHandler() {
    const handleReplyForgeClick = (e) => {
      const btn = e.target.closest('.replyforge-btn, .tweetcraft-btn');
      const wrapper = e.target.closest('.replyforge-btn-wrapper, .tweetcraft-btn-wrapper');
      
      if (!btn && !wrapper) return;
      
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      
      console.log('ReplyForge Reddit: Button clicked!', e.type);
      
      // Debounce
      if (window._replyforgeClickDebounce) return;
      window._replyforgeClickDebounce = true;
      setTimeout(() => { window._replyforgeClickDebounce = false; }, 300);
      
      handleButtonClick(btn || wrapper.querySelector('.replyforge-btn, .tweetcraft-btn'));
    };
    
    document.addEventListener('click', handleReplyForgeClick, true);
    document.addEventListener('pointerdown', handleReplyForgeClick, true);
    document.addEventListener('mousedown', handleReplyForgeClick, true);
  }

  // Handle button click
  function handleButtonClick(btn) {
    const wrapper = btn.closest('.replyforge-btn-wrapper, .tweetcraft-btn-wrapper') || btn.parentElement;
    
    // Find the comment form/textarea container
    const container = wrapper.closest('.md-container') ||
                     wrapper.closest('[slot="comment-composer-container"]') ||
                     wrapper.closest('shreddit-composer') ||
                     wrapper.closest('faceplate-form') ||
                     wrapper.closest('[data-testid="comment-composer"]') ||
                     wrapper.closest('.usertext-edit') ||
                     wrapper.closest('form') ||
                     wrapper.parentElement?.parentElement;
    
    // Find textarea - try multiple selectors
    let textarea = findTextarea(container);
    
    console.log('ReplyForge Reddit: Context found', { container: !!container, textarea: !!textarea });
    toggleInlinePanel(textarea, container, btn);
  }

  // Find textarea in various Reddit UIs
  function findTextarea(container) {
    // Modern Reddit
    let textarea = container?.querySelector('textarea, [contenteditable="true"], div[role="textbox"]');
    
    if (!textarea) {
      // Try shreddit components
      textarea = document.querySelector('shreddit-composer textarea') ||
                document.querySelector('shreddit-composer [contenteditable="true"]');
    }
    
    if (!textarea) {
      // Try faceplate forms
      textarea = document.querySelector('faceplate-form textarea') ||
                document.querySelector('[slot="comment-composer-container"] textarea');
    }
    
    if (!textarea) {
      // Old Reddit
      textarea = container?.querySelector('.md textarea') ||
                document.querySelector('.usertext-edit textarea') ||
                document.querySelector('.commentarea textarea');
    }
    
    return textarea;
  }

  // Observe DOM for compose areas
  function observeDOM() {
    const observer = new MutationObserver(() => {
      clearTimeout(window.replyforgeDebounce);
      window.replyforgeDebounce = setTimeout(injectButtons, 200);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    // Initial injection with delays for dynamic content
    setTimeout(injectButtons, 500);
    setTimeout(injectButtons, 1500);
    setTimeout(injectButtons, 3000);
    setTimeout(injectButtons, 5000);
  }

  // Main button injection function
  function injectButtons() {
    if (isOldReddit) {
      injectIntoOldReddit();
    } else {
      injectIntoNewReddit();
    }
  }

  // New Reddit (shreddit/modern UI) button injection
  function injectIntoNewReddit() {
    // Strategy 1: shreddit-composer elements
    document.querySelectorAll('shreddit-composer').forEach(composer => {
      if (composer.querySelector('.replyforge-btn-wrapper, .tweetcraft-btn-wrapper')) return;
      
      // Look for toolbar slots
      const toolbar = composer.querySelector('[slot="composer-toolbar"]') ||
                     composer.querySelector('.flex.items-center') ||
                     composer.querySelector('footer') ||
                     composer.querySelector('div');
      
      if (toolbar && !toolbar.querySelector('.replyforge-btn-wrapper')) {
        const btn = createReplyForgeButton();
        toolbar.insertBefore(btn, toolbar.firstChild);
        console.log('ReplyForge Reddit: Button injected into shreddit-composer');
      }
    });

    // Strategy 2: faceplate-form elements
    document.querySelectorAll('faceplate-form').forEach(form => {
      if (form.querySelector('.replyforge-btn-wrapper, .tweetcraft-btn-wrapper')) return;
      
      const textarea = form.querySelector('textarea');
      if (!textarea) return;
      
      // Find action area - look for button containers
      const actionArea = form.querySelector('[class*="flex"][class*="gap"]') ||
                        form.querySelector('[class*="actions"]') ||
                        form.querySelector('footer') ||
                        textarea.parentElement?.nextElementSibling ||
                        textarea.parentElement;
      
      if (actionArea && !actionArea.querySelector('.replyforge-btn-wrapper')) {
        const btn = createReplyForgeButton();
        // Try to insert near the beginning
        if (actionArea.firstChild) {
          actionArea.insertBefore(btn, actionArea.firstChild);
        } else {
          actionArea.appendChild(btn);
        }
        console.log('ReplyForge Reddit: Button injected into faceplate-form');
      }
    });

    // Strategy 3: Comment composer containers
    document.querySelectorAll('[slot="comment-composer-container"], [data-testid="comment-composer"]').forEach(container => {
      if (container.querySelector('.replyforge-btn-wrapper, .tweetcraft-btn-wrapper')) return;
      
      const textarea = container.querySelector('textarea, [contenteditable="true"]');
      if (!textarea) return;
      
      // Find a toolbar or actions area
      const toolbar = container.querySelector('[class*="toolbar"]') ||
                     container.querySelector('[class*="actions"]') ||
                     container.querySelector('footer');
      
      if (toolbar && !toolbar.querySelector('.replyforge-btn-wrapper')) {
        const btn = createReplyForgeButton();
        toolbar.insertBefore(btn, toolbar.firstChild);
        console.log('ReplyForge Reddit: Button injected into comment container');
      }
    });

    // Strategy 4: Generic forms with textareas (fallback)
    document.querySelectorAll('form').forEach(form => {
      // Skip if already has button or no textarea
      if (form.querySelector('.replyforge-btn-wrapper, .tweetcraft-btn-wrapper')) return;
      
      const textarea = form.querySelector('textarea[name*="comment"], textarea[name*="body"]');
      if (!textarea) return;
      
      // Find button area
      const buttonArea = form.querySelector('button[type="submit"]')?.parentElement ||
                        form.querySelector('[class*="actions"]');
      
      if (buttonArea && !buttonArea.querySelector('.replyforge-btn-wrapper')) {
        const btn = createReplyForgeButton();
        buttonArea.insertBefore(btn, buttonArea.firstChild);
        console.log('ReplyForge Reddit: Button injected into generic form');
      }
    });

    // Strategy 5: Post submit pages
    document.querySelectorAll('[data-testid="post-composer"], .submit-page').forEach(composer => {
      if (composer.querySelector('.replyforge-btn-wrapper, .tweetcraft-btn-wrapper')) return;
      
      const textarea = composer.querySelector('textarea');
      if (!textarea) return;
      
      const toolbar = composer.querySelector('[class*="toolbar"]') || 
                     composer.querySelector('footer') ||
                     textarea.parentElement;
      
      if (toolbar && !toolbar.querySelector('.replyforge-btn-wrapper')) {
        const btn = createReplyForgeButton();
        toolbar.insertBefore(btn, toolbar.firstChild);
        console.log('ReplyForge Reddit: Button injected into post composer');
      }
    });
  }

  // Old Reddit button injection
  function injectIntoOldReddit() {
    // Comment reply forms
    document.querySelectorAll('.usertext-edit').forEach(editor => {
      if (editor.querySelector('.replyforge-btn-wrapper, .tweetcraft-btn-wrapper')) return;
      
      const bottomArea = editor.querySelector('.bottom-area') || 
                        editor.querySelector('.usertext-buttons') ||
                        editor.querySelector('.md') ||
                        editor;
      
      if (bottomArea && !bottomArea.querySelector('.replyforge-btn-wrapper')) {
        const btn = createReplyForgeButton();
        btn.style.marginBottom = '8px';
        bottomArea.insertBefore(btn, bottomArea.firstChild);
        console.log('ReplyForge Reddit: Button injected (old Reddit)');
      }
    });

    // New comment form on old reddit
    document.querySelectorAll('.commentarea .usertext, .comment .usertext').forEach(usertext => {
      if (usertext.querySelector('.replyforge-btn-wrapper, .tweetcraft-btn-wrapper')) return;
      
      const editor = usertext.querySelector('.usertext-edit');
      if (!editor) return;
      
      const bottomArea = editor.querySelector('.bottom-area') || 
                        editor.querySelector('.usertext-buttons');
      
      if (bottomArea && !bottomArea.querySelector('.replyforge-btn-wrapper')) {
        const btn = createReplyForgeButton();
        btn.style.marginBottom = '8px';
        bottomArea.insertBefore(btn, bottomArea.firstChild);
        console.log('ReplyForge Reddit: Button injected (old Reddit comment)');
      }
    });

    // Submit page
    document.querySelectorAll('#submit-form, .submit-page form').forEach(form => {
      if (form.querySelector('.replyforge-btn-wrapper, .tweetcraft-btn-wrapper')) return;
      
      const textarea = form.querySelector('textarea#text, textarea[name="text"]');
      if (!textarea) return;
      
      const container = textarea.parentElement;
      if (container && !container.querySelector('.replyforge-btn-wrapper')) {
        const btn = createReplyForgeButton();
        btn.style.marginTop = '8px';
        btn.style.marginBottom = '8px';
        container.insertBefore(btn, textarea.nextSibling);
        console.log('ReplyForge Reddit: Button injected (old Reddit submit)');
      }
    });
  }

  // Create ReplyForge button
  function createReplyForgeButton() {
    const wrapper = document.createElement('div');
    // Use both class names for compatibility
    wrapper.className = 'replyforge-btn-wrapper tweetcraft-btn-wrapper';
    wrapper.style.cssText = 'display: inline-flex; align-items: center; justify-content: center; margin-right: 8px;';
    
    const btn = document.createElement('button');
    btn.className = 'replyforge-btn tweetcraft-btn';
    btn.type = 'button';
    btn.title = 'Generate AI Reply with ReplyForge';
    btn.setAttribute('aria-label', 'Generate AI Reply');
    btn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 2L2 7L12 12L22 7L12 2Z"/>
        <path d="M2 17L12 22L22 17"/>
        <path d="M2 12L12 17L22 12"/>
      </svg>
    `;
    
    wrapper.appendChild(btn);
    return wrapper;
  }

  // Toggle inline panel
  function toggleInlinePanel(textarea, container, btn) {
    const existingPanel = document.querySelector('.replyforge-inline-panel, .tweetcraft-inline-panel');
    if (existingPanel) {
      const feedbackInput = existingPanel.querySelector('.replyforge-feedback-input, .tweetcraft-feedback-input');
      if (feedbackInput) {
        state.feedback = feedbackInput.value;
      }
      savePanelState();
      existingPanel.remove();
      state.currentPanel = null;
      document.querySelectorAll('.replyforge-btn.active, .tweetcraft-btn.active').forEach(b => b.classList.remove('active'));
      return;
    }

    state.currentTextarea = textarea;
    btn.classList.add('active');
    
    const panel = createInlinePanel(container);
    state.currentPanel = panel;

    // Position panel
    const wrapper = btn.closest('.replyforge-btn-wrapper, .tweetcraft-btn-wrapper') || btn;
    const rect = wrapper.getBoundingClientRect();
    const panelWidth = 450;
    const viewportWidth = window.innerWidth;
    let leftPos = rect.left + (rect.width / 2) - (panelWidth / 2);
    leftPos = Math.max(10, Math.min(leftPos, viewportWidth - panelWidth - 10));
    
    panel.style.position = 'fixed';
    panel.style.left = `${leftPos}px`;
    panel.style.top = `${Math.min(rect.bottom + 10, window.innerHeight - 400)}px`;
    panel.style.width = `${panelWidth}px`;
    panel.style.maxWidth = 'calc(100vw - 20px)';
    panel.style.maxHeight = 'calc(100vh - 100px)';
    panel.style.overflowY = 'auto';
    panel.style.zIndex = '10000';
    panel.style.boxShadow = '0 8px 32px rgba(0,0,0,0.3)';
    
    document.body.appendChild(panel);
    console.log('ReplyForge Reddit: Panel added');

    requestAnimationFrame(() => panel.classList.add('visible'));
    
    if (!state.lastCandidates || state.lastCandidates.length === 0) {
      setTimeout(() => generateReplies(panel), 300);
    }
    
    // Close on click outside
    const closeOnClickOutside = (e) => {
      if (!panel.contains(e.target) && !btn.contains(e.target) && !wrapper.contains(e.target)) {
        const feedbackInput = panel.querySelector('.replyforge-feedback-input, .tweetcraft-feedback-input');
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
    const originalPost = extractOriginalPost(container);
    const savedTone = state.tone || 'match';
    const savedFeedback = state.feedback || '';

    const panel = document.createElement('div');
    // Use both class names for CSS compatibility
    panel.className = 'replyforge-inline-panel tweetcraft-inline-panel';
    panel.innerHTML = `
      <div class="tweetcraft-panel-header">
        <div class="tweetcraft-panel-title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 2L2 7L12 12L22 7L12 2Z"/>
            <path d="M2 17L12 22L22 17"/>
            <path d="M2 12L12 17L22 12"/>
          </svg>
          <span>ReplyForge AI</span>
          <span class="tweetcraft-platform-badge">Reddit</span>
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
        <input type="text" class="tweetcraft-feedback-input replyforge-feedback-input" placeholder="Instructions: e.g., make it shorter, add a question..." value="${escapeHtml(savedFeedback)}" />
        <button class="tweetcraft-generate-btn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
          </svg>
          Generate
        </button>
      </div>

      <div class="tweetcraft-results" id="replyforge-results">
        <div class="tweetcraft-empty">Click "Generate" to create AI-powered replies</div>
      </div>
    `;

    panel.dataset.originalPost = originalPost;
    panel.dataset.tone = savedTone;
    panel.dataset.platform = PLATFORM;

    setupPanelListeners(panel);

    if (state.lastCandidates && state.lastCandidates.length > 0) {
      state.candidates = state.lastCandidates;
      state.selectedIndex = 0;
      setTimeout(() => {
        const resultsContainer = panel.querySelector('#replyforge-results');
        if (resultsContainer) renderResults(resultsContainer);
      }, 50);
    }

    return panel;
  }

  // Setup panel event listeners
  function setupPanelListeners(panel) {
    panel.querySelector('.tweetcraft-panel-close').addEventListener('click', () => {
      const feedbackInput = panel.querySelector('.tweetcraft-feedback-input');
      if (feedbackInput) {
        state.feedback = feedbackInput.value;
        savePanelState();
      }
      panel.classList.remove('visible');
      setTimeout(() => {
        panel.remove();
        state.currentPanel = null;
        document.querySelectorAll('.replyforge-btn.active, .tweetcraft-btn.active').forEach(b => b.classList.remove('active'));
      }, 200);
    });

    panel.querySelectorAll('.tweetcraft-tone-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        panel.querySelectorAll('.tweetcraft-tone-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        panel.dataset.tone = chip.dataset.tone;
        state.tone = chip.dataset.tone;
        savePanelState();
      });
    });

    panel.querySelector('.tweetcraft-generate-btn').addEventListener('click', () => {
      generateReplies(panel);
    });

    const feedbackInput = panel.querySelector('.tweetcraft-feedback-input');
    feedbackInput.addEventListener('input', () => {
      state.feedback = feedbackInput.value;
      clearTimeout(window.replyforgeFeedbackSaveTimeout);
      window.replyforgeFeedbackSaveTimeout = setTimeout(savePanelState, 500);
    });

    feedbackInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        generateReplies(panel);
      }
    });
  }

  // Extract original post/comment text
  function extractOriginalPost(container) {
    // Modern Reddit: Look for post content
    
    // Try to find post title and body
    const postTitle = document.querySelector('h1[slot="title"]')?.innerText ||
                     document.querySelector('[data-testid="post-title"]')?.innerText ||
                     document.querySelector('shreddit-post h1')?.innerText ||
                     document.querySelector('.Post h1')?.innerText ||
                     '';
    
    const postBody = document.querySelector('[slot="text-body"]')?.innerText ||
                    document.querySelector('[data-testid="post-rtjson-content"]')?.innerText ||
                    document.querySelector('.Post [data-click-id="text"]')?.innerText ||
                    '';
    
    if (postTitle || postBody) {
      return `${postTitle}\n\n${postBody}`.trim();
    }

    // Try to find the parent comment we're replying to
    const parentComment = container?.closest('shreddit-comment')?.querySelector('[slot="comment-body"]')?.innerText ||
                         container?.closest('.Comment')?.querySelector('[data-testid="comment"]')?.innerText ||
                         '';
    
    if (parentComment) {
      return parentComment;
    }

    // Old Reddit
    const thing = container?.closest('.thing');
    if (thing) {
      const title = thing.querySelector('.title a')?.innerText || '';
      const body = thing.querySelector('.usertext-body .md')?.innerText || '';
      return `${title}\n\n${body}`.trim();
    }

    // Fallback: look for any visible post content
    const fallbackTitle = document.querySelector('.top-matter .title a')?.innerText ||
                         document.querySelector('.entry .title')?.innerText ||
                         '';
    const fallbackBody = document.querySelector('.usertext-body .md')?.innerText || '';
    
    return `${fallbackTitle}\n\n${fallbackBody}`.trim();
  }

  // Generate replies
  async function generateReplies(panel) {
    const resultsContainer = panel.querySelector('#replyforge-results');
    const generateBtn = panel.querySelector('.tweetcraft-generate-btn');
    
    if (state.contextInvalidated) {
      showContextInvalidatedError(resultsContainer);
      return;
    }
    
    const feedback = panel.querySelector('.tweetcraft-feedback-input').value;
    const tone = panel.dataset.tone;
    const originalPost = panel.dataset.originalPost;

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
      const settings = await safeChromeStorageGet(['candidates']);

      const response = await safeChromeSend({
        type: 'GENERATE_REPLIES',
        payload: {
          originalTweet: originalPost,
          tone,
          context: '',
          feedback,
          numCandidates: settings.candidates || 3,
          imageUrls: [],
          platform: PLATFORM
        }
      });

      if (response?.error) {
        throw new Error(response.error);
      }

      state.candidates = response?.candidates || [];
      state.lastCandidates = state.candidates;
      state.selectedIndex = 0;
      savePanelState();
      renderResults(resultsContainer);

    } catch (error) {
      console.error('ReplyForge Reddit error:', error);
      
      if (state.contextInvalidated || 
          error.message?.includes('Extension context invalidated') || 
          error.message?.includes('context invalidated')) {
        showContextInvalidatedError(resultsContainer);
      } else {
        resultsContainer.innerHTML = `
          <div class="tweetcraft-error replyforge-error">
            <span>⚠️ ${error.message}</span>
            <button class="tweetcraft-retry-btn replyforge-retry-btn">Retry</button>
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
          <span class="tweetcraft-char-count">${text.length} chars</span>
          <button class="tweetcraft-use-btn" data-index="${i}">Use this</button>
        </div>
      </div>
    `).join('');

    container.querySelectorAll('.tweetcraft-result').forEach(result => {
      result.addEventListener('click', (e) => {
        if (e.target.closest('.tweetcraft-use-btn')) return;
        container.querySelectorAll('.tweetcraft-result').forEach(r => r.classList.remove('selected'));
        result.classList.add('selected');
        state.selectedIndex = parseInt(result.dataset.index);
      });
    });

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

    let editable = state.currentTextarea;
    
    if (!editable) {
      editable = findTextarea(document.body);
    }

    if (editable) {
      editable.focus();
      
      if (editable.tagName === 'TEXTAREA') {
        editable.value = text;
        editable.dispatchEvent(new Event('input', { bubbles: true }));
        editable.dispatchEvent(new Event('change', { bubbles: true }));
      } else {
        // contenteditable
        editable.textContent = text;
        editable.dispatchEvent(new InputEvent('input', { bubbles: true, data: text }));
      }
    }

    // Clear candidates
    state.candidates = [];
    state.lastCandidates = [];
    savePanelState();

    // Close panel
    if (state.currentPanel) {
      state.currentPanel.classList.remove('visible');
      setTimeout(() => {
        state.currentPanel?.remove();
        state.currentPanel = null;
        document.querySelectorAll('.replyforge-btn.active, .tweetcraft-btn.active').forEach(b => b.classList.remove('active'));
      }, 200);
    }
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
