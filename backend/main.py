"""
FastAPI backend for the Bank Statement Analyser frontend.

Run locally:
    pip install -r requirements.txt
    uvicorn main:app --reload --port 8000

Endpoints:
    POST /api/analyze   -> upload a statement (csv/xls/xlsx), get full JSON analysis
    POST /api/chat      -> ask a question about the last analysis. Answered by
                           Groq when GROQ_API_KEY is set in the environment,
                           otherwise falls back to a simple rule-based responder.

Set your Groq API key before starting the server, e.g.:
    export GROQ_API_KEY=sk-...          # or put it in a .env file (see .env.example)
"""

from __future__ import annotations

import json
import os
import re

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from analyzer import AnalysisError, run_full_analysis

load_dotenv()  # picks up a local .env file if present, no-op otherwise

app = FastAPI(title="Bank Statement Analyser API")

# ---------------------------------------------------------------------------
# Groq configuration
#
# Set GROQ_API_KEY in your environment (or a .env file loaded before startup)
# to enable real LLM-backed chat. If it's not set, the API transparently
# falls back to the rule-based responder below, so the app still works
# without a key.
# ---------------------------------------------------------------------------
GROQ_API_KEY = "YOUR_KEY_HERE"
GROQ_MODEL = "openai/gpt-oss-120b"
GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"

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
# Chat endpoint
#
# When GROQ_API_KEY is configured, questions are answered by Groq, grounded
# in a trimmed JSON summary of the statement analysis (so the model can't
# see raw transaction-level PII it doesn't need, and prompts stay small).
# If the key is missing, or the Groq call fails for any reason, we fall
# back to the rule-based responder further down so the app never breaks.
# ---------------------------------------------------------------------------

class ChatRequest(BaseModel):
    message: str
    analysis: dict


class ChatResponse(BaseModel):
    reply: str


def build_analysis_context(analysis: dict) -> str:
    """Trim the full analysis payload down to what the LLM actually needs."""
    summary = analysis.get("summary", {})
    top_categories = analysis.get("topCategoriesOverall") or analysis.get("categoryBreakdown") or []
    recurring = analysis.get("recurringMerchants") or []
    anomalies = analysis.get("anomalies", {})
    cycle_summary = analysis.get("cycleSummary") or []
    expense_spikes = analysis.get("expenseSpikes") or []

    context = {
        "summary": summary,
        "topCategories": top_categories[:8],
        "recurringMerchants": recurring[:12],
        "anomalies": {
            "expenseCount": len(anomalies.get("expense", [])),
            "incomeCount": len(anomalies.get("income", [])),
            "sampleExpense": anomalies.get("expense", [])[:5],
            "sampleIncome": anomalies.get("income", [])[:5],
        },
        "recentCycles": cycle_summary[-6:],
        "expenseSpikeCount": len(expense_spikes),
    }
    return json.dumps(context, default=str)


async def call_groq(system_prompt: str, user_message: str) -> str:
    if not GROQ_API_KEY:
        raise RuntimeError("GROQ_API_KEY is not configured")

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            GROQ_API_URL,
            headers={
                "Authorization": f"Bearer {GROQ_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": GROQ_MODEL,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_message},
                ],
                "temperature": 0.5,
                "max_tokens": 1000,
            },
        )
    resp.raise_for_status()
    data = resp.json()
    return data["choices"][0]["message"]["content"].strip()


GROQ_SYSTEM_PROMPT = (
    "You are the user's money-smart older sibling — the one they call when they need "
    "someone to look at their bank statement and tell them straight, but kindly, what's "
    "going on. Warm, encouraging, a little informal, never condescending or preachy. "
    "You're on their side, not judging their spending.\n\n"
    "Ground rules:\n"
    "- Use ONLY the statement data given below. Never invent numbers, merchants, or "
    "dates that aren't in it.\n"
    "- Use ₹ for currency.\n"
    "- Talk to them directly ('you', 'your'), like you're sitting next to them looking "
    "at the statement together.\n"
    "- If something looks concerning, say so plainly but gently, and suggest one "
    "concrete next step — don't just list problems and leave them hanging.\n"
    "- If asked something the data can't answer, say so plainly instead of guessing.\n\n"
    "Formatting rules (always follow these, no exceptions):\n"
    "- Use **bold** around key numbers, amounts, and important terms so they jump out.\n"
    "- When you have more than one point to make, use a real bulleted list: each bullet "
    "on its OWN LINE, starting with '- '. Never run multiple bullets together in one "
    "line separated by dashes.\n"
    "- Keep it skimmable: short sentences, no walls of text.\n"
    "- Finish your thought — don't trail off mid-sentence.\n\n"
    "Statement data (JSON): {context}"
)


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
            income_recs = [r for r in recs if r.get("type") == "income"]
            expense_recs = [r for r in recs if r.get("type") != "income"]
            parts = []
            if income_recs:
                lines = ", ".join(f"{r['merchant']} ({money(r['totalSpend'])})" for r in income_recs[:3])
                parts.append(f"Recurring income: {lines}")
            if expense_recs:
                lines = ", ".join(f"{r['merchant']} ({money(r['totalSpend'])})" for r in expense_recs[:5])
                parts.append(f"Recurring expenses: {lines}")
            return " | ".join(parts) + "."
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
    if GROQ_API_KEY:
        try:
            context = build_analysis_context(req.analysis)
            system_prompt = GROQ_SYSTEM_PROMPT.format(context=context)
            reply = await call_groq(system_prompt, req.message)
            return ChatResponse(reply=reply)
        except Exception as e:  # noqa: BLE001
            # Groq call failed (bad key, network issue, rate limit, etc.) —
            # don't break the UI, just fall back to the rule-based answer
            # and quietly note what happened.
            fallback = answer_from_rules(req.message, req.analysis)
            return ChatResponse(reply=f"{fallback}\n\n(AI model call failed, showing a basic answer instead: {e})")

    reply = answer_from_rules(req.message, req.analysis)
    return ChatResponse(reply=reply)