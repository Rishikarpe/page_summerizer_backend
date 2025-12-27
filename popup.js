const summaryOut = document.getElementById("summary-output");
const summaryStatus = document.getElementById("summary-status");
const reloadBtn = document.getElementById("reload-summary-btn");

const chat = document.getElementById("chat-history");
const input = document.getElementById("question-input");
const askBtn = document.getElementById("ask-btn");

let currentUrl = null;
let pollingTimer = null;

/* ======================
   SUMMARY (WITH POLLING)
====================== */

async function loadSummary() {
  summaryStatus.textContent = "Loading summary…";
  summaryOut.classList.add("hidden");

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  chrome.tabs.sendMessage(tab.id, { type: "REQUEST_PAGE_SUMMARY" }, res => {
    if (!res || !res.extractSuccess) {
      summaryStatus.textContent = "No readable content found.";
      stopPolling();
      return;
    }

    if (res.ready && res.summary) {
      summaryOut.textContent = res.summary;
      summaryOut.classList.remove("hidden");
      summaryStatus.textContent = "Summary ready";
      currentUrl = res.url;
      stopPolling();
      return;
    }

    summaryStatus.textContent = "Processing page…";
    startPolling();
  });
}

function startPolling() {
  if (!pollingTimer) {
    pollingTimer = setInterval(loadSummary, 700);
  }
}

function stopPolling() {
  if (pollingTimer) {
    clearInterval(pollingTimer);
    pollingTimer = null;
  }
}

/* ======================
   FORCE RELOAD SUMMARY
====================== */

async function reloadSummary() {
  stopPolling();

  summaryStatus.textContent = "Rebuilding summary…";
  summaryOut.classList.add("hidden");

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  chrome.tabs.sendMessage(tab.id, { type: "FORCE_RELOAD_SUMMARY" }, () => {
    setTimeout(loadSummary, 300);
  });
}

/* ======================
   CHAT HISTORY
====================== */

async function loadChatHistory() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  chrome.tabs.sendMessage(tab.id, { type: "GET_CHAT_HISTORY" }, res => {
    if (!res || !Array.isArray(res.history)) return;

    chat.innerHTML = "";
    res.history.forEach(msg => {
      addMessage(msg.role, msg.text);
    });
  });
}

/* ======================
   CHAT / ASK
====================== */

function addMessage(role, text) {
  const div = document.createElement("div");
  div.className = `message ${role}`;
  div.textContent = text;

  // ⚠️ Warning styling
  if (text.startsWith("⚠️")) {
    div.style.background = "#fff3cd";
    div.style.border = "1px solid #ffecb5";
    div.style.cursor = "default";
  }

  // 🔥 Click-to-highlight answers
  if (role === "answer" && !text.startsWith("⚠️")) {
    div.style.cursor = "pointer";
    div.title = "Click to highlight relevant parts on the page";

    div.onclick = async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      chrome.tabs.sendMessage(tab.id, {
        type: "HIGHLIGHT_SOURCE",
        text
      });
    };
  }

  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
}

async function askQuestion() {
  const q = input.value.trim();
  if (!q || !currentUrl) return;

  addMessage("question", q);
  input.value = "";
  askBtn.disabled = true;
  askBtn.textContent = "Thinking…";

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  // Save question to page-level history
  chrome.tabs.sendMessage(tab.id, {
    type: "ADD_CHAT_MESSAGE",
    message: { role: "question", text: q }
  });

  const prompt = `
Answer ONLY using the article.
Be concise and factual.

Question:
${q}
`;

  try {
    const res = await fetch("http://127.0.0.1:8000/summarize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: prompt,
        url: currentUrl,
        top_k: 16
      })
    });

    const data = await res.json();
    const answer = data.summary || "No answer found.";

    addMessage("answer", answer);

    // Save answer to page-level history
    chrome.tabs.sendMessage(tab.id, {
      type: "ADD_CHAT_MESSAGE",
      message: { role: "answer", text: answer }
    });

  } catch (err) {
    addMessage("answer", "Error: " + err.message);
  } finally {
    askBtn.disabled = false;
    askBtn.textContent = "Ask";
  }
}

/* ======================
   INIT
====================== */

askBtn.onclick = askQuestion;
reloadBtn.onclick = reloadSummary;

input.onkeydown = e => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    askQuestion();
  }
};

// Initial load
loadSummary();
startPolling();
loadChatHistory();

/* ======================
   RUNTIME MESSAGES
====================== */

chrome.runtime.onMessage.addListener(msg => {
  if (msg.type === "SEMANTIC_HIGHLIGHT_ERROR") {
    addMessage("answer", msg.message);
  }
});
