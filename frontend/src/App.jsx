import React, { useState } from "react";
import UploadScreen from "./components/UploadScreen.jsx";
import Dashboard from "./components/Dashboard.jsx";
import ChatPanel from "./components/ChatPanel.jsx";
import { analyzeFile } from "./api.js";

export default function App() {
  const [analysis, setAnalysis] = useState(null);
  const [filename, setFilename] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [chatOpen, setChatOpen] = useState(false);

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
        {analysis && (
          <div className="header-actions">
            <span className="filename">{filename}</span>
            <button className="btn" onClick={reset}>
              Upload another
            </button>
          </div>
        )}
      </header>

      <div className="main-area">
        {!analysis ? (
          <UploadScreen onFileChosen={handleFileChosen} loading={loading} error={error} />
        ) : (
          <div className="dashboard-scroll">
            <div className="dashboard-toolbar">
              <h2>Financial Dashboard</h2>
            </div>
            <Dashboard data={analysis} />
          </div>
        )}
      </div>

      {analysis && (
        <>
          <button className="chat-toggle" onClick={() => setChatOpen((v) => !v)} title="Statement Assistant">
            💬
          </button>
          <ChatPanel analysis={analysis} open={chatOpen} onClose={() => setChatOpen(false)} />
        </>
      )}
    </div>
  );
}
