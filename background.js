chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "SUMMARIZE_SECTION") {
    summarizeWithOllama(message.payload)
      .then(summary => {
        sendResponse({ success: true, summary });
      })
      .catch(err => {
        sendResponse({ success: false, error: err.message });
      });

    return true; // IMPORTANT: async response
  }
});

async function summarizeWithOllama(text) {
  const prompt = `
You are summarizing a section from a webpage.

CONTENT:
${text}

RULES:
- Be factual
- 3–4 sentences max
- Use ONLY provided content
`;

  const res = await fetch("http://localhost:11434/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "mistral",
      prompt,
      stream: false
    })
  });

  if (!res.ok) {
    throw new Error("Ollama request failed");
  }

  const data = await res.json();
  return data.response.trim();
}
