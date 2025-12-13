// Writer AI - Reddit Content Script
// Provides AI-powered reply assistance for Reddit comments with conversational refinement

(function() {
  'use strict';

  // Platform detection
  const PLATFORM = 'reddit';
  const isOldReddit = window.location.hostname === 'old.reddit.com' || 
                      document.querySelector('.reddit-old') !== null ||
                      document.querySelector('#header-img') !== null;

  // State
  let state = {
    // Conversation state
    conversation: [],
    isLoading: false,
    currentTextarea: null,
    currentPanel: null,
    // Persisted state
    tone: 'match',
    contextInvalidated: false,
    // URL tracking for context clearing
    lastUrl: window.location.href,
    // Original context
    originalPost: '',
    originalImages: []
  };

  // Generate unique ID
  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

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

  async function safeChromeStorageSet(data) {
    if (!isExtensionContextValid()) return;
    try {
      await chrome.storage.local.set(data);
    } catch (e) {
      console.log('Writer: Could not save to storage', e.message);
    }
  }

  // Initialize
  function init() {
    console.log('Writer Reddit: Initializing...', { isOldReddit });
    
    document.querySelectorAll('.replyforge-btn-wrapper, .tweetcraft-btn-wrapper').forEach(el => el.remove());
    document.querySelectorAll('.replyforge-inline-panel, .tweetcraft-inline-panel').forEach(el => el.remove());
    
    loadPanelState();
    setupGlobalClickHandler();
    setupUrlTracking();
    observeDOM();
  }

  // Setup URL tracking to clear context on navigation
  function setupUrlTracking() {
    setInterval(checkUrlChange, 500);
    window.addEventListener('popstate', checkUrlChange);
  }

  // Check if URL has changed and clear context if needed
  function checkUrlChange() {
    const currentUrl = window.location.href;
    if (currentUrl !== state.lastUrl) {
      console.log('Writer Reddit: URL changed, clearing context');
      state.lastUrl = currentUrl;
      clearContextOnUrlChange();
    }
  }

  // Clear context when URL changes
  async function clearContextOnUrlChange() {
    state.conversation = [];
    state.originalPost = '';
    state.originalImages = [];
    
    if (state.currentPanel) {
      removeGlobalScrollPrevention();
      state.currentPanel.remove();
      state.currentPanel = null;
      document.querySelectorAll('.replyforge-btn.active, .tweetcraft-btn.active').forEach(b => b.classList.remove('active'));
    }
    
    await safeChromeStorageSet({
      redditConversation: [],
      redditOriginalPost: ''
    });
    
    console.log('Writer Reddit: Context cleared for new URL');
  }

  // Load persisted panel state
  async function loadPanelState() {
    if (state.contextInvalidated) return;
    try {
      const saved = await safeChromeStorageGet(['panelTone', 'redditConversation', 'redditOriginalPost']);
      if (saved.panelTone) state.tone = saved.panelTone;
      if (saved.redditConversation) state.conversation = saved.redditConversation;
      if (saved.redditOriginalPost) state.originalPost = saved.redditOriginalPost;
      console.log('Writer Reddit: Loaded panel state', { tone: state.tone, conversationLength: state.conversation.length });
    } catch (error) {
      console.log('Writer Reddit: Could not load panel state', error.message);
    }
  }

  // Save panel state
  async function savePanelState() {
    if (state.contextInvalidated) return;
    await safeChromeStorageSet({
      panelTone: state.tone,
      redditConversation: state.conversation,
      redditOriginalPost: state.originalPost
    });
  }

  // Global click handler using event delegation
  function setupGlobalClickHandler() {
    const handleWriterClick = (e) => {
      const btn = e.target.closest('.replyforge-btn, .tweetcraft-btn');
      const wrapper = e.target.closest('.replyforge-btn-wrapper, .tweetcraft-btn-wrapper');
      
      if (!btn && !wrapper) return;
      
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      
      console.log('Writer Reddit: Button clicked!', e.type);
      
      if (window._replyforgeClickDebounce) return;
      window._replyforgeClickDebounce = true;
      setTimeout(() => { window._replyforgeClickDebounce = false; }, 300);
      
      handleButtonClick(btn || wrapper.querySelector('.replyforge-btn, .tweetcraft-btn'));
    };
    
    document.addEventListener('click', handleWriterClick, true);
    document.addEventListener('pointerdown', handleWriterClick, true);
    document.addEventListener('mousedown', handleWriterClick, true);
  }

  // Handle button click
  function handleButtonClick(btn) {
    const wrapper = btn.closest('.replyforge-btn-wrapper, .tweetcraft-btn-wrapper') || btn.parentElement;
    const container = wrapper.closest('.md-container') ||
                     wrapper.closest('[slot="comment-composer-container"]') ||
                     wrapper.closest('shreddit-composer') ||
                     wrapper.closest('faceplate-form') ||
                     wrapper.closest('[data-testid="comment-composer"]') ||
                     wrapper.closest('.usertext-edit') ||
                     wrapper.closest('form') ||
                     wrapper.parentElement?.parentElement;
    
    let textarea = findTextarea(container);
    
    console.log('Writer Reddit: Context found', { container: !!container, textarea: !!textarea });
    toggleInlinePanel(textarea, container, btn);
  }

  // Find textarea in various Reddit UIs
  function findTextarea(container) {
    let textarea = container?.querySelector('textarea, [contenteditable="true"], div[role="textbox"]');
    
    if (!textarea) {
      textarea = document.querySelector('shreddit-composer textarea') ||
                document.querySelector('shreddit-composer [contenteditable="true"]');
    }
    
    if (!textarea) {
      textarea = document.querySelector('faceplate-form textarea') ||
                document.querySelector('[slot="comment-composer-container"] textarea');
    }
    
    if (!textarea) {
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

  // New Reddit button injection
  function injectIntoNewReddit() {
    document.querySelectorAll('shreddit-composer').forEach(composer => {
      if (composer.querySelector('.replyforge-btn-wrapper, .tweetcraft-btn-wrapper')) return;
      
      const toolbar = composer.querySelector('[slot="composer-toolbar"]') ||
                     composer.querySelector('.flex.items-center') ||
                     composer.querySelector('footer') ||
                     composer.querySelector('div');
      
      if (toolbar && !toolbar.querySelector('.replyforge-btn-wrapper')) {
        const btn = createWriterButton();
        toolbar.insertBefore(btn, toolbar.firstChild);
        console.log('Writer Reddit: Button injected into shreddit-composer');
      }
    });

    document.querySelectorAll('faceplate-form').forEach(form => {
      if (form.querySelector('.replyforge-btn-wrapper, .tweetcraft-btn-wrapper')) return;
      
      const textarea = form.querySelector('textarea');
      if (!textarea) return;
      
      const actionArea = form.querySelector('[class*="flex"][class*="gap"]') ||
                        form.querySelector('[class*="actions"]') ||
                        form.querySelector('footer') ||
                        textarea.parentElement?.nextElementSibling ||
                        textarea.parentElement;
      
      if (actionArea && !actionArea.querySelector('.replyforge-btn-wrapper')) {
        const btn = createWriterButton();
        if (actionArea.firstChild) {
          actionArea.insertBefore(btn, actionArea.firstChild);
        } else {
          actionArea.appendChild(btn);
        }
        console.log('Writer Reddit: Button injected into faceplate-form');
      }
    });

    document.querySelectorAll('[slot="comment-composer-container"], [data-testid="comment-composer"]').forEach(container => {
      if (container.querySelector('.replyforge-btn-wrapper, .tweetcraft-btn-wrapper')) return;
      
      const textarea = container.querySelector('textarea, [contenteditable="true"]');
      if (!textarea) return;
      
      const toolbar = container.querySelector('[class*="toolbar"]') ||
                     container.querySelector('[class*="actions"]') ||
                     container.querySelector('footer');
      
      if (toolbar && !toolbar.querySelector('.replyforge-btn-wrapper')) {
        const btn = createWriterButton();
        toolbar.insertBefore(btn, toolbar.firstChild);
        console.log('Writer Reddit: Button injected into comment container');
      }
    });

    document.querySelectorAll('form').forEach(form => {
      if (form.querySelector('.replyforge-btn-wrapper, .tweetcraft-btn-wrapper')) return;
      
      const textarea = form.querySelector('textarea[name*="comment"], textarea[name*="body"]');
      if (!textarea) return;
      
      const buttonArea = form.querySelector('button[type="submit"]')?.parentElement ||
                        form.querySelector('[class*="actions"]');
      
      if (buttonArea && !buttonArea.querySelector('.replyforge-btn-wrapper')) {
        const btn = createWriterButton();
        buttonArea.insertBefore(btn, buttonArea.firstChild);
        console.log('Writer Reddit: Button injected into generic form');
      }
    });

    document.querySelectorAll('[data-testid="post-composer"], .submit-page').forEach(composer => {
      if (composer.querySelector('.replyforge-btn-wrapper, .tweetcraft-btn-wrapper')) return;
      
      const textarea = composer.querySelector('textarea');
      if (!textarea) return;
      
      const toolbar = composer.querySelector('[class*="toolbar"]') || 
                     composer.querySelector('footer') ||
                     textarea.parentElement;
      
      if (toolbar && !toolbar.querySelector('.replyforge-btn-wrapper')) {
        const btn = createWriterButton();
        toolbar.insertBefore(btn, toolbar.firstChild);
        console.log('Writer Reddit: Button injected into post composer');
      }
    });
  }

  // Old Reddit button injection
  function injectIntoOldReddit() {
    document.querySelectorAll('.usertext-edit').forEach(editor => {
      if (editor.querySelector('.replyforge-btn-wrapper, .tweetcraft-btn-wrapper')) return;
      
      const bottomArea = editor.querySelector('.bottom-area') || 
                        editor.querySelector('.usertext-buttons') ||
                        editor.querySelector('.md') ||
                        editor;
      
      if (bottomArea && !bottomArea.querySelector('.replyforge-btn-wrapper')) {
        const btn = createWriterButton();
        btn.style.marginBottom = '8px';
        bottomArea.insertBefore(btn, bottomArea.firstChild);
        console.log('Writer Reddit: Button injected (old Reddit)');
      }
    });

    document.querySelectorAll('.commentarea .usertext, .comment .usertext').forEach(usertext => {
      if (usertext.querySelector('.replyforge-btn-wrapper, .tweetcraft-btn-wrapper')) return;
      
      const editor = usertext.querySelector('.usertext-edit');
      if (!editor) return;
      
      const bottomArea = editor.querySelector('.bottom-area') || 
                        editor.querySelector('.usertext-buttons');
      
      if (bottomArea && !bottomArea.querySelector('.replyforge-btn-wrapper')) {
        const btn = createWriterButton();
        btn.style.marginBottom = '8px';
        bottomArea.insertBefore(btn, bottomArea.firstChild);
        console.log('Writer Reddit: Button injected (old Reddit comment)');
      }
    });

    document.querySelectorAll('#submit-form, .submit-page form').forEach(form => {
      if (form.querySelector('.replyforge-btn-wrapper, .tweetcraft-btn-wrapper')) return;
      
      const textarea = form.querySelector('textarea#text, textarea[name="text"]');
      if (!textarea) return;
      
      const container = textarea.parentElement;
      if (container && !container.querySelector('.replyforge-btn-wrapper')) {
        const btn = createWriterButton();
        btn.style.marginTop = '8px';
        btn.style.marginBottom = '8px';
        container.insertBefore(btn, textarea.nextSibling);
        console.log('Writer Reddit: Button injected (old Reddit submit)');
      }
    });
  }

  // Create Writer AI button
  function createWriterButton() {
    const wrapper = document.createElement('div');
    wrapper.className = 'replyforge-btn-wrapper tweetcraft-btn-wrapper';
    wrapper.style.cssText = 'display: inline-flex; align-items: center; justify-content: center; margin-right: 8px;';
    
    const btn = document.createElement('button');
    btn.className = 'replyforge-btn tweetcraft-btn';
    btn.type = 'button';
    btn.title = 'Generate AI Reply with Writer AI';
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

  // Global wheel handler to prevent background scroll when panel is open
  let globalWheelHandler = null;
  
  function setupGlobalScrollPrevention(panel) {
    globalWheelHandler = (e) => {
      // Check if the event target is inside the panel
      if (panel && panel.contains(e.target)) {
        // Let the panel handle its own scrolling
        e.stopPropagation();
      } else if (panel) {
        // Prevent scrolling outside the panel
        e.preventDefault();
        e.stopPropagation();
      }
    };
    
    document.addEventListener('wheel', globalWheelHandler, { passive: false, capture: true });
  }
  
  function removeGlobalScrollPrevention() {
    if (globalWheelHandler) {
      document.removeEventListener('wheel', globalWheelHandler, { capture: true });
      globalWheelHandler = null;
    }
  }

  // Toggle inline panel
  function toggleInlinePanel(textarea, container, btn) {
    const existingPanel = document.querySelector('.replyforge-inline-panel, .tweetcraft-inline-panel');
    if (existingPanel) {
      savePanelState();
      removeGlobalScrollPrevention();
      existingPanel.remove();
      state.currentPanel = null;
      document.querySelectorAll('.replyforge-btn.active, .tweetcraft-btn.active').forEach(b => b.classList.remove('active'));
      return;
    }

    state.currentTextarea = textarea;
    btn.classList.add('active');
    
    // Extract context if this is a fresh conversation
    if (state.conversation.length === 0) {
      state.originalPost = extractOriginalPost(container);
    }
    
    const panel = createConversationalPanel();
    state.currentPanel = panel;

    const wrapper = btn.closest('.replyforge-btn-wrapper, .tweetcraft-btn-wrapper') || btn;
    const rect = wrapper.getBoundingClientRect();
    const panelWidth = 480;
    const viewportWidth = window.innerWidth;
    let leftPos = rect.left + (rect.width / 2) - (panelWidth / 2);
    leftPos = Math.max(10, Math.min(leftPos, viewportWidth - panelWidth - 10));
    
    panel.style.position = 'fixed';
    panel.style.left = `${leftPos}px`;
    panel.style.top = `${Math.min(rect.bottom + 10, window.innerHeight - 500)}px`;
    panel.style.width = `${panelWidth}px`;
    panel.style.maxWidth = 'calc(100vw - 20px)';
    panel.style.maxHeight = 'calc(100vh - 100px)';
    panel.style.zIndex = '10000';
    panel.style.boxShadow = '0 8px 32px rgba(0,0,0,0.3)';
    
    document.body.appendChild(panel);
    console.log('Writer Reddit: Panel added');
    
    // Setup global scroll prevention
    setupGlobalScrollPrevention(panel);

    requestAnimationFrame(() => panel.classList.add('visible'));
    
    // Auto-generate if fresh conversation
    if (state.conversation.length === 0) {
      setTimeout(() => sendMessage(panel, 'Generate reply options'), 300);
    }
    
    // Close on click outside
    const closeOnClickOutside = (e) => {
      if (!panel.contains(e.target) && !btn.contains(e.target) && !wrapper.contains(e.target)) {
        savePanelState();
        removeGlobalScrollPrevention();
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

  // Create conversational panel
  function createConversationalPanel() {
    const savedTone = state.tone || 'match';

    const panel = document.createElement('div');
    panel.className = 'replyforge-inline-panel tweetcraft-inline-panel tweetcraft-conversational';
    panel.innerHTML = `
      <div class="tweetcraft-panel-header">
        <div class="tweetcraft-panel-title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 2L2 7L12 12L22 7L12 2Z"/>
            <path d="M2 17L12 22L22 17"/>
            <path d="M2 12L12 17L22 12"/>
          </svg>
          <span>Writer AI</span>
          <span class="tweetcraft-platform-badge">Reddit</span>
        </div>
        <div class="tweetcraft-header-actions">
          <button class="tweetcraft-new-chat-btn" title="Start new conversation">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 5v14M5 12h14"/>
            </svg>
          </button>
          <button class="tweetcraft-panel-close" title="Close">×</button>
        </div>
      </div>
      
      <div class="tweetcraft-tone-row">
        <button class="tweetcraft-tone-chip ${savedTone === 'match' ? 'active' : ''}" data-tone="match">Match Style</button>
        <button class="tweetcraft-tone-chip ${savedTone === 'professional' ? 'active' : ''}" data-tone="professional">Pro</button>
        <button class="tweetcraft-tone-chip ${savedTone === 'casual' ? 'active' : ''}" data-tone="casual">Casual</button>
        <button class="tweetcraft-tone-chip ${savedTone === 'witty' ? 'active' : ''}" data-tone="witty">Witty</button>
        <button class="tweetcraft-tone-chip ${savedTone === 'thoughtful' ? 'active' : ''}" data-tone="thoughtful">Deep</button>
      </div>

      ${state.originalPost ? `
        <div class="tweetcraft-context-preview" data-expanded="false">
          <div class="tweetcraft-context-header">
            <div class="tweetcraft-context-label">Replying to:</div>
            <button class="tweetcraft-context-toggle" title="Show full post">
              <svg class="expand-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="6,9 12,15 18,9"/>
              </svg>
            </button>
          </div>
          <div class="tweetcraft-context-text">${escapeHtml(state.originalPost)}</div>
        </div>
      ` : ''}

      <div class="tweetcraft-conversation" id="tweetcraft-conversation">
        <!-- Conversation messages will be rendered here -->
      </div>

      <div class="tweetcraft-input-area">
        <div class="tweetcraft-action-row">
          <button class="tweetcraft-regenerate-btn" title="Regenerate with current style">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 2v6h-6M3 12a9 9 0 0 1 15-6.7L21 8M3 22v-6h6M21 12a9 9 0 0 1-15 6.7L3 16"/>
            </svg>
            Regenerate
          </button>
        </div>
        <div class="tweetcraft-input-row">
          <div class="tweetcraft-input-wrapper">
            <input type="text" class="tweetcraft-chat-input" placeholder="Refine: e.g., make it shorter, add humor, be more direct..." />
            <input type="file" class="tweetcraft-image-input" accept="image/*" multiple hidden />
            <button class="tweetcraft-attach-btn" title="Attach images">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                <circle cx="8.5" cy="8.5" r="1.5"/>
                <polyline points="21,15 16,10 5,21"/>
              </svg>
            </button>
          </div>
          <button class="tweetcraft-send-btn" title="Send refinement">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="22" y1="2" x2="11" y2="13"/>
              <polygon points="22,2 15,22 11,13 2,9 22,2"/>
            </svg>
          </button>
        </div>
        <div class="tweetcraft-attached-images" id="tweetcraft-attached-images"></div>
      </div>
    `;

    panel.dataset.tone = savedTone;
    panel._attachedImages = [];
    
    setupConversationalPanelListeners(panel);
    renderConversation(panel);

    return panel;
  }

  // Setup conversational panel event listeners
  function setupConversationalPanelListeners(panel) {
    // Prevent scroll events from propagating to the page
    const conversationContainer = panel.querySelector('#tweetcraft-conversation');
    
    // Handle wheel events on the entire panel
    panel.addEventListener('wheel', (e) => {
      e.stopPropagation();
      
      // If conversation container is scrollable, handle scroll there
      if (conversationContainer) {
        const { scrollTop, scrollHeight, clientHeight } = conversationContainer;
        const isAtTop = scrollTop === 0;
        const isAtBottom = scrollTop + clientHeight >= scrollHeight - 1;
        
        // Prevent default only when not at scroll boundaries, or always if content fits
        if (scrollHeight <= clientHeight) {
          e.preventDefault();
        } else if ((e.deltaY < 0 && isAtTop) || (e.deltaY > 0 && isAtBottom)) {
          e.preventDefault();
        }
      } else {
        e.preventDefault();
      }
    }, { passive: false });

    // Also prevent touchmove propagation for mobile
    panel.addEventListener('touchmove', (e) => {
      e.stopPropagation();
    }, { passive: false });
    
    // Prevent scroll on the panel body itself
    panel.addEventListener('scroll', (e) => {
      e.stopPropagation();
    }, { passive: false });

    // Close button
    panel.querySelector('.tweetcraft-panel-close').addEventListener('click', () => {
      savePanelState();
      removeGlobalScrollPrevention();
      panel.classList.remove('visible');
      setTimeout(() => {
        panel.remove();
        state.currentPanel = null;
        document.querySelectorAll('.replyforge-btn.active, .tweetcraft-btn.active').forEach(b => b.classList.remove('active'));
      }, 200);
    });

    // Context toggle button (expand/collapse original post)
    const contextToggle = panel.querySelector('.tweetcraft-context-toggle');
    if (contextToggle) {
      contextToggle.addEventListener('click', () => {
        const preview = panel.querySelector('.tweetcraft-context-preview');
        const isExpanded = preview.dataset.expanded === 'true';
        preview.dataset.expanded = (!isExpanded).toString();
        contextToggle.title = isExpanded ? 'Show full post' : 'Collapse';
      });
    }

    // New chat button
    panel.querySelector('.tweetcraft-new-chat-btn').addEventListener('click', () => {
      state.conversation = [];
      panel._attachedImages = [];
      renderConversation(panel);
      renderAttachedImages(panel);
      savePanelState();
    });

    // Regenerate button - regenerate with current style
    panel.querySelector('.tweetcraft-regenerate-btn').addEventListener('click', () => {
      // Clear conversation and regenerate
      state.conversation = [];
      panel._attachedImages = [];
      renderConversation(panel);
      renderAttachedImages(panel);
      sendMessage(panel, 'Generate reply options');
    });

    // Tone chips
    panel.querySelectorAll('.tweetcraft-tone-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        panel.querySelectorAll('.tweetcraft-tone-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        panel.dataset.tone = chip.dataset.tone;
        state.tone = chip.dataset.tone;
        savePanelState();
      });
    });

    // Chat input
    const chatInput = panel.querySelector('.tweetcraft-chat-input');
    chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const message = chatInput.value.trim();
        if (message || panel._attachedImages.length > 0) {
          sendMessage(panel, message);
          chatInput.value = '';
        }
      }
    });

    // Send button
    panel.querySelector('.tweetcraft-send-btn').addEventListener('click', () => {
      const message = chatInput.value.trim();
      if (message || panel._attachedImages.length > 0) {
        sendMessage(panel, message);
        chatInput.value = '';
      }
    });

    // Image attachment
    const imageInput = panel.querySelector('.tweetcraft-image-input');
    const attachBtn = panel.querySelector('.tweetcraft-attach-btn');
    
    attachBtn.addEventListener('click', () => {
      imageInput.click();
    });

    imageInput.addEventListener('change', async (e) => {
      const files = Array.from(e.target.files);
      for (const file of files) {
        if (file.type.startsWith('image/')) {
          const dataUrl = await fileToDataUrl(file);
          panel._attachedImages.push(dataUrl);
        }
      }
      renderAttachedImages(panel);
      imageInput.value = '';
    });
  }

  // Convert file to data URL
  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // Render attached images preview
  function renderAttachedImages(panel) {
    const container = panel.querySelector('#tweetcraft-attached-images');
    if (panel._attachedImages.length === 0) {
      container.innerHTML = '';
      return;
    }

    container.innerHTML = panel._attachedImages.map((url, i) => `
      <div class="tweetcraft-attached-image" data-index="${i}">
        <img src="${url}" alt="Attached image" />
        <button class="tweetcraft-remove-image" data-index="${i}">×</button>
      </div>
    `).join('');

    container.querySelectorAll('.tweetcraft-remove-image').forEach(btn => {
      btn.addEventListener('click', () => {
        const index = parseInt(btn.dataset.index);
        panel._attachedImages.splice(index, 1);
        renderAttachedImages(panel);
      });
    });
  }

  // Render conversation
  function renderConversation(panel) {
    const container = panel.querySelector('#tweetcraft-conversation');
    
    if (state.conversation.length === 0) {
      container.innerHTML = `
        <div class="tweetcraft-empty-conversation">
          <div class="tweetcraft-empty-icon">💬</div>
          <div class="tweetcraft-empty-text">Start a conversation to craft your perfect reply</div>
          <div class="tweetcraft-empty-hint">The AI will generate multiple options you can refine</div>
        </div>
      `;
      return;
    }

    container.innerHTML = state.conversation.map((msg, index) => {
      if (msg.role === 'user') {
        return renderUserMessage(msg, index);
      } else {
        return renderAssistantMessage(msg, index);
      }
    }).join('');

    setupMessageListeners(panel, container);
    container.scrollTop = container.scrollHeight;
  }

  // Render user message
  function renderUserMessage(msg, index) {
    const hasImages = msg.images && msg.images.length > 0;
    return `
      <div class="tweetcraft-message tweetcraft-user-message" data-index="${index}" data-id="${msg.id}">
        <div class="tweetcraft-message-header">
          <span class="tweetcraft-message-role">You</span>
          <div class="tweetcraft-message-actions">
            <button class="tweetcraft-edit-btn" data-index="${index}" title="Edit & regenerate from here">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
          </div>
        </div>
        <div class="tweetcraft-message-content ${msg.isEditing ? 'editing' : ''}">
          ${msg.isEditing ? `
            <textarea class="tweetcraft-edit-textarea" data-index="${index}">${escapeHtml(msg.content)}</textarea>
            <div class="tweetcraft-edit-actions">
              <button class="tweetcraft-cancel-edit-btn" data-index="${index}">Cancel</button>
              <button class="tweetcraft-save-edit-btn" data-index="${index}">Regenerate</button>
            </div>
          ` : `
            <div class="tweetcraft-message-text">${escapeHtml(msg.content)}</div>
          `}
          ${hasImages ? `
            <div class="tweetcraft-message-images">
              ${msg.images.map(url => `<img src="${url}" alt="Attached" />`).join('')}
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }

  // Render assistant message
  function renderAssistantMessage(msg, index) {
    const candidates = msg.candidates || [];
    const selectedIndex = msg.selectedIndex || 0;

    if (candidates.length === 0) {
      return `
        <div class="tweetcraft-message tweetcraft-assistant-message" data-index="${index}" data-id="${msg.id}">
          <div class="tweetcraft-message-header">
            <span class="tweetcraft-message-role">Writer AI</span>
          </div>
          <div class="tweetcraft-message-content">
            <div class="tweetcraft-message-text">${escapeHtml(msg.content || 'No response')}</div>
          </div>
        </div>
      `;
    }

    return `
      <div class="tweetcraft-message tweetcraft-assistant-message" data-index="${index}" data-id="${msg.id}">
        <div class="tweetcraft-message-header">
          <span class="tweetcraft-message-role">Writer AI</span>
          <span class="tweetcraft-candidates-count">${candidates.length} options</span>
        </div>
        <div class="tweetcraft-candidates-list">
          ${candidates.map((text, i) => `
            <div class="tweetcraft-candidate ${i === selectedIndex ? 'selected' : ''}" data-msg-index="${index}" data-candidate-index="${i}">
              <div class="tweetcraft-candidate-text">${escapeHtml(text)}</div>
              <div class="tweetcraft-candidate-footer">
                <span class="tweetcraft-char-count">${text.length} chars</span>
                <button class="tweetcraft-use-btn" data-msg-index="${index}" data-candidate-index="${i}">Use this</button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  // Setup message event listeners
  function setupMessageListeners(panel, container) {
    // Edit buttons
    container.querySelectorAll('.tweetcraft-edit-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const index = parseInt(btn.dataset.index);
        state.conversation[index].isEditing = true;
        renderConversation(panel);
      });
    });

    // Cancel edit buttons
    container.querySelectorAll('.tweetcraft-cancel-edit-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const index = parseInt(btn.dataset.index);
        state.conversation[index].isEditing = false;
        renderConversation(panel);
      });
    });

    // Save edit buttons (fork conversation)
    container.querySelectorAll('.tweetcraft-save-edit-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const index = parseInt(btn.dataset.index);
        const textarea = container.querySelector(`.tweetcraft-edit-textarea[data-index="${index}"]`);
        const newContent = textarea.value.trim();
        
        if (newContent) {
          state.conversation = state.conversation.slice(0, index);
          state.conversation[index] = {
            ...state.conversation[index],
            content: newContent,
            isEditing: false
          };
          sendMessage(panel, newContent, [], true);
        }
      });
    });

    // Candidate selection
    container.querySelectorAll('.tweetcraft-candidate').forEach(candidate => {
      candidate.addEventListener('click', (e) => {
        if (e.target.closest('.tweetcraft-use-btn')) return;
        
        const msgIndex = parseInt(candidate.dataset.msgIndex);
        const candIndex = parseInt(candidate.dataset.candidateIndex);
        
        state.conversation[msgIndex].selectedIndex = candIndex;
        savePanelState();
        renderConversation(panel);
      });
    });

    // Use buttons
    container.querySelectorAll('.tweetcraft-use-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const msgIndex = parseInt(btn.dataset.msgIndex);
        const candIndex = parseInt(btn.dataset.candidateIndex);
        const text = state.conversation[msgIndex].candidates[candIndex];
        useReply(text);
      });
    });
  }

  // Send message
  async function sendMessage(panel, userMessage, images = [], isEdit = false) {
    const conversationContainer = panel.querySelector('#tweetcraft-conversation');
    
    if (state.contextInvalidated) {
      showContextInvalidatedError(conversationContainer);
      return;
    }

    const attachedImages = isEdit ? images : [...(panel._attachedImages || [])];
    
    if (!isEdit || state.conversation.length === 0) {
      state.conversation.push({
        id: generateId(),
        role: 'user',
        content: userMessage,
        images: attachedImages
      });
    }

    panel._attachedImages = [];
    renderAttachedImages(panel);

    const loadingId = generateId();
    state.conversation.push({
      id: loadingId,
      role: 'assistant',
      content: '',
      candidates: [],
      isLoading: true
    });
    
    renderConversation(panel);
    state.isLoading = true;

    try {
      const settings = await safeChromeStorageGet(['candidates']);
      
      let conversationContext = buildConversationContext();

      const allImages = [];
      state.conversation.forEach(msg => {
        if (msg.images) allImages.push(...msg.images);
      });

      const response = await safeChromeSend({
        type: 'GENERATE_REPLIES',
        payload: {
          originalTweet: state.originalPost,
          tone: panel.dataset.tone,
          context: '',
          feedback: userMessage,
          conversationContext: conversationContext,
          numCandidates: settings.candidates || 3,
          imageUrls: allImages.slice(0, 4),
          platform: PLATFORM
        }
      });

      if (response?.error) {
        throw new Error(response.error);
      }

      const loadingIndex = state.conversation.findIndex(m => m.id === loadingId);
      if (loadingIndex !== -1) {
        state.conversation[loadingIndex] = {
          id: loadingId,
          role: 'assistant',
          content: '',
          candidates: response?.candidates || [],
          selectedIndex: 0,
          isLoading: false
        };
      }

      savePanelState();
      renderConversation(panel);

    } catch (error) {
      console.error('Writer Reddit error:', error);
      
      const loadingIndex = state.conversation.findIndex(m => m.id === loadingId);
      if (loadingIndex !== -1) {
        state.conversation[loadingIndex] = {
          id: loadingId,
          role: 'assistant',
          content: `Error: ${error.message}`,
          candidates: [],
          isLoading: false,
          isError: true
        };
      }
      
      renderConversation(panel);
    } finally {
      state.isLoading = false;
    }
  }

  // Build conversation context for AI
  function buildConversationContext() {
    if (state.conversation.length <= 1) return '';
    
    let context = '\n\nPREVIOUS CONVERSATION:\n';
    state.conversation.slice(0, -1).forEach((msg, i) => {
      if (msg.role === 'user') {
        context += `User instruction ${i + 1}: "${msg.content}"\n`;
      } else if (msg.candidates && msg.candidates.length > 0) {
        const selected = msg.candidates[msg.selectedIndex || 0];
        context += `AI generated (selected): "${selected}"\n`;
      }
    });
    context += '\nNow refine based on the latest instruction above.\n';
    return context;
  }

  // Extract original post/comment text
  function extractOriginalPost(container) {
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

    const parentComment = container?.closest('shreddit-comment')?.querySelector('[slot="comment-body"]')?.innerText ||
                         container?.closest('.Comment')?.querySelector('[data-testid="comment"]')?.innerText ||
                         '';
    
    if (parentComment) {
      return parentComment;
    }

    const thing = container?.closest('.thing');
    if (thing) {
      const title = thing.querySelector('.title a')?.innerText || '';
      const body = thing.querySelector('.usertext-body .md')?.innerText || '';
      return `${title}\n\n${body}`.trim();
    }

    const fallbackTitle = document.querySelector('.top-matter .title a')?.innerText ||
                         document.querySelector('.entry .title')?.innerText ||
                         '';
    const fallbackBody = document.querySelector('.usertext-body .md')?.innerText || '';
    
    return `${fallbackTitle}\n\n${fallbackBody}`.trim();
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
        editable.textContent = text;
        editable.dispatchEvent(new InputEvent('input', { bubbles: true, data: text }));
      }
    }

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
