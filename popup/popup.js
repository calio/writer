// DOM Elements
const providerSelect = document.getElementById('provider');
const apiKeyInput = document.getElementById('apiKey');
const toggleKeyBtn = document.getElementById('toggleKey');
const modelSelect = document.getElementById('model');
const candidatesRange = document.getElementById('candidates');
const candidatesValue = document.getElementById('candidatesValue');
const toneSelect = document.getElementById('tone');
const useHistoryCheckbox = document.getElementById('useHistory');
const saveBtn = document.getElementById('saveBtn');
const statusBar = document.getElementById('statusBar');
const statusText = document.getElementById('statusText');

// Model options by provider
const modelOptions = {
  anthropic: [
    { value: 'claude-sonnet-4-5-20241022', label: 'Claude Sonnet 4.5' },
    { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
    { value: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku' }
  ],
  openai: [
    { value: 'gpt-5.2-2025-12-11', label: 'GPT-5.2' },
    { value: 'gpt-4o', label: 'GPT-4o' },
    { value: 'gpt-4o-mini', label: 'GPT-4o Mini' }
  ]
};

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  setupEventListeners();
});

async function loadSettings() {
  try {
    const settings = await chrome.storage.local.get([
      'provider',
      'apiKey',
      'model',
      'candidates',
      'tone',
      'useHistory'
    ]);

    if (settings.provider) {
      providerSelect.value = settings.provider;
      updateModelOptions(settings.provider);
    }
    if (settings.apiKey) {
      apiKeyInput.value = settings.apiKey;
    }
    if (settings.model) {
      modelSelect.value = settings.model;
    }
    if (settings.candidates) {
      candidatesRange.value = settings.candidates;
      candidatesValue.textContent = settings.candidates;
    }
    if (settings.tone) {
      toneSelect.value = settings.tone;
    }
    if (settings.useHistory !== undefined) {
      useHistoryCheckbox.checked = settings.useHistory;
    }

    updateStatus('success', 'Settings loaded');
  } catch (error) {
    console.error('Failed to load settings:', error);
    updateStatus('error', 'Failed to load settings');
  }
}

function setupEventListeners() {
  // Provider change - update model options
  providerSelect.addEventListener('change', (e) => {
    updateModelOptions(e.target.value);
  });

  // Toggle API key visibility
  toggleKeyBtn.addEventListener('click', () => {
    const isPassword = apiKeyInput.type === 'password';
    apiKeyInput.type = isPassword ? 'text' : 'password';
    toggleKeyBtn.innerHTML = isPassword 
      ? `<svg class="eye-icon" viewBox="0 0 24 24" fill="none">
          <path d="M17.94 17.94C16.2306 19.243 14.1491 19.9649 12 20C5 20 1 12 1 12C2.24389 9.68192 3.96914 7.65663 6.06 6.06M9.9 4.24C10.5883 4.07888 11.2931 3.99834 12 4C19 4 23 12 23 12C22.393 13.1356 21.6691 14.2048 20.84 15.19M14.12 14.12C13.8454 14.4148 13.5141 14.6512 13.1462 14.8151C12.7782 14.9791 12.3809 15.0673 11.9781 15.0744C11.5753 15.0815 11.1752 15.0074 10.8016 14.8565C10.4281 14.7056 10.0887 14.4811 9.80385 14.1962C9.51897 13.9113 9.29439 13.5719 9.14351 13.1984C8.99262 12.8248 8.91853 12.4247 8.92563 12.0219C8.93274 11.6191 9.02091 11.2218 9.18488 10.8538C9.34884 10.4859 9.58525 10.1546 9.88 9.88" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M1 1L23 23" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>`
      : `<svg class="eye-icon" viewBox="0 0 24 24" fill="none">
          <path d="M1 12C1 12 5 4 12 4C19 4 23 12 23 12C23 12 19 20 12 20C5 20 1 12 1 12Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          <circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="2"/>
        </svg>`;
  });

  // Candidates range
  candidatesRange.addEventListener('input', (e) => {
    candidatesValue.textContent = e.target.value;
  });

  // Save button
  saveBtn.addEventListener('click', saveSettings);
}

function updateModelOptions(provider) {
  const options = modelOptions[provider] || [];
  modelSelect.innerHTML = '';
  
  options.forEach(opt => {
    const option = document.createElement('option');
    option.value = opt.value;
    option.textContent = opt.label;
    modelSelect.appendChild(option);
  });
}

async function saveSettings() {
  const provider = providerSelect.value;
  const apiKey = apiKeyInput.value.trim();
  const model = modelSelect.value;
  const candidates = parseInt(candidatesRange.value);
  const tone = toneSelect.value;
  const useHistory = useHistoryCheckbox.checked;

  if (!apiKey) {
    updateStatus('error', 'Please enter an API key');
    apiKeyInput.focus();
    return;
  }

  // Validate API key format
  if (provider === 'anthropic' && !apiKey.startsWith('sk-ant-')) {
    updateStatus('warning', 'Anthropic keys usually start with sk-ant-');
  } else if (provider === 'openai' && !apiKey.startsWith('sk-')) {
    updateStatus('warning', 'OpenAI keys usually start with sk-');
  }

  try {
    await chrome.storage.local.set({
      provider,
      apiKey,
      model,
      candidates,
      tone,
      useHistory
    });

    updateStatus('success', 'Settings saved successfully!');
    
    // Animate button
    saveBtn.style.transform = 'scale(0.98)';
    setTimeout(() => {
      saveBtn.style.transform = '';
    }, 100);

    // Notify content scripts that settings changed
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'SETTINGS_UPDATED' }).catch(() => {});
      }
    });

  } catch (error) {
    console.error('Failed to save settings:', error);
    updateStatus('error', 'Failed to save settings');
  }
}

function updateStatus(type, message) {
  statusBar.className = 'status-bar';
  if (type !== 'success') {
    statusBar.classList.add(type);
  }
  statusText.textContent = message;

  // Auto-clear after 3 seconds for success/warning messages
  if (type === 'success' || type === 'warning') {
    setTimeout(() => {
      statusText.textContent = 'Ready to forge replies';
      statusBar.className = 'status-bar';
    }, 3000);
  }
}

