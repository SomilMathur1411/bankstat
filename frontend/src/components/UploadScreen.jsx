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
        <h1>Bank Statement Analyser</h1>
        <p className="lede">
          Upload a bank statement export (or an already-cleaned transactions CSV) to get a full
          financial dashboard: spending trends, income &amp; salary detection, recurring
          merchants, anomalies, and cashflow — plus a chat assistant to ask questions about it.
        </p>

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
          <div className="dropzone-icon">📄</div>
          <div className="dropzone-title">
            {loading ? "Analysing your statement…" : "Drop your statement here, or click to browse"}
          </div>
          <div className="dropzone-sub">CSV, XLS or XLSX — processed locally by your backend</div>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.xls,.xlsx"
            hidden
            onChange={(e) => handleFiles(e.target.files)}
          />
        </div>

        <div className="upload-formats">
          <span className="pill">.csv</span>
          <span className="pill">.xls</span>
          <span className="pill">.xlsx</span>
        </div>

        {loading && <div className="loading-block">Crunching transactions, detecting salary cycles, spotting anomalies…</div>}
        {error && <div className="error-banner">{error}</div>}
      </div>
    </div>
  );
}
