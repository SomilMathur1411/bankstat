import React, { useEffect, useRef, useState } from "react";
import { sendChatMessage } from "../api.js";

const SUGGESTIONS = [
  "What's my total spend?",
  "Do I have a recurring salary?",
  "What are my top categories?",
  "Any unusual transactions?",
];

export default function ChatPanel({ analysis, open, onClose }) {
  const [messages, setMessages] = useState([
    {
      role: "bot",
      text: "Hi! I can answer questions about the statement you just uploaded. Ask me about spending, salary, categories, recurring merchants, or anomalies.",
    },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, open]);

  async function handleSend(text) {
    const message = (text ?? input).trim();
    if (!message || busy) return;

    setMessages((m) => [...m, { role: "user", text: message }]);
    setInput("");
    setBusy(true);

    try {
      const { reply } = await sendChatMessage(message, analysis);
      setMessages((m) => [...m, { role: "bot", text: reply }]);
    } catch (e) {
      setMessages((m) => [...m, { role: "bot", text: `Something went wrong: ${e.message}` }]);
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <div className="chat-panel">
      <div className="chat-header">
        <div>
          <div className="chat-header-title">Statement Assistant</div>
          <span className="chat-header-badge">rule-based • LLM coming soon</span>
        </div>
        <button className="chat-close" onClick={onClose}>
          ✕
        </button>
      </div>

      <div className="chat-messages" ref={scrollRef}>
        {messages.map((m, i) => (
          <div key={i} className={`chat-bubble ${m.role}`}>
            {m.text}
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
        <button className="chat-send" onClick={() => handleSend()}>
          Send
        </button>
      </div>
    </div>
  );
}
