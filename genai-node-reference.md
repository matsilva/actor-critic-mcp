# Google Generative AI Node.js SDK (@google/genai) Reference

The Google Generative AI SDK for Node.js (`@google/genai`) provides a convenient way to integrate Google's powerful generative AI models (like Gemini) into your JavaScript or TypeScript applications. This SDK offers a unified interface for accessing these models via the Gemini API and Vertex AI.

**Current Date:** Thursday, May 22, 2025

## 1. Installation

Install the SDK using npm:

```bash
npm install @google/genai

Or using yarn:

yarn add @google/genai
2. Prerequisites

    Node.js: Version 18 or later is recommended.
    API Key or Vertex AI Setup:

    For the Gemini API (Google AI Studio): You'll need an API key. You can obtain one from Google AI Studio.
    For Vertex AI: You'll need a Google Cloud Project with the Vertex AI API enabled and appropriate authentication set up.

3. Initialization
3.1. Using an API Key (Gemini API / Google AI Studio)

This is the simplest way to get started, especially for prototyping.

import { GoogleGenerativeAI } from "@google/genai";

// Ensure your API key is stored securely, e.g., in an environment variable
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
 throw new Error("GEMINI_API_KEY environment variable not set.");
}

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// To specify an API version (e.g., v1beta)
// const genAI = new GoogleGenerativeAI(GEMINI_API_KEY, { apiVersion: 'v1beta' });

Security Warning: Avoid embedding API keys directly in client-side JavaScript. For production applications, it's highly recommended to call the API from a server-side environment where the API key can be kept secure.
3.2. Using Vertex AI

For enterprise-ready applications and more advanced Google Cloud integrations, use the Vertex AI setup.

import { GoogleGenerativeAI } from "@google/genai";

// Ensure your Google Cloud Project ID and Location are set, e.g., via environment variables
const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT_ID;
const LOCATION = process.env.GOOGLE_CLOUD_LOCATION; // e.g., 'us-central1'

if (!PROJECT_ID || !LOCATION) {
 throw new Error("GOOGLE_CLOUD_PROJECT_ID or GOOGLE_CLOUD_LOCATION environment variable not set.");
}

const genAI = new GoogleGenerativeAI({
 project: PROJECT_ID,
 location: LOCATION,
 // Optionally, specify an API version
 // apiVersion: 'v1',
});

Authentication for Vertex AI typically relies on Application Default Credentials (ADC). Ensure your environment is set up correctly (e.g., by running gcloud auth application-default login).
3.3 API Version Selection

By default, the SDK might use beta API endpoints. You can specify a stable API version (e.g., v1) or a specific preview version during GoogleGenerativeAI instantiation if needed:

// For Gemini API
// const genAI = new GoogleGenerativeAI(GEMINI_API_KEY, { apiVersion: 'v1beta' });

// For Vertex AI
// const genAI = new GoogleGenerativeAI({
//   project: PROJECT_ID,
//   location: LOCATION,
//   apiVersion: 'v1'
// });
4. Core Concepts and Classes
4.1. GoogleGenerativeAI

This is the main entry point class. You instantiate it with your API key or Vertex AI configuration. It provides access to various submodules for different functionalities.

Key submodules often accessed via an instance (e.g., ai = new GoogleGenerativeAI(...)):

    ai.models: For accessing and using generative models (e.g., generateContent, generateImages).
    ai.chats: For creating and managing stateful chat objects for multi-turn conversations.
    ai.files: For uploading and managing files that can be referenced in prompts (useful for large files or repeated use).
    ai.caches: For creating and managing caches to reduce costs for repeated large prompt prefixes.
    ai.live: For real-time interactions, potentially involving audio/video inputs and text/audio outputs.

4.2. GenerativeModel

Represents a specific generative model (e.g., "gemini-1.5-flash"). You get an instance of this class from GoogleGenerativeAI.

const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
// Or for a specific version, e.g., if using Vertex AI model versioning:
// const model = genAI.getGenerativeModel({ model: "projects/my-project/locations/us-central1/publishers/google/models/gemini-1.5-flash-001" });
5. Key Operations
5.1. Generating Content (Single-Turn)

For simple prompt-response interactions.

async function runTextGeneration() {
 try {
   const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
   const prompt = "Write a short story about a curious robot exploring a futuristic city.";

   const result = await model.generateContent(prompt);
   const response = result.response;
   const text = response.text();
   console.log(text);
 } catch (error) {
   console.error("Error generating content:", error);
 }
}

runTextGeneration();
5.2. Streaming Content

For receiving responses chunk by chunk, useful for long generations or real-time feedback.

async function runStreamingTextGeneration() {
 try {
   const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
   const prompt = "Explain the concept of quantum entanglement in simple terms.";

   const result = await model.generateContentStream(prompt);

   let text = '';
   for await (const chunk of result.stream) {
     const chunkText = chunk.text();
     console.log(chunkText);
     text += chunkText;
   }
   // console.log("\nFull response:\n", text);
 } catch (error) {
   console.error("Error streaming content:", error);
 }
}

runStreamingTextGeneration();
5.3. Multimodal Prompts

Gemini models can process multiple types of input (text, images, etc.). You provide parts with different data types.

Note: For image data, you typically provide it as a base64 encoded string or a Google Cloud Storage URI. The SDK handles the structuring.

import fs from "fs"; // For Node.js file system access

// Function to convert image to base64 (example)
function fileToGenerativePart(path, mimeType) {
 return {
   inlineData: {
     data: Buffer.from(fs.readFileSync(path)).toString("base64"),
     mimeType
   },
 };
}

async function runMultimodalPrompt() {
 try {
   const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" }); // Or a vision-capable model

   const promptParts = [
     fileToGenerativePart("path/to/your/image.jpg", "image/jpeg"),
     {text: "What is in this image?"},
   ];

   const result = await model.generateContent({ contents: [{ role: "user", parts: promptParts }] });
   const response = result.response;
   const text = response.text();
   console.log(text);
 } catch (error) {
   console.error("Error with multimodal prompt:", error);
   // Check if the error is due to content policy
   if (error.response && error.response.promptFeedback) {
     console.error("Prompt Feedback:", error.response.promptFeedback);
   }
 }
}

// runMultimodalPrompt(); // Uncomment and provide a valid image path to run

When providing contents directly, it should be an array of Content objects. Each Content object has a role (user, model, or function) and parts (an array of Part objects). A Part can be {text: "..."}, {inlineData: {...}}, or {functionCall: {...}}, etc.
5.4. Chat (Multi-turn Conversations)

For maintaining conversation history and context.

async function runChat() {
 try {
   const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
   const chat = model.startChat({
     history: [
       {
         role: "user",
         parts: [{ text: "Hello, I'm planning a trip." }],
       },
       {
         role: "model",
         parts: [{ text: "Great! Where are you thinking of going?" }],
       },
     ],
     // generationConfig can also be set here
   });

   const msg1 = "I want to visit a place with beautiful beaches and good food.";
   console.log("User:", msg1);
   const result1 = await chat.sendMessage(msg1);
   const response1 = result1.response;
   console.log("Model:", response1.text());

   const msg2 = "What are some recommendations for Southeast Asia?";
   console.log("User:", msg2);
   const result2 = await chat.sendMessage(msg2); // History is automatically managed
   const response2 = result2.response;
   console.log("Model:", response2.text());

   // Streaming chat messages
   const msg3 = "Tell me more about Thai beaches.";
   console.log("User:", msg3);
   const result3 = await chat.sendMessageStream(msg3);
   let streamedText = "Model (streaming): ";
   for await (const chunk of result3.stream) {
       streamedText += chunk.text();
       process.stdout.write(chunk.text()); // Output chunks as they arrive
   }
   console.log("\n--- End of streamed message ---");


 } catch (error) {
   console.error("Error in chat session:", error);
 }
}

runChat();
5.5. Function Calling

Allows the model to request calls to external functions/tools you define.

    Define your functions: Specify name, description, and parameters.
    Provide tools to the model: Include function declarations in your request.
    Handle function calls: If the model returns a functionCall part, execute your function.
    Send back results: Return the function's output to the model to continue generation.

import { GoogleGenerativeAI, FunctionDeclarationSchemaType } from "@google/genai";

// ... (genAI initialization) ...

async function runFunctionCalling() {
 try {
   const model = genAI.getGenerativeModel({
     model: "gemini-1.5-flash", // Ensure model supports function calling
     tools: [{
       functionDeclarations: [
         {
           name: "findWeather",
           description: "Get the current weather in a given location",
           parameters: {
             type: FunctionDeclarationSchemaType.OBJECT,
             properties: {
               location: { type: FunctionDeclarationSchemaType.STRING, description: "The city and state, e.g. San Francisco, CA" },
               unit: { type: FunctionDeclarationSchemaType.STRING, enum: ["celsius", "fahrenheit"], description: "Temperature unit" }
             },
             required: ["location"]
           }
         }
       ]
     }]
   });

   const chat = model.startChat();
   const prompt = "What's the weather like in London in celsius?";
   console.log("User:", prompt);

   const result = await chat.sendMessage(prompt);
   let response = result.response;

   if (response.candidates && response.candidates[0].content.parts[0].functionCall) {
     const functionCall = response.candidates[0].content.parts[0].functionCall;
     console.log("Model requests function call:", functionCall.name, "with args:", functionCall.args);

     if (functionCall.name === "findWeather") {
       const { location, unit } = functionCall.args;
       // --- Pretend to call an actual weather API here ---
       const weatherAPIResponse = {
         weather: `The weather in ${location} is currently sunny and 22° ${unit || 'celsius'}.`
       };
       // --- End of pretend API call ---

       // Send the function response back to the model
       const functionResponseResult = await chat.sendMessage([
         {
           functionResponse: {
             name: "findWeather",
             response: {
               // The actual content of the response part should match what the model expects
               // For this example, we'll assume it expects an object with a 'weather' field.
               // However, the API expects the 'response' field within 'functionResponse'
               // to be an object that can contain any JSON structure.
               // The actual content part sent back to the model would be structured like:
               // { role: "function", parts: [{ functionResponse: { name: "findWeather", response: { weather: "..." } } }] }
               // The SDK's chat.sendMessage handles this structuring if you pass the correct object.
               name: "findWeather", // Name of the function that was called
               content: weatherAPIResponse, // The result from your function
             }
           }
         }
       ]);
       response = functionResponseResult.response;
       console.log("Model (after function call):", response.text());
     }
   } else {
     console.log("Model:", response.text());
   }

 } catch (error) {
   console.error("Error in function calling:", error);
 }
}

// runFunctionCalling();

Note: The exact structure for sending function responses can be nuanced. Refer to the latest official examples for precise formatting.
5.6. Counting Tokens

You can count tokens for a given prompt to understand potential costs or stay within model limits.

async function countTokensExample() {
 try {
   const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
   const prompt = "How many tokens are in this sentence?";
   
   const { totalTokens } = await model.countTokens(prompt);
   console.log("Total tokens:", totalTokens);

   const chat = model.startChat({
       history: [
           { role: "user", parts: [{ text: "Hello" }] },
           { role: "model", parts: [{ text: "Hi there!" }] }
       ]
   });
   const { totalTokens: chatTokens } = await chat.countTokens("How are you?");
   console.log("Tokens for next chat message (including history):", chatTokens);

 } catch (error) {
   console.error("Error counting tokens:", error);
 }
}

// countTokensExample();
6. Configuration
6.1. generationConfig

Control the model's output generation. This can be set when getting the model or per request.

const generationConfig = {
 temperature: 0.9,         // Controls randomness. Lower for more deterministic, higher for more creative.
 topK: 1,                  // Consider the K most likely tokens.
 topP: 1,                  // Consider tokens with cumulative probability P.
 maxOutputTokens: 2048,    // Maximum number of tokens to generate.
 stopSequences: ["STOP!"], // Sequences that will stop generation.
};

// Apply when getting the model:
// const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash", generationConfig });

// Or apply per request:
// const result = await model.generateContent({
//   contents: [{ role: "user", parts: [{text: prompt}]}],
//   generationConfig: generationConfig
// });
6.2. safetySettings

Configure thresholds for blocking harmful content.

import { HarmCategory, HarmBlockThreshold } from "@google/genai";

const safetySettings = [
 {
   category: HarmCategory.HARM_CATEGORY_HARASSMENT,
   threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
 },
 {
   category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
   threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
 },
 // Add other categories as needed
];

// Apply when getting the model:
// const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash", safetySettings });

// Or apply per request:
// const result = await model.generateContent({
//   contents: [{ role: "user", parts: [{text: prompt}]}],
//   safetySettings: safetySettings
// });

If content is blocked, the response will indicate this in the promptFeedback or finishReason.
6.3. System Instructions

Provide high-level instructions to guide the model's behavior, persona, or output format throughout a session.

const model = genAI.getGenerativeModel({
 model: "gemini-1.5-flash",
 systemInstruction: "You are a helpful assistant that speaks like a friendly pirate. You love to say 'Ahoy!'",
});

async function runWithSystemInstruction() {
 const result = await model.generateContent("Tell me a joke.");
 console.log(result.response.text());
}
// runWithSystemInstruction();

System instructions can also be set when starting a chat session.
7. Error Handling

Always wrap API calls in try...catch blocks to handle potential errors, including network issues, API errors, or content policy violations.

try {
 // Your SDK call
} catch (error) {
 console.error("An error occurred:", error.message);
 if (error.response) {
   console.error("API Response Error Details:", error.response);
   if (error.response.promptFeedback) {
     console.error("Prompt Feedback (Safety):", error.response.promptFeedback);
   }
 }
 // Handle specific error types if needed
}
8. Model Naming

Common models include:

    gemini-1.5-flash (optimized for speed and cost)
    gemini-1.5-pro (balanced performance for various tasks)
    gemini-1.0-pro (older version)
    embedding-001 (for generating text embeddings) - Note: For embeddings, you might use model.embedContent().

Check the official Google AI documentation for the latest list of available models and their capabilities. If using Vertex AI, model names might be more specific, including project and location paths.
9. File API (ai.files)

The File API allows you to upload files (PDFs, images, audio, video) that can then be referenced in your prompts. This is useful for:

    Processing files larger than what can be sent inline in a request.
    Reusing the same file across multiple prompts without re-uploading.

// Conceptual example - check official docs for precise usage
async function uploadAndUseFile() {
 const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY); // Or Vertex AI setup
 
 // 1. Upload a file
 // const filePath = "path/to/your/document.pdf";
 // const file = await genAI.files.uploadFile(filePath, {
 //   mimeType: "application/pdf",
 //   displayName: "My Document"
 // });
 // console.log(`Uploaded file: ${file.name} (URI: ${file.uri})`);

 // 2. Use the file in a prompt (example with a hypothetical file URI)
 // const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" }); // A model that can process the file type
 // const result = await model.generateContent([
 //   { text: "Summarize this document:" },
 //   { fileData: { mimeType: "application/pdf", fileUri: file.uri } } // Use the URI from uploaded file
 // ]);
 // console.log(result.response.text());

 // 3. (Optional) Delete the file when no longer needed
 // await genAI.files.deleteFile(file.name);
 // console.log(`Deleted file: ${file.name}`);
}

The exact methods and parameters for the File API should be verified against the latest @google/genai SDK documentation.
10. Further Information

For the most up-to-date and detailed information, always refer to the official Google AI documentation and the @google/genai SDK reference on GitHub or npm.

    Google AI for Developers: https://ai.google.dev/
    Vertex AI Documentation: https://cloud.google.com/vertex-ai/docs/generative-ai
    SDK Repository (typically on GitHub googleapis)

This reference provides a foundational overview. The SDK is actively developed, so new features and refinements may be introduced.
