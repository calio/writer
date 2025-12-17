// Writer AI - Universal Content Script
// Works on any website with input fields, automatically extracting relevant context

(function() {
  'use strict';

  // State
  let state = {
    conversation: [],
    isLoading: false,
    currentInput: null,
    currentPanel: null,
    tone: 'match',
    contextInvalidated: false,
    lastUrl: window.location.href,
    originalContext: '',
    trackedInputs: new WeakSet()
  };

  // Generate unique ID
  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  // Check if extension context is valid
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

  // ========== CONTEXT EXTRACTION ==========

  /**
   * Extract relevant context from the page for the given input element
   * This intelligently gathers context based on the input's location
   */
  function extractPageContext(inputElement) {
    const context = {
      pageTitle: document.title,
      url: window.location.href,
      parentContext: '',
      nearbyText: '',
      pageType: detectPageType()
    };

    // Extract parent context (e.g., the post/comment being replied to)
    context.parentContext = extractParentContext(inputElement);

    // Extract nearby text
    context.nearbyText = extractNearbyText(inputElement);

    return context;
  }

  /**
   * Detect what type of page we're on
   */
  function detectPageType() {
    const url = window.location.href.toLowerCase();
    const hostname = window.location.hostname.toLowerCase();

    if (hostname.includes('mail.google.com')) return 'email';
    if (hostname.includes('linkedin.com')) return 'linkedin';
    if (hostname.includes('facebook.com')) return 'facebook';
    if (hostname.includes('slack.com')) return 'slack';
    if (hostname.includes('discord.com')) return 'discord';
    if (hostname.includes('github.com')) return 'github';
    if (hostname.includes('stackoverflow.com')) return 'stackoverflow';
    if (url.includes('/comment')) return 'comment';
    if (url.includes('/reply')) return 'reply';
    if (url.includes('/message')) return 'message';

    return 'generic';
  }

  /**
   * Extract the parent context (what is being replied to)
   * Looks for content above or near the input field
   */
  function extractParentContext(inputElement) {
    let context = '';

    // Try to find the parent container (article, post, comment, etc.)
    const article = inputElement.closest('article');
    const post = inputElement.closest('[class*="post"], [class*="comment"], [class*="message"]');
    const container = article || post || inputElement.closest('div[role="article"]');

    if (container) {
      // Get text content from the container, excluding the input itself
      const clone = container.cloneNode(true);

      // Remove input elements from clone
      clone.querySelectorAll('textarea, input, [contenteditable="true"]').forEach(el => el.remove());

      // Get visible text
      context = getVisibleText(clone).substring(0, 2000);
    }

    // If no container found, look for text in previous siblings
    if (!context) {
      let sibling = inputElement.previousElementSibling;
      let attempts = 0;
      while (sibling && attempts < 5) {
        const text = getVisibleText(sibling);
        if (text.length > 20) {
          context = text.substring(0, 2000);
          break;
        }
        sibling = sibling.previousElementSibling;
        attempts++;
      }
    }

    // Try parent element's previous siblings
    if (!context && inputElement.parentElement) {
      let sibling = inputElement.parentElement.previousElementSibling;
      let attempts = 0;
      while (sibling && attempts < 5) {
        const text = getVisibleText(sibling);
        if (text.length > 20) {
          context = text.substring(0, 2000);
          break;
        }
        sibling = sibling.previousElementSibling;
        attempts++;
      }
    }

    return context.trim();
  }

  /**
   * Extract nearby text around the input
   */
  function extractNearbyText(inputElement) {
    const nearby = [];

    // Get placeholder or label
    const placeholder = inputElement.placeholder || inputElement.getAttribute('aria-label');
    if (placeholder) nearby.push(placeholder);

    // Find associated labels
    const labels = inputElement.labels || document.querySelectorAll(`label[for="${inputElement.id}"]`);
    labels.forEach(label => {
      const text = getVisibleText(label);
      if (text) nearby.push(text);
    });

    // Get heading before the input
    let current = inputElement;
    for (let i = 0; i < 10; i++) {
      current = current.previousElementSibling || current.parentElement;
      if (!current) break;

      const heading = current.querySelector('h1, h2, h3, h4, h5, h6');
      if (heading) {
        nearby.push(getVisibleText(heading));
        break;
      }
      if (current.matches('h1, h2, h3, h4, h5, h6')) {
        nearby.push(getVisibleText(current));
        break;
      }
    }

    return nearby.filter(Boolean).join(' | ').substring(0, 500);
  }

  /**
   * Get visible text from an element
   */
  function getVisibleText(element) {
    if (!element) return '';

    // Check if element is visible
    const style = window.getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
      return '';
    }

    return element.innerText || element.textContent || '';
  }

  /**
   * Format context for LLM
   */
  function formatContextForLLM(context) {
    const parts = [];

    if (context.pageTitle) {
      parts.push(`Page: ${context.pageTitle}`);
    }

    if (context.nearbyText) {
      parts.push(`Input context: ${context.nearbyText}`);
    }

    if (context.parentContext) {
      parts.push(`Replying to:\n${context.parentContext}`);
    }

    if (context.pageType !== 'generic') {
      parts.push(`Platform: ${context.pageType}`);
    }

    return parts.join('\n\n');
  }

  // ========== INPUT DETECTION ==========

  /**
   * Check if an input element is suitable for AI assistance
   */
  function isValidInput(element) {
    // Check element type
    const isTextarea = element.tagName === 'TEXTAREA';
    const isInput = element.tagName === 'INPUT' && ['text', 'email', 'search'].includes(element.type);
    const isContentEditable = element.contentEditable === 'true';

    if (!isTextarea && !isInput && !isContentEditable) return false;

    // Skip if too small (likely not for composition)
    const rect = element.getBoundingClientRect();
    if (rect.height < 40 || rect.width < 100) return false;

    // Skip if it's a search box at the top of the page
    if ((isInput || element.type === 'search') && rect.top < 100) return false;

    // Skip password fields
    if (element.type === 'password') return false;

    // Skip if already tracked
    if (state.trackedInputs.has(element)) return false;

    // Check if visible
    const style = window.getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden') return false;

    return true;
  }

  /**
   * Find all valid input elements on the page
   */
  function findInputElements() {
    const inputs = [];

    // Find textareas
    document.querySelectorAll('textarea').forEach(textarea => {
      if (isValidInput(textarea)) inputs.push(textarea);
    });

    // Find text inputs
    document.querySelectorAll('input[type="text"], input[type="email"], input:not([type])').forEach(input => {
      if (isValidInput(input)) inputs.push(input);
    });

    // Find contenteditable elements
    document.querySelectorAll('[contenteditable="true"]').forEach(editable => {
      if (isValidInput(editable)) inputs.push(editable);
    });

    return inputs;
  }

  // ========== UI INJECTION ==========

  /**
   * Create AI Writer button
   */
  function createAIButton() {
    const btn = document.createElement('button');
    btn.className = 'writer-ai-btn';
    btn.type = 'button';
    btn.title = 'AI Writer Assistant';
    btn.setAttribute('aria-label', 'AI Writer Assistant');
    btn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 18px; height: 18px;">
        <path d="M12 2L2 7L12 12L22 7L12 2Z"/>
        <path d="M2 17L12 22L22 17"/>
        <path d="M2 12L12 17L22 12"/>
      </svg>
    `;

    // Styling
    Object.assign(btn.style, {
      position: 'absolute',
      zIndex: '10000',
      width: '32px',
      height: '32px',
      border: 'none',
      borderRadius: '6px',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      color: 'white',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '0',
      boxShadow: '0 2px 8px rgba(102, 126, 234, 0.3)',
      transition: 'all 0.2s ease',
      opacity: '0.9'
    });

    btn.addEventListener('mouseenter', () => {
      btn.style.opacity = '1';
      btn.style.transform = 'scale(1.05)';
      btn.style.boxShadow = '0 4px 12px rgba(102, 126, 234, 0.4)';
    });

    btn.addEventListener('mouseleave', () => {
      if (!btn.classList.contains('active')) {
        btn.style.opacity = '0.9';
        btn.style.transform = 'scale(1)';
        btn.style.boxShadow = '0 2px 8px rgba(102, 126, 234, 0.3)';
      }
    });

    return btn;
  }

  /**
   * Position button relative to input element
   */
  function positionButton(btn, inputElement) {
    const rect = inputElement.getBoundingClientRect();
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;

    // Position at top-right corner of input
    btn.style.top = `${rect.top + scrollTop - 40}px`;
    btn.style.left = `${rect.right + scrollLeft - 36}px`;
  }

  /**
   * Inject AI button for an input element
   */
  function injectButton(inputElement) {
    if (state.trackedInputs.has(inputElement)) return;

    const btn = createAIButton();
    document.body.appendChild(btn);

    // Position initially
    positionButton(btn, inputElement);

    // Reposition on scroll/resize
    const reposition = () => positionButton(btn, inputElement);
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);

    // Handle click
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      togglePanel(inputElement, btn);
    });

    // Hide button when input is not visible
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        btn.style.display = entry.isIntersecting ? 'flex' : 'none';
      });
    });
    observer.observe(inputElement);

    // Track this input
    state.trackedInputs.add(inputElement);

    // Remove button when input is removed
    const removalObserver = new MutationObserver(() => {
      if (!document.body.contains(inputElement)) {
        btn.remove();
        observer.disconnect();
        removalObserver.disconnect();
        window.removeEventListener('scroll', reposition, true);
        window.removeEventListener('resize', reposition);
      }
    });
    removalObserver.observe(document.body, { childList: true, subtree: true });
  }

  /**
   * Scan page and inject buttons for all valid inputs
   */
  function scanAndInject() {
    const inputs = findInputElements();
    inputs.forEach(input => injectButton(input));
  }

  // ========== PANEL UI ==========

  /**
   * Toggle AI Writer panel
   */
  function togglePanel(inputElement, btn) {
    const existingPanel = document.querySelector('.writer-ai-panel');
    if (existingPanel) {
      closePanel(existingPanel);
      btn.classList.remove('active');
      btn.style.opacity = '0.9';
      return;
    }

    state.currentInput = inputElement;
    btn.classList.add('active');
    btn.style.opacity = '1';

    // Extract context
    const context = extractPageContext(inputElement);
    const contextText = formatContextForLLM(context);

    // Check if context changed
    if (state.originalContext !== contextText) {
      console.log('Writer: Context changed, clearing conversation');
      state.conversation = [];
      state.originalContext = contextText;
    }

    const panel = createPanel();
    state.currentPanel = panel;
    document.body.appendChild(panel);

    // Trigger animation
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        panel.classList.add('visible');
      });
    });

    // Auto-generate if fresh conversation
    if (state.conversation.length === 0) {
      setTimeout(() => sendMessage(panel, 'Generate text for this context'), 300);
    }
  }

  /**
   * Create AI Writer panel
   */
  function createPanel() {
    const panel = document.createElement('div');
    panel.className = 'writer-ai-panel';

    Object.assign(panel.style, {
      position: 'fixed',
      top: '0',
      right: '-450px',
      width: '420px',
      height: '100vh',
      background: 'white',
      boxShadow: '-4px 0 24px rgba(0, 0, 0, 0.15)',
      zIndex: '999999',
      display: 'flex',
      flexDirection: 'column',
      transition: 'right 0.3s ease',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    });

    panel.innerHTML = `
      <div style="padding: 20px; border-bottom: 1px solid #e5e7eb; display: flex; justify-content: space-between; align-items: center; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);">
        <h3 style="margin: 0; font-size: 18px; font-weight: 600; color: white;">✨ AI Writer</h3>
        <button class="writer-close-btn" style="background: none; border: none; color: white; font-size: 24px; cursor: pointer; padding: 0; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; border-radius: 4px; opacity: 0.9; transition: all 0.2s;">×</button>
      </div>

      <div class="writer-conversation" style="flex: 1; overflow-y: auto; padding: 16px; background: #f9fafb;"></div>

      <div style="padding: 16px; border-top: 1px solid #e5e7eb; background: white;">
        <div style="display: flex; gap: 8px; margin-bottom: 12px;">
          <select class="writer-tone-select" style="flex: 1; padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 14px; background: white; cursor: pointer;">
            <option value="professional">Professional</option>
            <option value="casual">Casual</option>
            <option value="witty">Witty</option>
            <option value="thoughtful">Thoughtful</option>
            <option value="concise">Concise</option>
            <option value="detailed">Detailed</option>
          </select>
        </div>
        <div style="display: flex; gap: 8px;">
          <input type="text" class="writer-input" placeholder="Refine or ask for changes..." style="flex: 1; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 14px; outline: none;">
          <button class="writer-send-btn" style="padding: 10px 16px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border: none; border-radius: 6px; font-weight: 500; cursor: pointer; font-size: 14px; transition: all 0.2s;">Send</button>
        </div>
      </div>
    `;

    // Event listeners
    panel.querySelector('.writer-close-btn').addEventListener('click', () => {
      closePanel(panel);
      document.querySelectorAll('.writer-ai-btn.active').forEach(b => b.classList.remove('active'));
    });

    const input = panel.querySelector('.writer-input');
    const sendBtn = panel.querySelector('.writer-send-btn');

    sendBtn.addEventListener('click', () => {
      const message = input.value.trim();
      if (message) {
        sendMessage(panel, message);
        input.value = '';
      }
    });

    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendBtn.click();
      }
    });

    const toneSelect = panel.querySelector('.writer-tone-select');
    toneSelect.value = state.tone;
    toneSelect.addEventListener('change', (e) => {
      state.tone = e.target.value;
    });

    renderConversation(panel);
    return panel;
  }

  /**
   * Close panel
   */
  function closePanel(panel) {
    panel.style.right = '-450px';
    setTimeout(() => panel.remove(), 300);
    state.currentPanel = null;
  }

  /**
   * Add visible class for animation
   */
  panel.classList.add = function(className) {
    if (className === 'visible') {
      this.style.right = '0';
    }
  };

  /**
   * Send message to AI
   */
  async function sendMessage(panel, userMessage) {
    if (state.isLoading) return;

    // Add user message
    const messageId = generateId();
    state.conversation.push({
      role: 'user',
      content: userMessage,
      id: messageId
    });

    renderConversation(panel);
    state.isLoading = true;

    try {
      // Prepare context
      const context = extractPageContext(state.currentInput);
      const contextText = formatContextForLLM(context);

      // Get current input value
      let currentText = '';
      if (state.currentInput.tagName === 'TEXTAREA' || state.currentInput.tagName === 'INPUT') {
        currentText = state.currentInput.value;
      } else if (state.currentInput.contentEditable === 'true') {
        currentText = state.currentInput.innerText || state.currentInput.textContent;
      }

      // Map tone to existing tone values
      const toneMap = {
        professional: 'professional',
        casual: 'casual',
        witty: 'witty',
        thoughtful: 'thoughtful',
        concise: 'professional', // Map to professional for brevity
        detailed: 'thoughtful'    // Map to thoughtful for detail
      };

      const mappedTone = toneMap[state.tone] || 'professional';
      const numCandidates = 3;

      // Build context string for the existing API
      let fullContext = contextText;
      if (currentText) {
        fullContext += `\n\nCurrent draft: ${currentText}`;
      }

      // Build feedback string from user message if not the initial generation
      const isInitialGeneration = userMessage === 'Generate text for this context';
      const feedback = isInitialGeneration ? '' : userMessage;

      // Call background script using the existing GENERATE_REPLIES format
      const response = await safeChromeSend({
        type: 'GENERATE_REPLIES',
        payload: {
          originalTweet: contextText,
          tone: mappedTone,
          context: fullContext,
          feedback: feedback,
          numCandidates: numCandidates,
          imageUrls: [],
          platform: 'generic',
          conversationContext: state.conversation.map(msg =>
            `${msg.role}: ${msg.content}`
          ).join('\n\n')
        }
      });

      if (response.error) {
        throw new Error(response.error);
      }

      // Add assistant response
      const assistantId = generateId();
      state.conversation.push({
        role: 'assistant',
        content: response.candidates ? response.candidates[0] : '',
        candidates: response.candidates || [],
        selectedIndex: 0,
        id: assistantId
      });

      renderConversation(panel);

    } catch (error) {
      console.error('Writer: Error generating text', error);

      // Add error message
      state.conversation.push({
        role: 'assistant',
        content: `Error: ${error.message}`,
        id: generateId(),
        error: true
      });

      renderConversation(panel);
    } finally {
      state.isLoading = false;
    }
  }

  /**
   * Render conversation
   */
  function renderConversation(panel) {
    const container = panel.querySelector('.writer-conversation');
    container.innerHTML = '';

    state.conversation.forEach(msg => {
      if (msg.role === 'user') {
        const userMsg = document.createElement('div');
        userMsg.style.cssText = 'margin-bottom: 16px; text-align: right;';
        userMsg.innerHTML = `
          <div style="display: inline-block; background: #667eea; color: white; padding: 10px 14px; border-radius: 12px; max-width: 80%; text-align: left; font-size: 14px; line-height: 1.5;">
            ${escapeHtml(msg.content)}
          </div>
        `;
        container.appendChild(userMsg);
      } else {
        const assistantMsg = document.createElement('div');
        assistantMsg.style.cssText = 'margin-bottom: 16px;';

        if (msg.error) {
          assistantMsg.innerHTML = `
            <div style="background: #fee; color: #c33; padding: 10px 14px; border-radius: 12px; font-size: 14px; border: 1px solid #fcc;">
              ${escapeHtml(msg.content)}
            </div>
          `;
        } else if (msg.candidates && msg.candidates.length > 0) {
          const candidatesHtml = msg.candidates.map((candidate, idx) => `
            <div class="writer-candidate" data-msg-id="${msg.id}" data-idx="${idx}" style="
              background: ${idx === msg.selectedIndex ? '#eff6ff' : 'white'};
              border: 2px solid ${idx === msg.selectedIndex ? '#3b82f6' : '#e5e7eb'};
              padding: 12px;
              border-radius: 8px;
              margin-bottom: 8px;
              cursor: pointer;
              font-size: 14px;
              line-height: 1.6;
              transition: all 0.2s;
            ">
              <div style="white-space: pre-wrap;">${escapeHtml(candidate)}</div>
              ${idx === msg.selectedIndex ? `
                <button class="writer-use-btn" data-text="${escapeHtml(candidate)}" style="
                  margin-top: 8px;
                  padding: 6px 12px;
                  background: #3b82f6;
                  color: white;
                  border: none;
                  border-radius: 4px;
                  font-size: 12px;
                  font-weight: 500;
                  cursor: pointer;
                  transition: all 0.2s;
                ">Use this text</button>
              ` : ''}
            </div>
          `).join('');

          assistantMsg.innerHTML = candidatesHtml;
        } else {
          assistantMsg.innerHTML = `
            <div style="background: white; border: 1px solid #e5e7eb; padding: 10px 14px; border-radius: 12px; max-width: 80%; font-size: 14px; line-height: 1.5;">
              ${escapeHtml(msg.content)}
            </div>
          `;
        }

        container.appendChild(assistantMsg);
      }
    });

    // Add event listeners for candidates
    container.querySelectorAll('.writer-candidate').forEach(el => {
      el.addEventListener('click', function() {
        const msgId = this.dataset.msgId;
        const idx = parseInt(this.dataset.idx);

        const msg = state.conversation.find(m => m.id === msgId);
        if (msg) {
          msg.selectedIndex = idx;
          renderConversation(panel);
        }
      });
    });

    // Add event listeners for use buttons
    container.querySelectorAll('.writer-use-btn').forEach(btn => {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        const text = this.dataset.text;
        useText(text);
      });
    });

    // Add loading indicator
    if (state.isLoading) {
      const loader = document.createElement('div');
      loader.style.cssText = 'text-align: left; margin-bottom: 16px;';
      loader.innerHTML = `
        <div style="display: inline-block; background: white; border: 1px solid #e5e7eb; padding: 10px 14px; border-radius: 12px; font-size: 14px;">
          <span class="writer-loading-dots">Thinking</span>
        </div>
      `;
      container.appendChild(loader);
    }

    container.scrollTop = container.scrollHeight;
  }

  /**
   * Use generated text
   */
  function useText(text) {
    if (!state.currentInput || !text) return;

    // Insert text into input
    if (state.currentInput.tagName === 'TEXTAREA' || state.currentInput.tagName === 'INPUT') {
      state.currentInput.value = text;
      state.currentInput.dispatchEvent(new Event('input', { bubbles: true }));
      state.currentInput.dispatchEvent(new Event('change', { bubbles: true }));
    } else if (state.currentInput.contentEditable === 'true') {
      state.currentInput.innerText = text;
      state.currentInput.dispatchEvent(new Event('input', { bubbles: true }));
    }

    // Focus the input
    state.currentInput.focus();

    // Close panel
    if (state.currentPanel) {
      closePanel(state.currentPanel);
      document.querySelectorAll('.writer-ai-btn.active').forEach(b => b.classList.remove('active'));
    }
  }

  /**
   * Escape HTML
   */
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // ========== INITIALIZATION ==========

  /**
   * Initialize the extension
   */
  function init() {
    console.log('Writer AI: Universal mode initialized');

    // Initial scan
    scanAndInject();

    // Observe DOM for new inputs
    const observer = new MutationObserver(() => {
      clearTimeout(window.writerDebounce);
      window.writerDebounce = setTimeout(scanAndInject, 200);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    // Periodic re-scan (for dynamically loaded content)
    setInterval(scanAndInject, 2000);
  }

  // Start when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Add loading animation styles
  const style = document.createElement('style');
  style.textContent = `
    @keyframes writer-dots {
      0%, 20% { content: 'Thinking'; }
      40% { content: 'Thinking.'; }
      60% { content: 'Thinking..'; }
      80%, 100% { content: 'Thinking...'; }
    }
    .writer-loading-dots::after {
      content: '';
      animation: writer-dots 1.5s infinite;
    }
    .writer-candidate:hover {
      box-shadow: 0 2px 8px rgba(0,0,0,0.1) !important;
    }
    .writer-use-btn:hover {
      background: #2563eb !important;
    }
    .writer-close-btn:hover {
      background: rgba(255,255,255,0.2) !important;
      opacity: 1 !important;
    }
  `;
  document.head.appendChild(style);

})();
