import React, { useMemo, useState } from "react";
import UploadScreen from "./components/UploadScreen.jsx";
import Dashboard from "./components/Dashboard.jsx";
import AuthScreen from "./components/AuthScreen.jsx";
import AccountPanel from "./components/AccountPanel.jsx";
import ChatPanel from "./components/ChatPanel.jsx";
import { analyzeFile } from "./api.js";

const INITIAL_MESSAGES = [
  {
    role: "bot",
    text: "Hi! I can answer questions about the statement you just uploaded. Ask me about spending, salary, categories, recurring merchants, or anomalies.",
  },
];

function ChatBubbleIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M4 12c0-4.4 3.8-8 8.5-8S21 7.6 21 12s-3.8 8-8.5 8c-1 0-2-.16-2.9-.46L5 21l1.2-3.8C4.8 15.9 4 14 4 12Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="9" cy="12" r="1.2" fill="currentColor" />
      <circle cx="12.5" cy="12" r="1.2" fill="currentColor" />
      <circle cx="16" cy="12" r="1.2" fill="currentColor" />
    </svg>
  );
}

function DashboardIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="tab-icon">
      <rect x="3.5" y="3.5" width="7" height="8" rx="1.6" stroke="currentColor" strokeWidth="1.6" />
      <rect x="13.5" y="3.5" width="7" height="5" rx="1.6" stroke="currentColor" strokeWidth="1.6" />
      <rect x="13.5" y="11.5" width="7" height="9" rx="1.6" stroke="currentColor" strokeWidth="1.6" />
      <rect x="3.5" y="14.5" width="7" height="6" rx="1.6" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function SparkleIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="tab-icon">
      <path
        d="M12 3.5l1.6 4.3 4.3 1.6-4.3 1.6L12 15.3l-1.6-4.3-4.3-1.6 4.3-1.6L12 3.5Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M18.5 16l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8.8-2Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="tab-icon">
      <path d="M12 12a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" stroke="currentColor" strokeWidth="1.6" />
      <path d="M5 19a7 7 0 0 1 14 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function readStoredUser() {
  if (typeof window === "undefined") return null;
  const activeId = window.localStorage.getItem("bankstat-active-user");
  const users = JSON.parse(window.localStorage.getItem("bankstat-users") || "[]");
  return users.find((item) => item.id === activeId) || null;
}

function persistUser(nextUser) {
  if (typeof window === "undefined") return;
  const users = JSON.parse(window.localStorage.getItem("bankstat-users") || "[]");
  const index = users.findIndex((item) => item.id === nextUser.id);
  const nextUsers = index >= 0 ? users.map((item) => (item.id === nextUser.id ? nextUser : item)) : [...users, nextUser];
  window.localStorage.setItem("bankstat-users", JSON.stringify(nextUsers));
  window.localStorage.setItem("bankstat-active-user", nextUser.id);
}

export default function App() {
  const [analysis, setAnalysis] = useState(null);
  const [filename, setFilename] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [chatOpen, setChatOpen] = useState(false);
  const [view, setView] = useState("dashboard");
  const [messages, setMessages] = useState(INITIAL_MESSAGES);
  const [user, setUser] = useState(readStoredUser);

  const headerGreeting = useMemo(() => (user ? `Welcome, ${user.name.split(" ")[0]}` : "Secure account"), [user]);

  async function handleFileChosen(file) {
    setLoading(true);
    setError("");
    try {
      const result = await analyzeFile(file);
      setAnalysis(result);
      setFilename(file.name);
    } catch (e) {
      setError(e.message || "Something went wrong analysing this file.");
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setAnalysis(null);
    setFilename("");
    setError("");
    setChatOpen(false);
    setView("dashboard");
    setMessages(INITIAL_MESSAGES);
  }

  function expandChatToFullTab() {
    setChatOpen(false);
    setView("assistant");
  }

  function handleAuthSubmit(payload) {
    const users = JSON.parse(window.localStorage.getItem("bankstat-users") || "[]");
    const email = payload.email.trim().toLowerCase();
    const password = payload.password.trim();

    if (payload.mode === "signup") {
      if (!payload.name.trim()) return "Please enter your full name.";
      if (password.length < 6) return "Use at least 6 characters for your password.";
      if (payload.password !== payload.confirmPassword) return "Passwords do not match.";
      if (users.some((item) => item.email === email)) return "An account with this email already exists.";

      const nextUser = {
        id: crypto.randomUUID(),
        name: payload.name.trim(),
        email,
        password,
        bio: "A new member of the Bank Statement Analyzer experience.",
        cards: [],
      };
      persistUser(nextUser);
      setUser(nextUser);
      return "";
    }

    const existingUser = users.find((item) => item.email === email && item.password === password);
    if (!existingUser) return "That email or password was not found.";

    persistUser(existingUser);
    setUser(existingUser);
    return "";
  }

  function handleUserUpdate(nextUser) {
    persistUser(nextUser);
    setUser(nextUser);
  }

  function handleLogout() {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem("bankstat-active-user");
    }
    setUser(null);
    reset();
  }

  if (!user) {
    return (
      <div className="app-shell auth-shell">
        <header className="app-header">
          <div className="brand">
            <div className="brand-mark">₹</div>
            <div>
              <div className="brand-name">Bank Statement Analyser</div>
              <div className="brand-sub">Secure profile · Saved cards · AI insights</div>
            </div>
          </div>
        </header>
        <AuthScreen onSubmit={handleAuthSubmit} />
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">
          <div className="brand-mark">₹</div>
          <div>
            <div className="brand-name">Bank Statement Analyser</div>
            <div className="brand-sub">Spending · Income · Anomalies</div>
          </div>
        </div>

        <div className="header-center">
          <div className="view-tabs">
            <button className={`view-tab ${view === "dashboard" ? "active" : ""}`} onClick={() => setView("dashboard")}>
              <DashboardIcon /> Dashboard
            </button>
            <button className={`view-tab ${view === "account" ? "active" : ""}`} onClick={() => setView("account")}>
              <UserIcon /> Account
            </button>
            <button
              className={`view-tab ${view === "assistant" ? "active" : ""}`}
              onClick={() => {
                setChatOpen(false);
                setView("assistant");
              }}
            >
              <SparkleIcon /> AI Assistant
            </button>
          </div>
        </div>

        <div className="header-actions">
          <span className="filename">{headerGreeting}</span>
          <button className="btn" onClick={reset}>
            Upload another
          </button>
        </div>
      </header>

      <div className="main-area">
        {view === "account" ? (
          <div className="dashboard-scroll">
            <AccountPanel user={user} onUserUpdate={handleUserUpdate} onLogout={handleLogout} />
          </div>
        ) : !analysis ? (
          <UploadScreen onFileChosen={handleFileChosen} loading={loading} error={error} />
        ) : view === "assistant" ? (
          <div className="assistant-view">
            <div className="assistant-view-intro">
              <h2>AI Assistant</h2>
              <p>Ask anything about this statement — spending, salary, recurring merchants, or anomalies.</p>
            </div>
            <ChatPanel
              analysis={analysis}
              variant="full"
              messages={messages}
              setMessages={setMessages}
              onCollapse={() => setView("dashboard")}
            />
          </div>
        ) : (
          <div className="dashboard-scroll">
            <div className="dashboard-toolbar">
              <h2>Financial command center</h2>
              <div className="toolbar-pill">Live insights</div>
            </div>
            <Dashboard data={analysis} />
          </div>
        )}
      </div>

      {analysis && view !== "assistant" && view !== "account" && (
        <>
          <button className="chat-toggle" onClick={() => setChatOpen((v) => !v)} title="Statement Assistant">
            <span className="chat-toggle-badge" />
            <ChatBubbleIcon />
          </button>
          <ChatPanel
            analysis={analysis}
            open={chatOpen}
            onClose={() => setChatOpen(false)}
            variant="floating"
            messages={messages}
            setMessages={setMessages}
            onExpand={expandChatToFullTab}
          />
        </>
      )}
    </div>
  );
}
