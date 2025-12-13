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

// Profile Elements
const userProfileTextarea = document.getElementById('userProfile');
const pdfUploadInput = document.getElementById('pdfUpload');
const fileUploadArea = document.getElementById('fileUploadArea');
const uploadedFilesContainer = document.getElementById('uploadedFiles');

// Store uploaded documents
let uploadedDocuments = [];

// Model options by provider (OpenAI first as default)
const modelOptions = {
  openai: [
    { value: 'gpt-5.2-2025-12-11', label: 'GPT-5.2' },
    { value: 'gpt-4o', label: 'GPT-4o' },
    { value: 'gpt-4o-mini', label: 'GPT-4o Mini' }
  ],
  anthropic: [
    { value: 'claude-sonnet-4-5-20241022', label: 'Claude Sonnet 4.5' },
    { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
    { value: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku' }
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
      'useHistory',
      'userProfile',
      'uploadedDocuments'
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
    if (settings.userProfile) {
      userProfileTextarea.value = settings.userProfile;
    }
    if (settings.uploadedDocuments) {
      uploadedDocuments = settings.uploadedDocuments;
      renderUploadedFiles();
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

  // File upload handling
  setupFileUpload();
}

// Setup file upload functionality
function setupFileUpload() {
  // Click to upload
  fileUploadArea.addEventListener('click', () => {
    pdfUploadInput.click();
  });

  // Drag and drop
  fileUploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    fileUploadArea.classList.add('drag-over');
  });

  fileUploadArea.addEventListener('dragleave', () => {
    fileUploadArea.classList.remove('drag-over');
  });

  fileUploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    fileUploadArea.classList.remove('drag-over');
    const files = Array.from(e.dataTransfer.files);
    handleFileUpload(files);
  });

  // File input change
  pdfUploadInput.addEventListener('change', (e) => {
    const files = Array.from(e.target.files);
    handleFileUpload(files);
    pdfUploadInput.value = ''; // Reset for re-upload
  });
}

// Handle file upload
async function handleFileUpload(files) {
  const validFiles = files.filter(f => 
    f.type === 'application/pdf' || 
    f.type === 'text/plain' || 
    f.type === 'text/markdown' ||
    f.name.endsWith('.md') ||
    f.name.endsWith('.txt') ||
    f.name.endsWith('.pdf')
  );

  if (validFiles.length === 0) {
    updateStatus('error', 'Please upload PDF, TXT, or MD files');
    return;
  }

  updateStatus('warning', 'Processing files...');

  for (const file of validFiles) {
    try {
      const content = await extractFileContent(file);
      if (content) {
        // Check if file already exists
        const existingIndex = uploadedDocuments.findIndex(d => d.name === file.name);
        if (existingIndex !== -1) {
          uploadedDocuments[existingIndex] = {
            name: file.name,
            content: content,
            size: file.size,
            uploadedAt: Date.now()
          };
        } else {
          uploadedDocuments.push({
            name: file.name,
            content: content,
            size: file.size,
            uploadedAt: Date.now()
          });
        }
      }
    } catch (error) {
      console.error('Error processing file:', file.name, error);
      updateStatus('error', `Failed to process ${file.name}`);
    }
  }

  renderUploadedFiles();
  await saveDocuments();
  updateStatus('success', `${validFiles.length} file(s) uploaded`);
}

// Extract content from file
async function extractFileContent(file) {
  if (file.type === 'text/plain' || file.type === 'text/markdown' || file.name.endsWith('.md') || file.name.endsWith('.txt')) {
    return await file.text();
  } else if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
    return await extractPdfContent(file);
  }
  return null;
}

// Extract text from PDF using pdf.js
async function extractPdfContent(file) {
  try {
    // Initialize pdf.js worker path
    if (window.pdfjsLib && !window.pdfjsLib.GlobalWorkerOptions.workerSrc) {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('lib/pdf.worker.min.js');
    }

    if (!window.pdfjsLib) {
      throw new Error('PDF.js library not loaded');
    }

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    
    let fullText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map(item => item.str).join(' ');
      fullText += pageText + '\n\n';
    }
    
    return fullText.trim();
  } catch (error) {
    console.error('PDF extraction error:', error);
    // Fallback: try to read as text
    try {
      return await file.text();
    } catch {
      throw new Error('Could not extract text from PDF');
    }
  }
}

// Render uploaded files
function renderUploadedFiles() {
  if (uploadedDocuments.length === 0) {
    uploadedFilesContainer.innerHTML = '';
    return;
  }

  uploadedFilesContainer.innerHTML = uploadedDocuments.map((doc, index) => `
    <div class="uploaded-file" data-index="${index}">
      <div class="file-info">
        <svg class="file-icon" viewBox="0 0 24 24" fill="none">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          <polyline points="14,2 14,8 20,8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <span class="file-name">${escapeHtml(doc.name)}</span>
        <span class="file-size">${formatFileSize(doc.size)}</span>
      </div>
      <button class="file-remove" data-index="${index}" title="Remove file">×</button>
    </div>
  `).join('');

  // Add remove listeners
  uploadedFilesContainer.querySelectorAll('.file-remove').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const index = parseInt(btn.dataset.index);
      uploadedDocuments.splice(index, 1);
      renderUploadedFiles();
      await saveDocuments();
      updateStatus('success', 'File removed');
    });
  });
}

// Save documents to storage
async function saveDocuments() {
  try {
    await chrome.storage.local.set({ uploadedDocuments });
  } catch (error) {
    console.error('Failed to save documents:', error);
  }
}

// Format file size
function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// Escape HTML
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
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
  const userProfile = userProfileTextarea.value.trim();

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
      useHistory,
      userProfile
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

