# SmartHQ — Frontend + API


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

<img width="1536" height="1024" alt="ChatGPT Image Jul 3, 2026, 07_27_08 PM" src="https://github.com/user-attachments/assets/0b6f511e-78be-46ee-ae28-97f32f32fcb0" />
