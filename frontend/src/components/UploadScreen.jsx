import React, { useCallback, useEffect, useRef, useState } from "react";

const loadingSteps = [
  "📄 Reading statement...",
  "🧹 Cleaning transactions...",
  "💰 Detecting salary & income...",
  "🏷️ Categorizing merchants...",
  "🔁 Finding recurring payments...",
  "⚠️ Detecting anomalies...",
  "📊 Building dashboard...",
  "🤖 Preparing AI Financial Copilot...",
];

export default function UploadScreen({
  onFileChosen,
  onDemoMode,
  loading,
  error,
}) {
  const [dragging, setDragging] = useState(false);
  const [loadingIndex, setLoadingIndex] = useState(0);

  const inputRef = useRef(null);

  const handleFiles = useCallback(
    (files) => {
      if (files && files[0]) {
        onFileChosen(files[0]);
      }
    },
    [onFileChosen]
  );

  useEffect(() => {
    if (!loading) {
      setLoadingIndex(0);
      return;
    }

    const interval = setInterval(() => {
      setLoadingIndex((i) => (i + 1) % loadingSteps.length);
    }, 1200);

    return () => clearInterval(interval);
  }, [loading]);

  return (
    <div className="upload-screen">
      <div className="upload-card">
        <div className="upload-badge">
          AI-Powered Financial Intelligence
        </div>

        <h1>SmartHQ</h1>

        <p
          style={{
            fontSize: "1.1rem",
            marginTop: "-10px",
            marginBottom: "20px",
            opacity: 0.75,
            fontWeight: 500,
          }}
        >

        </p>

        <p className="lede">
          Upload an HDFC Bank statement and instantly unlock intelligent
          financial insights, spending analytics, recurring payment detection,
          anomaly detection, interactive dashboards, and a conversational AI
          assistant that understands your money.
        </p>

        <div className="upload-hero-grid">
          <div
            className={`dropzone ${dragging ? "dragging" : ""}`}
            onClick={() => !loading && inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              handleFiles(e.dataTransfer.files);
            }}
          >
            <div className="dropzone-icon">📄</div>

            <div className="dropzone-title">
              {loading
                ? "Analyzing your statement..."
                : "Drop your bank statement here"}
            </div>

            <div className="dropzone-sub">
              Click to browse or drag & drop
            </div>

            <div
              style={{
                marginTop: 14,
                fontSize: 13,
                opacity: 0.65,
              }}
            >
              Supported: CSV • XLS • XLSX
            </div>

            <input
              ref={inputRef}
              type="file"
              hidden
              accept=".csv,.xls,.xlsx"
              onChange={(e) => handleFiles(e.target.files)}
            />
          </div>

          <div className="upload-side-card">
            <div className="side-card-title">
              What SmartHQ discovers
            </div>

            <ul className="side-card-list">
              <li>📈 Spending trends & category analysis</li>
              <li>💰 Salary & multiple income source detection</li>
              <li>🔁 Recurring subscriptions & merchants</li>
              <li>⚠️ Financial anomalies</li>
              <li>🤖 AI-powered financial insights</li>
            </ul>

            <div className="upload-formats">
              <span className="pill">CSV</span>
              <span className="pill">XLS</span>
              <span className="pill">XLSX</span>
            </div>
        </div>
        </div>

        <div
          style={{
            marginTop: 28,
            padding: "18px",
            borderRadius: 14,
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            textAlign: "center",
          }}
        >
          <div
            style={{
              fontWeight: 600,
              marginBottom: 8,
            }}
          >
            Current MVP is optimized for HDFC Bank statement exports
            (.xlsx/.csv).
          </div>

          <div
            style={{
              opacity: 0.7,
              marginBottom: 16,
            }}
          >
            Don't have an HDFC statement?
          </div>

          <button
            className="btn"
            disabled={loading}
            onClick={onDemoMode}
          >
            🚀 Try Demo Mode
          </button>
        </div>

        {loading && (
          <div className="loading-block">
            {loadingSteps[loadingIndex]}
          </div>
        )}

        {error && (
          <div className="error-banner">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}