# Bank Statement Analyser — Frontend + API

A dashboard frontend for the analysis pipeline in `bankStatementAnalyser.ipynb`, plus a
FastAPI backend that ports the notebook's pandas logic into a reusable JSON API.

```
bankstat/
├── backend/          FastAPI app — the analysis pipeline, no matplotlib
│   ├── analyzer.py    core pipeline (load → clean → categorize → salary/cycles →
│   │                  recurring → anomalies → chart-ready JSON)
│   ├── main.py        /api/analyze and /api/chat endpoints
│   └── requirements.txt
└── frontend/          React (Vite) dashboard + chat UI
    └── src/
        ├── components/UploadScreen.jsx
        ├── components/Dashboard.jsx     all charts (recharts)
        ├── components/KpiCards.jsx
        └── components/ChatPanel.jsx     chat UI (rule-based stub for now)
```

## Running it

**Backend**
```bash
cd backend
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

**Frontend** (in a second terminal)
```bash
cd frontend
npm install
npm run dev
```
Open the URL Vite prints (usually `http://localhost:5173`). The dev server proxies
`/api/*` to `http://localhost:8000`, so no extra config is needed locally.

Upload `clean_transactions.csv` (or a raw bank statement export — the backend tries to
auto-detect the header row) and the dashboard renders every chart from the notebook:

- Monthly spending trend
- Top spending categories (overall + per pay-cycle breakdown)
- Bank balance over time, colour-coded by salary / alt income / misc income / expense
- Income vs expense per pay cycle + savings trend
- Cumulative cashflow
- Expense spike detection + anomalous money in/out
- Income dependency breakdown (pie)
- Recurring merchants
- Salary-cycle burn curves (normalized balance + cumulative net flow, with an average
  overlay)

## Where the LLM layer goes

You mentioned you'll wire up the LLM yourself — here's the seam:

- **`backend/main.py` → `answer_from_rules(message, analysis)`**: right now this just
  pattern-matches the question and answers from the numbers directly. Swap the body of
  this function (or the call to it in `/api/chat`) for a call to your model, passing
  `req.analysis` as grounding context and `req.message` as the user's question. The
  frontend already sends the full analysis JSON with every chat message, so nothing on
  the client needs to change.
- **`backend/analyzer.py`**: the "Others" category (see `summary.uncategorizedCount`) is
  the same AI-fallback hook as notebook cells 24-30 — send the leftover merchants to
  your model to propose new keyword rules, then merge them into `DEFAULT_RULES`.

## Notes

- All amounts are in the currency implied by the statement (₹ formatting is used in the
  UI since the sample data is INR — change `KpiCards.jsx` / `Dashboard.jsx` if needed).
- The backend does not persist uploads; each request is processed in memory and
  returned as JSON. Add storage/auth before deploying this with real user data.
- CORS is wide open (`allow_origins=["*"]`) for local development — tighten this before
  deploying publicly.
