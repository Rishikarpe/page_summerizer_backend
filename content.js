// ================================
// Full Page Extractor + Embed + Auto-Summarize + Chat History + SEMANTIC HIGHLIGHT
// ================================

(function () {
  console.log("🚀 Full Extractor content script loaded");

  if (window.__FULL_EXTRACTOR_RUNNING__) return;
  window.__FULL_EXTRACTOR_RUNNING__ = true;

  let PAGE_EXTRACT_DATA = null;
  let PAGE_SUMMARY = null;
  let PAGE_CHAT_HISTORY = [];
  let SUMMARY_IN_PROGRESS = false;

  /* -------------------- HELPERS -------------------- */

  function isVisible(el) {
    if (!el) return false;
    const s = window.getComputedStyle(el);
    return (
      s.display !== "none" &&
      s.visibility !== "hidden" &&
      s.opacity !== "0" &&
      el.offsetHeight > 0
    );
  }

  function normalize(text) {
    return (text || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function tokenize(text) {
    return normalize(text)
      .split(" ")
      .filter(w => w.length > 3);
  }

  function overlapScore(a, b) {
    const A = new Set(a);
    const B = new Set(b);
    let score = 0;
    A.forEach(w => B.has(w) && score++);
    return score;
  }

  /* -------------------- EXTRACTION -------------------- */

  function extractPage() {
    const elements = document.querySelectorAll(
      "h1,h2,h3,p,li,blockquote,article,section"
    );

    const sections = [];
    let current = null;
    let hasContent = false;

    elements.forEach(el => {
      if (!isVisible(el)) return;

      const text = el.innerText?.trim();
      if (!text || text.length < 40) return;

      hasContent = true;

      if (/^h[1-3]$/i.test(el.tagName)) {
        current = { heading: text, blocks: [] };
        sections.push(current);
      } else {
        if (!current) {
          current = { heading: "Introduction", blocks: [] };
          sections.push(current);
        }
        current.blocks.push({ text });
      }
    });

    return {
      url: location.href,
      title: document.title,
      sections,
      extractSuccess: hasContent
    };
  }

  /* -------------------- SUMMARY PIPELINE -------------------- */

  async function runSummaryPipeline() {
    if (SUMMARY_IN_PROGRESS) return;
    SUMMARY_IN_PROGRESS = true;

    PAGE_SUMMARY = null;

    PAGE_EXTRACT_DATA = extractPage();
    window.__PAGE_EXTRACT_DATA__ = PAGE_EXTRACT_DATA;

    if (!PAGE_EXTRACT_DATA.extractSuccess) {
      console.warn("⚠️ No readable content found");
      PAGE_SUMMARY = "No readable content found.";
      SUMMARY_IN_PROGRESS = false;
      return;
    }

    const chunks = PAGE_EXTRACT_DATA.sections.flatMap(section =>
      section.blocks.map(block => ({
        id: crypto.randomUUID(),
        text: block.text,
        section: section.heading,
        selector: null,
        url: PAGE_EXTRACT_DATA.url
      }))
    );

    try {
      await fetch("http://127.0.0.1:8000/embed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(chunks)
      });

      const res = await fetch("http://127.0.0.1:8000/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query:
            "Summarize the article by explaining the problem, main claim, key idea, why it works, results, why it matters, and the author’s conclusion.",
          url: PAGE_EXTRACT_DATA.url,
          top_k: 15
        })
      });

      const data = await res.json();
      PAGE_SUMMARY = data.summary || "No summary generated.";
      console.log("📝 SUMMARY READY");

    } catch (err) {
      console.error("❌ Summary pipeline failed:", err);
      PAGE_SUMMARY = "Summary failed.";
    } finally {
      SUMMARY_IN_PROGRESS = false;
    }
  }

  // Initial auto-run
  runSummaryPipeline();

  /* -------------------- HIGHLIGHT STYLES -------------------- */

  if (!document.getElementById("semantic-highlight-style")) {
    const style = document.createElement("style");
    style.id = "semantic-highlight-style";
    style.textContent = `
      .semantic-highlight {
        background: #ffeb3b !important;
        box-shadow: 0 0 28px rgba(255,193,7,0.9);
        border-radius: 6px;
        padding: 4px;
        animation: semanticGlow 1.5s infinite alternate;
      }
      @keyframes semanticGlow {
        from { box-shadow: 0 0 16px rgba(255,193,7,0.6); }
        to { box-shadow: 0 0 36px rgba(255,235,59,1); }
      }
    `;
    document.head.appendChild(style);
  }

  /* -------------------- SEMANTIC HIGHLIGHT CORE -------------------- */

  function semanticHighlight(answerText) {
    if (!answerText) return;

    const answerTokens = tokenize(answerText);

    document
      .querySelectorAll(".semantic-highlight")
      .forEach(el => el.classList.remove("semantic-highlight"));

    const candidates = [...document.querySelectorAll("p,li,blockquote,span")]
      .filter(isVisible)
      .map(el => ({
        el,
        score: overlapScore(answerTokens, tokenize(el.innerText))
      }))
      .filter(x => x.score >= 3)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    if (!candidates.length) {
      console.warn("⚠️ No semantic highlight matches found");

      chrome.runtime.sendMessage({
        type: "SEMANTIC_HIGHLIGHT_ERROR",
        message: "⚠️ No semantic highlight matches found"
      });

      return;
    }

    candidates.forEach(({ el }, i) => {
      el.classList.add("semantic-highlight");
      if (i === 0) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    });

    setTimeout(() => {
      candidates.forEach(({ el }) =>
        el.classList.remove("semantic-highlight")
      );
    }, 9000);
  }

  /* -------------------- MESSAGE BRIDGE -------------------- */

  chrome.runtime.onMessage.addListener((msg, _, sendResponse) => {

    if (msg.type === "REQUEST_PAGE_SUMMARY") {
      sendResponse({
        summary: PAGE_SUMMARY,
        ready: !!PAGE_SUMMARY && !SUMMARY_IN_PROGRESS,
        url: PAGE_EXTRACT_DATA?.url,
        extractSuccess: PAGE_EXTRACT_DATA?.extractSuccess
      });
      return true;
    }

    if (msg.type === "FORCE_RELOAD_SUMMARY") {
      runSummaryPipeline();
      sendResponse({ success: true });
      return true;
    }

    if (msg.type === "GET_CHAT_HISTORY") {
      sendResponse({ history: PAGE_CHAT_HISTORY });
      return true;
    }

    if (msg.type === "ADD_CHAT_MESSAGE") {
      PAGE_CHAT_HISTORY.push(msg.message);
      sendResponse({ success: true });
      return true;
    }

    if (msg.type === "CLEAR_CHAT_HISTORY") {
      PAGE_CHAT_HISTORY = [];
      sendResponse({ success: true });
      return true;
    }

    if (msg.type === "HIGHLIGHT_SOURCE") {
      semanticHighlight(msg.text || "");
      sendResponse({ success: true });
      return true;
    }

    return false;
  });

})();
