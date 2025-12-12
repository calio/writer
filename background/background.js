// Writer AI - Background Service Worker
// Handles LLM API calls and message routing

// Listen for messages from content scripts and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GENERATE_REPLIES') {
    handleGenerateReplies(message.payload)
      .then(sendResponse)
      .catch(error => sendResponse({ error: error.message }));
    return true; // Keep the message channel open for async response
  }
});

// Handle reply generation
async function handleGenerateReplies(payload) {
  const { originalTweet, tone, context, feedback, numCandidates, imageUrls = [], platform = 'twitter' } = payload;
  
  // Get settings
  const settings = await chrome.storage.local.get(['provider', 'apiKey', 'model']);
  
  if (!settings.apiKey) {
    throw new Error('API key not configured. Please set it in the extension settings.');
  }

  const provider = settings.provider || 'anthropic';
  const model = settings.model || (provider === 'anthropic' ? 'claude-sonnet-4-5-20241022' : 'gpt-5.2-2025-12-11');

  // Build the prompt based on platform
  const prompt = buildPrompt(originalTweet, tone, context, feedback, numCandidates, imageUrls.length > 0, platform);

  // Call the appropriate API
  let candidates;
  if (provider === 'anthropic') {
    candidates = await callAnthropicAPI(settings.apiKey, model, prompt, numCandidates, imageUrls, platform);
  } else {
    candidates = await callOpenAIAPI(settings.apiKey, model, prompt, numCandidates, imageUrls, platform);
  }

  return { candidates };
}

// Build the prompt for reply generation
function buildPrompt(originalTweet, tone, context, feedback, numCandidates, hasImages = false, platform = 'twitter') {
  const toneDescriptions = {
    match: 'Match the style and voice of the user\'s previous posts',
    professional: 'Professional, polished, and business-appropriate',
    casual: 'Casual, friendly, and conversational',
    witty: 'Witty, clever, and humorous (but not trying too hard)',
    thoughtful: 'Thoughtful, insightful, and adds value to the conversation'
  };

  const isReddit = platform === 'reddit';
  const platformName = isReddit ? 'Reddit' : 'Twitter/X';
  const contentType = isReddit ? 'post/comment' : 'tweet';
  
  let prompt = `You are a social media writing assistant helping compose ${platformName} replies.

TASK: Generate ${numCandidates} different reply options for the following ${contentType}.

ORIGINAL ${contentType.toUpperCase()} TO REPLY TO:
"${originalTweet || `No specific ${contentType} provided - generate original content`}"
${hasImages ? `\n[This ${contentType} also contains images/media which are provided for context. Consider the visual content in your reply.]` : ''}

TONE: ${toneDescriptions[tone] || toneDescriptions.match}
${context ? `\nUSER'S WRITING STYLE REFERENCE:${context}` : ''}
${feedback ? `\nADDITIONAL INSTRUCTIONS FROM USER: ${feedback}` : ''}

REQUIREMENTS:
${isReddit ? `1. Replies can be longer - Reddit allows detailed responses (aim for 1-4 sentences unless the topic warrants more)
2. Reddit culture values substantive contributions - add value with insights, experiences, or questions` : `1. Each reply MUST be under 280 characters (Twitter's limit)
2. Make replies concise and punchy`}
3. Make replies feel natural and human - avoid obvious AI patterns
4. Each reply should be notably different from the others
5. Match the energy and context of the original ${contentType}
6. Be engaging and encourage conversation when appropriate
${isReddit ? `7. Reddit appreciates wit and clever responses - feel free to be creative
8. Use appropriate formatting for Reddit if helpful (but keep it simple)` : `7. Avoid generic phrases like "Great point!" or "Couldn't agree more!"
8. Don't use hashtags unless specifically relevant
9. Don't use emojis unless the tone calls for it`}
${hasImages ? `${isReddit ? '9' : '10'}. Reference or react to the visual content if relevant` : ''}

OUTPUT FORMAT:
Return ONLY the replies, one per line, numbered 1-${numCandidates}.
Do not include any other text, explanations, or formatting.

Example output format:
1. [First reply option]
2. [Second reply option]
3. [Third reply option]`;

  return prompt;
}

// Call Anthropic API
async function callAnthropicAPI(apiKey, model, prompt, numCandidates, imageUrls = [], platform = 'twitter') {
  // Build content with optional vision support
  const content = [];
  
  // Add images first if provided
  for (const url of imageUrls) {
    // Anthropic requires base64 or URLs with media type
    content.push({
      type: 'image',
      source: {
        type: 'url',
        url: url
      }
    });
  }
  
  // Add text prompt
  content.push({ type: 'text', text: prompt });

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: model,
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: imageUrls.length > 0 ? content : prompt
        }
      ]
    })
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error?.message || `API error: ${response.status}`);
  }

  const data = await response.json();
  const responseContent = data.content?.[0]?.text || '';
  
  return parseReplies(responseContent, numCandidates, platform);
}

// Call OpenAI API
async function callOpenAIAPI(apiKey, model, prompt, numCandidates, imageUrls = [], platform = 'twitter') {
  // Build messages with optional vision support
  const userContent = [];
  
  // Add text prompt
  userContent.push({ type: 'text', text: prompt });
  
  // Add images if provided and model supports vision
  if (imageUrls.length > 0) {
    for (const url of imageUrls) {
      userContent.push({
        type: 'image_url',
        image_url: { url: url }
      });
    }
  }

  const requestBody = {
    model: model,
    messages: [
      {
        role: 'system',
        content: 'You are a helpful assistant that generates Twitter/X replies. Follow the user\'s instructions exactly and return only the numbered replies.'
      },
      {
        role: 'user',
        content: imageUrls.length > 0 ? userContent : prompt
      }
    ],
    temperature: 0.8
  };

  // Use max_completion_tokens for newer models like GPT-5.2
  if (model.includes('5.2') || model.includes('o1') || model.includes('o3')) {
    requestBody.max_completion_tokens = 1024;
  } else {
    requestBody.max_tokens = 1024;
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error?.message || `API error: ${response.status}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '';
  
  return parseReplies(content, numCandidates, platform);
}

// Parse the LLM response into individual replies
function parseReplies(content, numCandidates, platform = 'twitter') {
  const maxLength = platform === 'reddit' ? 10000 : 280; // Reddit has no real limit, Twitter is 280
  const lines = content.trim().split('\n');
  const replies = [];
  let currentReply = '';
  let currentNumber = 0;

  for (const line of lines) {
    // Match lines that start with a number followed by period/parenthesis
    const match = line.match(/^(\d+)[\.\)]\s*(.*)$/);
    if (match) {
      // Save previous reply if exists
      if (currentReply && currentReply.length <= maxLength) {
        replies.push(currentReply.trim());
      }
      currentNumber = parseInt(match[1]);
      currentReply = match[2] || '';
    } else if (currentNumber > 0 && line.trim()) {
      // Continue multi-line reply (common for Reddit)
      currentReply += '\n' + line;
    }
  }
  
  // Don't forget the last reply
  if (currentReply && currentReply.length <= maxLength) {
    replies.push(currentReply.trim());
  }

  // Clean up replies - remove surrounding quotes
  const cleanedReplies = replies.map(r => r.replace(/^["']|["']$/g, '').trim()).filter(r => r);

  // If parsing failed, try to split by double newlines or just return as-is
  if (cleanedReplies.length === 0) {
    const fallbackReplies = content
      .split(/\n\n+/)
      .map(r => r.replace(/^\d+[\.\)]\s*/, '').trim())
      .filter(r => r && r.length <= maxLength);
    
    return fallbackReplies.slice(0, numCandidates);
  }

  return cleanedReplies.slice(0, numCandidates);
}

// Keep service worker alive
chrome.runtime.onInstalled.addListener(() => {
  console.log('Writer AI installed');
});

