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
  const { originalTweet, tone, context, feedback, numCandidates, imageUrls = [], platform = 'twitter', conversationContext = '' } = payload;
  
  // Get settings including user profile and documents
  const settings = await chrome.storage.local.get(['provider', 'apiKey', 'model', 'userProfile', 'uploadedDocuments']);
  
  if (!settings.apiKey) {
    throw new Error('API key not configured. Please set it in the extension settings.');
  }

  const provider = settings.provider || 'openai';
  const model = settings.model || (provider === 'openai' ? 'gpt-5.2-2025-12-11' : 'claude-sonnet-4-5-20241022');

  // Build user profile context
  const userProfileContext = settings.userProfile ? settings.userProfile : '';
  
  // Build document context (limit to prevent token overflow)
  let documentContext = '';
  if (settings.uploadedDocuments && settings.uploadedDocuments.length > 0) {
    const maxDocChars = 8000; // Limit document context
    let totalChars = 0;
    const docSnippets = [];
    
    for (const doc of settings.uploadedDocuments) {
      if (totalChars >= maxDocChars) break;
      const remaining = maxDocChars - totalChars;
      const snippet = doc.content.substring(0, remaining);
      docSnippets.push(`[From ${doc.name}]:\n${snippet}`);
      totalChars += snippet.length;
    }
    
    if (docSnippets.length > 0) {
      documentContext = docSnippets.join('\n\n---\n\n');
    }
  }

  // Build the prompt based on platform with profile, documents, and conversation context
  const prompt = buildPrompt(originalTweet, tone, context, feedback, numCandidates, imageUrls.length > 0, platform, userProfileContext, documentContext, conversationContext);

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
function buildPrompt(originalTweet, tone, context, feedback, numCandidates, hasImages = false, platform = 'twitter', userProfile = '', documentContext = '', conversationContext = '') {
  const toneDescriptions = {
    match: 'Match the style and voice based on the user\'s profile description',
    professional: 'Professional, polished, and business-appropriate',
    casual: 'Casual, friendly, and conversational',
    witty: 'Witty, clever, and humorous (but not trying too hard)',
    thoughtful: 'Thoughtful, insightful, and adds value to the conversation'
  };

  const isReddit = platform === 'reddit';
  const platformName = isReddit ? 'Reddit' : 'Twitter/X';
  const contentType = isReddit ? 'post/comment' : 'tweet';
  
  // Check if this is a refinement (has conversation context)
  const isRefinement = conversationContext && conversationContext.trim().length > 0;
  
  let prompt = `You are a social media writing assistant helping compose ${platformName} replies.
${userProfile ? `
USER PROFILE/PERSONA:
${userProfile}

IMPORTANT: Write all replies as if you ARE this person. Embody their voice, perspective, expertise, and communication style.
` : ''}
${documentContext ? `
REFERENCE DOCUMENTS (use this knowledge to inform your replies):
${documentContext}
` : ''}

TASK: ${isRefinement ? 'Refine the reply options based on the user\'s specific feedback.' : `Generate ${numCandidates} different reply options for the following ${contentType}.`}

CRITICAL INSTRUCTION:
${feedback ? `The user has provided specific instructions: "${feedback}"
You MUST prioritize this instruction above all else. If the instruction asks for a specific topic (e.g., "write about birds"), make the reply about that topic, even if it diverges from the original post's main theme. The reply should still make sense as a response, but fully embrace the user's direction.` : 'Generate high-quality replies that add value to the conversation.'}

ORIGINAL ${contentType.toUpperCase()} TO REPLY TO:
"${originalTweet || `No specific ${contentType} provided - generate original content`}"
${hasImages ? `\n[This ${contentType} also contains images/media which are provided for context. Consider the visual content in your reply.]` : ''}

TONE: ${toneDescriptions[tone] || toneDescriptions.match}
${context ? `\nUSER'S WRITING STYLE REFERENCE:${context}` : ''}
${conversationContext ? `\nPREVIOUS CONVERSATION CONTEXT:\n${conversationContext}` : ''}

REQUIREMENTS:
${isReddit ? `1. Replies can be longer - Reddit allows detailed responses (aim for 1-4 sentences unless the topic warrants more)
2. Reddit culture values substantive contributions - add value with insights, experiences, or questions` : `1. Each reply MUST be under 280 characters (Twitter's limit)
2. Make replies concise and punchy`}
3. Make replies feel natural and human - avoid obvious AI patterns
4. Each reply should be notably different from the others
5. Match the energy and context of the original ${contentType} (unless the user's instruction directs otherwise)
6. Be engaging and encourage conversation when appropriate
${userProfile ? `7. CRITICAL: Stay true to the user's persona/profile described above` : ''}
${isRefinement ? `${userProfile ? '8' : '7'}. IMPORTANT: Incorporate the user's feedback/refinement request while maintaining quality` : ''}
${isReddit ? `${userProfile ? (isRefinement ? '9' : '8') : (isRefinement ? '8' : '7')}. Reddit appreciates wit and clever responses - feel free to be creative
${userProfile ? (isRefinement ? '10' : '9') : (isRefinement ? '9' : '8')}. Use appropriate formatting for Reddit if helpful (but keep it simple)` : `${userProfile ? (isRefinement ? '9' : '8') : (isRefinement ? '8' : '7')}. Avoid generic phrases like "Great point!" or "Couldn't agree more!"
${userProfile ? (isRefinement ? '10' : '9') : (isRefinement ? '9' : '8')}. Don't use hashtags unless specifically relevant
${userProfile ? (isRefinement ? '11' : '10') : (isRefinement ? '10' : '9')}. Don't use emojis unless the tone calls for it`}
${hasImages ? `\n- Reference or react to the visual content if relevant` : ''}
${documentContext ? `\nNOTE: If relevant to the topic, you may draw on knowledge from the reference documents provided.` : ''}

OUTPUT FORMAT:
Return ONLY ${numCandidates} refined/improved replies, one per line, numbered 1-${numCandidates}.
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
        content: 'You are a social media writing expert. Your PRIMARY goal is to follow the user\'s specific instructions for the reply. If the user provides a topic or direction, prioritize that over the original post\'s context while still making it a coherent reply.'
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

