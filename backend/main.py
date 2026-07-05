"""
FastAPI backend for the Bank Statement Analyser frontend.

Run locally:
    pip install -r requirements.txt
    uvicorn main:app --reload --port 8000

Endpoints:
    POST /api/analyze   -> upload a statement (csv/xls/xlsx), get full JSON analysis
    POST /api/chat      -> ask a question about the last analysis (rule-based stub;
                            swap this out for your LLM call later)
"""

from __future__ import annotations

import re

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from analyzer import AnalysisError, run_full_analysis

app = FastAPI(title="Bank Statement Analyser API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten this before deploying publicly
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/analyze")
async def analyze(file: UploadFile = File(...)):
    contents = await file.read()
    try:
        result = run_full_analysis(contents, file.filename)
    except AnalysisError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Failed to analyze file: {e}")
    return result


# ---------------------------------------------------------------------------
# Chat endpoint — RULE-BASED PLACEHOLDER.
#
# This is intentionally simple. It reads the `summary` (and a few other
# fields) sent by the frontend and answers a handful of common questions
# from the numbers directly, with no model call. This is the seam where
# you plug in your LLM later: replace `answer_from_rules(...)` with a call
# to your model, passing `req.analysis` (or a trimmed/derived version of it)
# as grounding context alongside `req.message`.
# ---------------------------------------------------------------------------

class ChatRequest(BaseModel):
    message: str
    analysis: dict


class ChatResponse(BaseModel):
    reply: str


def answer_from_rules(message: str, analysis: dict) -> str:
    q = message.lower()
    summary = analysis.get("summary", {})

    def money(x):
        if x is None:
            return "N/A"
        return f"₹{x:,.2f}"

    if any(k in q for k in ["total spend", "total expense", "how much did i spend"]):
        return f"Total spend across the period was {money(summary.get('totalExpense'))}."

    if any(k in q for k in ["total income", "how much did i earn", "how much did i make"]):
        return f"Total income across the period was {money(summary.get('totalIncome'))}."

    if "saving" in q or "net" in q:
        return (
            f"Net savings over the period: {money(summary.get('netSavings'))}. "
            f"Average monthly spend: {money(summary.get('avgMonthlySpend'))}."
        )

    if "salary" in q:
        if summary.get("salaryDetected"):
            merchants = ", ".join(summary.get("salaryMerchants", [])) or "an unnamed source"
            return f"A recurring salary was detected from: {merchants}."
        return "No recurring salary pattern was confidently detected in this statement."

    if "categor" in q or "spending on" in q:
        cats = analysis.get("topCategoriesOverall") or analysis.get("categoryBreakdown") or []
        if cats:
            top = cats[0]
            lines = ", ".join(f"{c['category']}: {money(c['amount'])}" for c in cats[:5])
            return f"Top spending category is {top['category']} ({money(top['amount'])}). Top 5: {lines}."
        return "No category breakdown is available yet."

    if "recurring" in q or "subscription" in q:
        recs = analysis.get("recurringMerchants") or []
        if recs:
            lines = ", ".join(f"{r['merchant']} ({money(r['totalSpend'])})" for r in recs[:5])
            return f"Recurring merchants detected: {lines}."
        return "No clearly recurring merchants were detected."

    if "anomal" in q or "unusual" in q or "spike" in q:
        anoms = analysis.get("anomalies", {})
        n_exp = len(anoms.get("expense", []))
        n_inc = len(anoms.get("income", []))
        return f"Found {n_exp} unusual expense event(s) and {n_inc} unusual income event(s)."

    if "transaction" in q and ("count" in q or "how many" in q or "number" in q):
        return f"There are {summary.get('transactionCount', 'N/A')} transactions in this statement."

    return (
        "I can currently answer basic questions about totals, savings, salary, "
        "categories, recurring merchants, and anomalies from the numbers directly "
        "(no AI model wired up yet — that's the next step). Try asking things like "
        "\"what's my total spend\", \"do I have a salary?\", or \"what are my top categories?\"."
    )


@app.post("/api/chat", response_model=ChatResponse)
async def chat(req: ChatRequest):
    reply = answer_from_rules(req.message, req.analysis)
    return ChatResponse(reply=reply)
