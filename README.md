# TweetCraft AI 🚀

A Chrome extension that helps you craft intelligent, personalized tweet replies using AI (OpenAI GPT or Anthropic Claude).

![TweetCraft AI](https://img.shields.io/badge/TweetCraft-AI%20Powered-6366f1?style=for-the-badge)
![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-4285f4?style=for-the-badge&logo=googlechrome&logoColor=white)

## ✨ Features

- **AI-Powered Replies**: Generate multiple reply candidates using GPT-4 or Claude
- **Personal Style Matching**: Uses your previous tweets as context to match your voice
- **Multiple Tones**: Professional, Casual, Witty, Thoughtful, or Match My Style
- **Edit & Refine**: Edit generated replies directly, provide feedback for regeneration
- **Seamless Integration**: Beautiful UI that integrates right into Twitter/X

## 🛠️ Installation

### Step 1: Clone or Download

```bash
git clone https://github.com/yourusername/tweetcraft-ai.git
# or download and extract the ZIP
```

### Step 2: Generate Icons

Before loading the extension, you need to create icon files. You can use any image editor to create PNG icons at these sizes:
- `icons/icon16.png` (16x16 pixels)
- `icons/icon32.png` (32x32 pixels)
- `icons/icon48.png` (48x48 pixels)
- `icons/icon128.png` (128x128 pixels)

Or run this script to generate placeholder icons (requires Node.js):

```bash
node scripts/generate-icons.js
```

### Step 3: Load in Chrome

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable **Developer mode** (toggle in top right)
3. Click **Load unpacked**
4. Select the `tweets` folder containing `manifest.json`
5. The TweetCraft AI icon should appear in your extensions bar

## ⚙️ Configuration

1. Click the TweetCraft AI icon in your Chrome toolbar
2. Select your **AI Provider** (Anthropic or OpenAI)
3. Enter your **API Key**:
   - For Anthropic: Get your key at [console.anthropic.com](https://console.anthropic.com/)
   - For OpenAI: Get your key at [platform.openai.com](https://platform.openai.com/)
4. Choose your preferred **Model**
5. Set the number of **Reply Candidates** to generate (1-5)
6. Select your default **Tone**
7. Click **Save Settings**

## 🎯 Usage

1. Navigate to [twitter.com](https://twitter.com) or [x.com](https://x.com)
2. Click on any tweet to view it
3. Look for the **TweetCraft button** (purple gradient icon) in the reply toolbar
4. Click it to open the reply generator
5. The extension will:
   - Analyze the original tweet
   - Use your previous tweets for style context (if enabled)
   - Generate multiple reply options
6. **Select** a reply by clicking on it
7. **Edit** directly if needed (click the pencil icon)
8. Provide **feedback** and regenerate if you want different options
9. Click **Use Reply** to insert it into the tweet composer

## 🎨 Tone Options

| Tone | Description |
|------|-------------|
| **Match My Style** | Learns from your previous tweets to match your voice |
| **Professional** | Polished, business-appropriate responses |
| **Casual** | Friendly, conversational tone |
| **Witty** | Clever and humorous (tastefully) |
| **Thoughtful** | Adds value and insight to the conversation |

## 🔐 Privacy & Security

- Your API key is stored locally in Chrome's secure storage
- Your tweet history is cached locally for context (refreshable anytime)
- No data is sent to any server except the AI provider you choose
- All API calls are made directly from your browser

## 🐛 Troubleshooting

### Extension not appearing on Twitter?
- Refresh the Twitter page after installing
- Check that the extension is enabled in `chrome://extensions/`
- Make sure you're on twitter.com or x.com

### API errors?
- Verify your API key is correct
- Check that you have API credits/quota available
- For Anthropic, ensure the `anthropic-dangerous-direct-browser-access` header is working

### Button not showing in reply area?
- Twitter occasionally updates their UI structure
- Try clicking on a tweet first to open the reply view
- Refresh the page

## 📁 Project Structure

```
tweets/
├── manifest.json          # Extension manifest (v3)
├── popup/
│   ├── popup.html         # Settings popup UI
│   ├── popup.css          # Popup styles
│   └── popup.js           # Popup logic
├── content/
│   ├── content.js         # Twitter integration & UI
│   └── content.css        # Overlay styles
├── background/
│   └── background.js      # Service worker for API calls
├── icons/
│   ├── icon16.png
│   ├── icon32.png
│   ├── icon48.png
│   └── icon128.png
└── README.md
```

## 🤝 Contributing

Contributions are welcome! Feel free to:
- Report bugs
- Suggest features
- Submit pull requests

## 📄 License

MIT License - feel free to use and modify as you like.

---

Made with ❤️ and AI

