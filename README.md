# Writer AI ✍️

A Chrome extension that helps you craft intelligent, personalized replies using AI on Twitter/X and Reddit.

![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-4285f4?style=for-the-badge&logo=googlechrome&logoColor=white)

## 🚀 Quick Install

### 1. Download the Extension

```bash
git clone https://github.com/yourusername/yangon.git
cd yangon
```

Or [download as ZIP](https://github.com/yourusername/yangon/archive/refs/heads/main.zip) and extract.

### 2. Load in Chrome

**Step 1:** Open Chrome and go to `chrome://extensions/`

![Extensions page](screenshots/step1-extensions-page.png)

**Step 2:** Enable **Developer mode** (toggle in top right)

![Enable developer mode](screenshots/step2-developer-mode.png)

**Step 3:** Click **Load unpacked** and select the `yangon` folder

The Writer AI icon should now appear in your extensions toolbar.

### 3. Configure API Key

1. Click the Writer AI icon in your Chrome toolbar
2. Select your **AI Provider** (Anthropic or OpenAI)
3. Enter your **API Key**:
   - Anthropic: [console.anthropic.com](https://console.anthropic.com/)
   - OpenAI: [platform.openai.com](https://platform.openai.com/)
4. Click **Save Settings**

## 💡 How to Use

### On Twitter/X

1. Open any tweet on [twitter.com](https://twitter.com) or [x.com](https://x.com)
2. Click the **Writer AI button** (purple icon) in the reply toolbar
3. Review the AI-generated reply options
4. Click **Use this** to insert your chosen reply

### On Reddit

1. Find a post or comment on [reddit.com](https://reddit.com)
2. Click **reply** to open the comment form
3. Click the **Writer AI button** near the text area
4. Select and insert your preferred reply

## ✨ Features

- **AI-Powered Replies**: Generate multiple reply candidates using GPT or Claude
- **Personal Style Matching**: Uses your previous posts to match your voice
- **Multiple Tones**: Professional, Casual, Witty, Thoughtful, or Match My Style
- **Vision Support**: Analyzes images in tweets for context-aware replies
- **Platform Support**: Works on Twitter/X and Reddit

## 🔐 Privacy

- API keys stored locally in Chrome's secure storage
- Post history cached locally for context
- No data sent except to your chosen AI provider
- All API calls made directly from your browser

## 🐛 Troubleshooting

**Extension not appearing?**
- Refresh the page after installing
- Verify extension is enabled at `chrome://extensions/`

**API errors?**
- Check your API key is correct
- Ensure you have available API credits

**Button not showing?**
- Click on a tweet/post first to open the reply view
- Refresh the page
- Try both new and old Reddit interfaces

## 📄 License

MIT License

---

Made with ❤️ and AI
