// Gemini SDK for image generation using Nano Banana (gemini-2.5-flash-image)
const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

let geminiApiKey = '';

// Available models for Gemini image generation
// Nano Banana is the image generation and editing model
const MODEL_URLS = {
  "Gemini 2.5 Nano Banana": "gemini-2.5-flash-image-preview",
}

window.MODEL_URLS = MODEL_URLS;

function addAuthHeaders(apiKey) {
  geminiApiKey = apiKey;
}

// Helper function to convert blob to base64
async function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      // Remove data URL prefix to get just the base64 data
      const base64 = reader.result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// Main function to create image generation request
async function createPromptByModelName(name, payload) {
  const modelName = MODEL_URLS[name] || MODEL_URLS["Gemini 2.5 Nano Banana"];
  
  // Build the content parts for the request
  const parts = [];
  
  // Add input image first if provided (for image editing/generation)
  if (payload.input_image) {
    const base64Image = await blobToBase64(payload.input_image);
    parts.push({
      inline_data: {
        mime_type: "image/png",
        data: base64Image
      }
    });
  }
  
  // Add reference images if provided
  if (payload.input_images && payload.input_images.length > 0) {
    for (let i = 0; i < payload.input_images.length; i++) {
      const file = payload.input_images[i];
      const base64Image = await blobToBase64(file);
      parts.push({
        inline_data: {
          mime_type: file.type || "image/png",
          data: base64Image
        }
      });
    }
  }
  
  // Add text prompt
  // Nano Banana uses prompts for image editing and generation
  let promptText = payload.text || "Generate an image";
  
  // If we have an input image, frame it as an editing task
  if (payload.input_image) {
    promptText = `Edit this image: ${promptText}`;
  }
  
  parts.push({
    text: promptText
  });
  
  const requestBody = {
    contents: [{
      parts: parts
    }],
    generationConfig: {
      temperature: 0.9,
      topP: 1.0,
      topK: 32,
      maxOutputTokens: 8192,
      // Specify that we want image output along with text
      responseModalities: ["TEXT", "IMAGE"]
    }
  };
  
  try {
    const url = `${GEMINI_BASE_URL}/models/${modelName}:generateContent`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': geminiApiKey
      },
      body: JSON.stringify(requestBody)
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || `HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    
    // Extract image from response
    const result = parseGeminiResponse(data);
    
    return result;
  } catch (err) {
    console.error('Gemini API error:', err);
    throw err;
  }
}

// Parse Gemini response to extract image data
function parseGeminiResponse(data) {
  // Gemini's generateContent returns text/data in candidates
  if (!data.candidates || data.candidates.length === 0) {
    throw new Error('No response from Gemini API');
  }
  
  const candidate = data.candidates[0];
  const parts = candidate.content?.parts || [];
  
  // Look for inline_data (base64 images) in response
  const images = [];
  const textParts = [];
  
  for (const part of parts) {
    if (part.inline_data) {
      // Convert base64 to data URL
      const mimeType = part.inline_data.mime_type || 'image/png';
      const base64Data = part.inline_data.data;
      const dataUrl = `data:${mimeType};base64,${base64Data}`;
      images.push(dataUrl);
    } else if (part.text) {
      textParts.push(part.text);
    }
  }
  
  // If no images in response, throw an error
  if (images.length === 0) {
    console.warn('No images generated. Text response:', textParts.join(' '));
    throw new Error('No images were generated. The model may have returned text only. Please try a different prompt.');
  }
  
  // Return in format expected by the app (similar to Astria response)
  return {
    id: Date.now(),
    trained_at: new Date().toISOString(),
    images: images,
    user_error: null
  };
}
