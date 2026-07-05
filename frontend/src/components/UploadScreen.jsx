import React, { useCallback, useRef, useState } from "react";

export default function UploadScreen({ onFileChosen, loading, error }) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);

  const handleFiles = useCallback(
    (files) => {
      if (files && files[0]) onFileChosen(files[0]);
    },
    [onFileChosen]
  );

  return (
    <div className="upload-screen">
      <div className="upload-card">
        <div className="upload-badge">AI-powered financial OS</div>
        <h1>See your money with clarity.</h1>
        <p className="lede">
          Drop in a bank statement export and instantly unlock a polished dashboard for income,
          spending, salary cycles, anomalies, and merchant patterns — all designed for decision-making.
        </p>

        <div className="upload-hero-grid">
          <div
            className={`dropzone ${dragging ? "dragging" : ""}`}
            onClick={() => inputRef.current?.click()}
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
            <div className="dropzone-icon">⬆</div>
            <div className="dropzone-title">
              {loading ? "Analyzing your statement…" : "Drop your statement here, or click to browse"}
            </div>
            <div className="dropzone-sub">CSV, XLS, or XLSX — processed locally in your workspace</div>
            <input
              ref={inputRef}
              type="file"
              accept=".csv,.xls,.xlsx"
              hidden
              onChange={(e) => handleFiles(e.target.files)}
            />
          </div>

          <div className="upload-side-card">
            <div className="side-card-title">What you get</div>
            <ul className="side-card-list">
              <li>Premium finance overview with trend-rich charts</li>
              <li>Salary and income pattern detection</li>
              <li>Recurring merchant and anomaly highlights</li>
              <li>Conversational AI assistant for instant questions</li>
            </ul>
            <div className="upload-formats">
              <span className="pill">.csv</span>
              <span className="pill">.xls</span>
              <span className="pill">.xlsx</span>
            </div>
          </div>
        </div>

        {loading && <div className="loading-block">Crunching transactions, mapping salary cycles, and spotting anomalies…</div>}
        {error && <div className="error-banner">{error}</div>}
      </div>
    </div>
  );
}
