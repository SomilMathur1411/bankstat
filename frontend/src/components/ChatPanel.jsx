import React, { useEffect, useRef, useState } from "react";
import { sendChatMessage } from "../api.js";

const SUGGESTIONS = [
  "What's my total spend?",
  "Do I have a recurring salary?",
  "What are my top categories?",
  "Any unusual transactions?",
];

// Turns **bold** segments into <strong> tags. Deliberately minimal — we only
// need to support what the assistant is instructed to produce (bold + plain
// text), not full markdown.
function renderInline(text, keyPrefix) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter((p) => p !== "");
  return parts.map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={`${keyPrefix}-b-${i}`}>{part.slice(2, -2)}</strong>
    ) : (
      <React.Fragment key={`${keyPrefix}-t-${i}`}>{part}</React.Fragment>
    )
  );
}

// Renders a chat message as paragraphs + bullet lists instead of one flat
// blob of text with literal "**" and "-" characters. Bullet lines starting
// with "- " or "* " are grouped into a <ul>; everything else becomes a <p>.
function renderMessageBody(text) {
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const blocks = [];
  let bulletBuffer = [];

  const flushBullets = () => {
    if (!bulletBuffer.length) return;
    blocks.push(
      <ul className="chat-bullet-list" key={`ul-${blocks.length}`}>
        {bulletBuffer.map((line, i) => (
          <li key={i}>{renderInline(line.replace(/^[-*]\s+/, ""), `li-${blocks.length}-${i}`)}</li>
        ))}
      </ul>
    );
    bulletBuffer = [];
  };

  lines.forEach((line) => {
    if (/^[-*]\s+/.test(line)) {
      bulletBuffer.push(line);
    } else {
      flushBullets();
      blocks.push(<p key={`p-${blocks.length}`}>{renderInline(line, `p-${blocks.length}`)}</p>);
    }
  });
  flushBullets();

  return blocks;
}

function BotIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="4" y="7" width="16" height="12" rx="4" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 7V4M9 4h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="9" cy="13" r="1.4" fill="currentColor" />
      <circle cx="15" cy="13" r="1.4" fill="currentColor" />
      <path d="M9 16.5c1 .8 5 .8 6 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function ExpandIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M9 4H4v5M15 20h5v-5M4 20l6-6M20 4l-6 6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CollapseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M4 9h5V4M20 15h-5v5M9 9 3 3M15 15l6 6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M4 12l16-7-6 16-2.5-6.5L4 12z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Chat assistant UI. Renders either as a floating widget (variant="floating")
 * or as a full-page tab (variant="full"). Both share the same conversation
 * state, which is lifted to App so switching between the two never loses
 * the chat history.
 *
 * - "expand" (floating -> full) lets the user read/write in a much roomier
 *   view instead of squinting at a small popup.
 * - The same switch works the other way as a proper "AI tab": App renders
 *   this in variant="full" as its own top-level view, reachable via the tab
 *   bar, not just via the expand button.
 */
export default function ChatPanel({
  analysis,
  open,
  onClose,
  variant = "floating",
  onExpand,
  onCollapse,
  messages,
  setMessages,
  autoPrompt,
}) {
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef(null);
  const lastAutoPromptId = useRef(null);
  const chatMessages = Array.isArray(messages) ? messages : [];
  const setChatMessages = typeof setMessages === "function" ? setMessages : () => {};

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [chatMessages, open]);

  // Lets a parent (e.g. the "Get AI insights" button on the dashboard) open
  // this panel and have a message auto-sent, without duplicating the send
  // logic. Each autoPrompt carries a unique id so the same text can be
  // re-triggered on a later click.
  useEffect(() => {
    if (autoPrompt && autoPrompt.id !== lastAutoPromptId.current) {
      lastAutoPromptId.current = autoPrompt.id;
      handleSend(autoPrompt.text);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPrompt]);

  async function handleSend(text) {
    const message = String(text ?? input ?? "").trim();
    if (!message || busy) return;

    setChatMessages((m) => [...(Array.isArray(m) ? m : []), { role: "user", text: message }]);
    setInput("");
    setBusy(true);

    try {
      const { reply } = await sendChatMessage(message, analysis);
      setChatMessages((m) => [...(Array.isArray(m) ? m : []), { role: "bot", text: reply }]);
    } catch (e) {
      setChatMessages((m) => [...(Array.isArray(m) ? m : []), { role: "bot", text: `Something went wrong: ${e.message}` }]);
    } finally {
      setBusy(false);
    }
  }

  if (variant === "floating" && !open) return null;

  const isFull = variant === "full";

  return (
    <div className={`chat-panel ${isFull ? "full-view" : ""}`}>
      <div className="chat-header">
        <div className="chat-header-left">
          <div className="chat-header-icon">
            <BotIcon />
          </div>
          <div>
            <div className="chat-header-title">Statement Assistant</div>
            <span className="chat-header-badge">AI-powered • Groq</span>
          </div>
        </div>
        <div className="chat-header-buttons">
          {!isFull && onExpand && (
            <button className="chat-icon-btn" onClick={onExpand} title="Expand to full view">
              <ExpandIcon />
            </button>
          )}
          {isFull && onCollapse && (
            <button className="chat-icon-btn" onClick={onCollapse} title="Back to dashboard">
              <CollapseIcon />
            </button>
          )}
          {!isFull && onClose && (
            <button className="chat-icon-btn" onClick={onClose} title="Close">
              <CloseIcon />
            </button>
          )}
        </div>
      </div>

      <div className="chat-messages" ref={scrollRef}>
        {chatMessages.map((m, i) => (
          <div key={i} className={`chat-bubble ${m.role}`}>
            {m.role === "bot" ? renderMessageBody(m.text) : m.text}
          </div>
        ))}
        {busy && <div className="chat-bubble bot">Thinking…</div>}
      </div>

      <div className="chat-suggestions">
        {SUGGESTIONS.map((s) => (
          <button key={s} className="chat-chip" onClick={() => handleSend(s)}>
            {s}
          </button>
        ))}
      </div>

      <div className="chat-input-row">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          placeholder="Ask about your statement…"
        />
        <button className="chat-send" onClick={() => handleSend()} disabled={busy}>
          Send <SendIcon />
        </button>
      </div>
    </div>
  );
}