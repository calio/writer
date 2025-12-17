# Changes - Universal AI Writer

## Overview

Writer AI has been upgraded to work on **any website**, not just Twitter/X and Reddit. The extension now intelligently detects text input fields across the web and automatically extracts relevant context.

## What's New

### 1. Universal Input Detection

- **Automatic Detection**: Finds textareas, input fields, and contenteditable elements on any webpage
- **Smart Filtering**: Only shows AI assistance for meaningful input fields (excludes search boxes, password fields, etc.)
- **Floating Button**: Purple AI button appears near detected input fields
- **Dynamic Tracking**: Monitors page changes to detect new input fields

### 2. Intelligent Context Extraction

The extension automatically gathers context to help the AI understand what you're writing:

- **Parent Context**: Extracts content you're replying to (posts, comments, emails)
- **Page Information**: Uses page title and URL for additional context
- **Nearby Text**: Analyzes labels, headings, and surrounding text
- **Platform Detection**: Recognizes Gmail, LinkedIn, GitHub, StackOverflow, etc.

### 3. Updated UI

- **Side Panel**: Consistent interface across all websites
- **Multiple Options**: Generate 3 different text variations
- **Tone Selection**: 6 tones (Professional, Casual, Witty, Thoughtful, Concise, Detailed)
- **Conversational Refinement**: Provide feedback and regenerate

### 4. New Icon

- **"W" Letter Icon**: Simple, clean design with purple gradient
- **Multiple Formats**: SVG source + generator tools for PNG versions

## Technical Implementation

### Files Added

1. **content/universal.js** - Universal content script for all websites
   - Input detection and validation
   - Context extraction system
   - Button injection and positioning
   - Panel UI and interaction

2. **scripts/create-icons.html** - Browser-based icon generator
   - Creates PNG icons with "W" letter
   - Downloadable in all required sizes

3. **scripts/generate_icons.py** - Python icon generator
   - Uses Pillow library
   - Generates professional icons

4. **scripts/generate-w-icons.js** - Node.js icon generator (SVG)

5. **icons/icon.svg** - Base SVG icon

### Files Modified

1. **manifest.json**
   - Added `<all_urls>` to host_permissions
   - Added universal.js content script with exclude patterns
   - Maintains separate scripts for Twitter/X and Reddit for platform-specific features

2. **README.md**
   - Updated description to highlight universal functionality
   - Added universal mode usage instructions
   - Updated features list

## How It Works

### Input Detection Flow

1. Content script loads on page
2. Scans for valid input elements (textarea, input[type="text"], contenteditable)
3. Validates each input (size, visibility, type)
4. Injects floating AI button for valid inputs
5. Monitors DOM for new inputs

### Context Extraction Flow

1. User clicks AI button on an input
2. System extracts parent context:
   - Finds containing article/post/comment
   - Gets text from previous siblings
   - Locates associated content
3. Gathers nearby context:
   - Input placeholder/label
   - Nearby headings
   - Page title and type
4. Formats context for LLM

### Generation Flow

1. User clicks AI button or sends message
2. Context + user message + tone → background script
3. Background calls OpenAI/Anthropic API
4. Returns multiple candidates
5. User selects and refines or uses text

## Platform Support

### Tested Platforms

- ✅ **Twitter/X** - Native integration (existing)
- ✅ **Reddit** - Native integration (existing)
- ✅ **Any website** - Universal mode (new)

### Recommended Use Cases

- **Email**: Gmail, Outlook, Yahoo Mail
- **Social**: LinkedIn, Facebook, Discord, Slack
- **Development**: GitHub comments, StackOverflow answers
- **Forums**: Any discussion board or comment system
- **Forms**: Contact forms, support tickets, feedback forms

## Icon Generation

### Option 1: Use HTML Generator (Easiest)

```bash
open scripts/create-icons.html
```

Click "Download All" to get PNG files in all sizes.

### Option 2: Use Python Script

```bash
python3 -m venv venv
source venv/bin/activate
pip install Pillow
python scripts/generate_icons.py
```

### Option 3: Use SVG Directly

Chrome extensions support SVG icons. You can reference `icons/icon.svg` directly in the manifest.

## Installation & Testing

1. **Generate Icons**:
   ```bash
   open scripts/create-icons.html
   # Download all icons and save to icons/ folder
   ```

2. **Load Extension**:
   - Open `chrome://extensions/`
   - Enable Developer mode
   - Click "Load unpacked"
   - Select the `writer` folder

3. **Test Universal Mode**:
   - Visit gmail.com, linkedin.com, or any website
   - Look for purple AI button near text inputs
   - Click button and test text generation

## Migration Notes

### Backward Compatibility

- ✅ Existing Twitter/X functionality unchanged
- ✅ Existing Reddit functionality unchanged
- ✅ Settings and API keys preserved
- ✅ User history and preferences maintained

### Permissions

The extension now requests `<all_urls>` permission to work on any website. Users will see a permission prompt when updating.

### Performance

- Efficient DOM observation with debouncing
- Lightweight button injection
- Lazy loading of AI panel
- Context extraction optimized for performance

## Future Enhancements

- [ ] Custom context extraction rules per domain
- [ ] User-configurable button position
- [ ] Keyboard shortcuts for activation
- [ ] Templates for common writing tasks
- [ ] Multi-language support
- [ ] Offline mode with local models
- [ ] Analytics and usage insights

## Credits

Built with Claude Code - AI pair programming assistant.
