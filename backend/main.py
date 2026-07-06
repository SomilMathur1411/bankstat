"""
FastAPI backend for the Bank Statement Analyser frontend.

Run locally:
    pip install -r requirements.txt
    uvicorn main:app --reload --port 8000

Endpoints:
    POST /api/analyze   -> upload a statement (csv/xls/xlsx), get full JSON analysis
    POST /api/chat      -> ask a question about the last analysis. Answered by
                           Gemini, while always grounding the answer with
                           rule-based finance insights.

                           NOTE: Groq is temporarily commented out below so we
                           can test Gemini in isolation. The Groq code is left
                           in place (just not called) — uncomment the block in
                           chat() to bring it back as a fallback.

Set your Gemini API key before starting the server, e.g.:
    export GEMINI_API_KEY=...          # or put it in a .env file (see .env.example)
"""

from __future__ import annotations

import json
import os
import re
from typing import Optional

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from analyzer import AnalysisError, run_full_analysis

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))  # picks up the local .env file if present, no-op otherwise

app = FastAPI(title="Bank Statement Analyser API")

# ---------------------------------------------------------------------------
# LLM configuration
#
# Gemini is the only provider in use right now (Groq is commented out below,
# in the chat() endpoint, while we test Gemini on its own).
# ---------------------------------------------------------------------------
# Load the API key from the environment (or a local .env file). Do NOT
# hardcode real keys in source. See backend/.env.example for the expected
# variable names.
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
GEMINI_MODEL = "gemini-2.5-flash"  # check https://ai.google.dev/gemini-api/docs/models for the current recommended model name
GEMINI_API_URL = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"

# Groq is temporarily unused (see chat() below) but left configured so it's a
# one-line uncomment to bring back as a fallback provider.
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
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
# The answer is always grounded in the rule-based finance summary first.
# Gemini is tried when a free API key is available. The AI reply is blended
# with the rule-based answer rather than replacing it outright.
# ---------------------------------------------------------------------------

class ChatRequest(BaseModel):
    message: str
    analysis: dict
    # First name only, for a personalised greeting/tone. Never send email,
    # password, or saved card details here — those aren't needed to answer
    # questions about a statement and shouldn't leave the browser.
    user_name: Optional[str] = None
    # Optional short bio the user wrote about themselves (via the Account
    # tab), used purely to make the assistant's tone/framing feel more
    # personal — e.g. "freelancer, irregular income" vs "salaried, saving
    # for a house". This is user-authored text meant for exactly this
    # purpose, unlike name/email/cards.
    user_bio: Optional[str] = None


class ChatResponse(BaseModel):
    reply: str


# Hard cap on how many raw transaction rows we'll ever forward to the LLM
# for a single question. This used to be 1500 (basically "send everything"),
# which is what was blowing past payload limits on any statement with real
# volume. Now we retrieve only what's relevant to the question instead of
# trying to fit the whole statement in every request.
MAX_TRANSACTIONS_FOR_AI = 80
RECENT_FALLBACK_COUNT = 20

_MONTH_LOOKUP = {}
for _i in range(1, 13):
    _MONTH_LOOKUP[__import__("calendar").month_name[_i].lower()] = _i
    _MONTH_LOOKUP[__import__("calendar").month_abbr[_i].lower()] = _i


def _tokenize(text: str) -> set[str]:
    return set(re.findall(r"[a-z0-9]+", str(text).lower()))


def select_relevant_transactions(message: str, transactions: list, max_n: int = MAX_TRANSACTIONS_FOR_AI) -> list:
    """Lightweight retrieval: score each transaction against the question's
    words (merchant, category, mode) and any month/year mentioned, and
    return the best matches instead of a blind slice of the transaction
    list.

    This is what actually keeps the payload small — a statement can have
    thousands of transactions, but a question like "how much did I spend on
    Swiggy" only needs the handful of rows that match "swiggy", not the
    entire history. If nothing in the question matches anything (e.g. "give
    me an overview"), we fall back to a small recent slice so the model has
    *some* concrete rows to point to.
    """
    q_tokens = _tokenize(message)
    mentioned_years = {t for t in q_tokens if re.fullmatch(r"20\d{2}", t)}
    mentioned_months = {_MONTH_LOOKUP[t] for t in q_tokens if t in _MONTH_LOOKUP}

    scored = []
    for tx in transactions:
        score = 0
        merchant_tokens = _tokenize(tx.get("merchant", ""))
        category_tokens = _tokenize(tx.get("category", ""))
        mode_tokens = _tokenize(tx.get("mode", ""))
        type_tokens = _tokenize(tx.get("type", ""))  # e.g. "salary", "alt_income", "expense"

        if q_tokens & merchant_tokens:
            score += 3
        if q_tokens & category_tokens:
            score += 2
        if q_tokens & mode_tokens:
            score += 2
        if q_tokens & type_tokens:
            score += 3

        date_str = str(tx.get("date") or "")
        if (mentioned_years or mentioned_months) and re.match(r"\d{4}-\d{2}-\d{2}", date_str):
            year, month = date_str[:4], int(date_str[5:7])
            if mentioned_years and year in mentioned_years:
                score += 2
            if mentioned_months and month in mentioned_months:
                score += 2

        if score > 0:
            scored.append((score, tx))

    if not scored:
        # Nothing matched — question is likely a general one already covered
        # by the aggregates (summary/categories/recurring/anomalies). Send a
        # small recent slice for grounding, not the whole statement.
        return transactions[-RECENT_FALLBACK_COUNT:]

    scored.sort(key=lambda pair: pair[0], reverse=True)
    return [tx for _, tx in scored[:max_n]]


def build_analysis_context(analysis: dict, message: str = "") -> str:
    """Build the grounding context sent to the LLM.

    This intentionally includes the full cleaned transaction list (date,
    merchant, amount, category, income type, balance) so the assistant can
    reference specific transactions, not just pre-aggregated summaries.
    It never includes the statement holder's name, account number, or any
    login/profile data — those aren't part of the `analysis` payload at all
    (see run_full_analysis in analyzer.py) and are kept out of this request.
    """
    summary = analysis.get("summary", {})
    transactions = analysis.get("transactions") or []
    top_categories = analysis.get("topCategoriesOverall") or analysis.get("categoryBreakdown") or []
    recurring = analysis.get("recurringMerchants") or []
    anomalies = analysis.get("anomalies", {})
    cycle_summary = analysis.get("cycleSummary") or []
    expense_spikes = analysis.get("expenseSpikes") or []
    payment_modes = analysis.get("paymentModeBreakdown") or []

    relevant_transactions = select_relevant_transactions(message, transactions)

    context = {
        "summary": summary,
        # Only transactions relevant to this specific question (matched by
        # merchant/category/mode/date), or a small recent slice if nothing
        # matched. Keeps the payload small regardless of statement length.
        "transactions": relevant_transactions,
        "transactionCountSentToAI": len(relevant_transactions),
        "totalTransactionCount": len(transactions),
        "topCategories": top_categories[:8],
        "recurringMerchants": recurring[:12],
        "paymentModeBreakdown": payment_modes,
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


async def call_gemini(system_prompt: str, user_message: str) -> str:
    if not GEMINI_API_KEY:
        raise RuntimeError("GEMINI_API_KEY is not set. Please configure your .env file.")

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            GEMINI_API_URL,
            params={"key": GEMINI_API_KEY},
            headers={"Content-Type": "application/json"},
            json={
                "systemInstruction": {"parts": [{"text": system_prompt}]},
                "contents": [{"role": "user", "parts": [{"text": user_message}]}],
                "generationConfig": {"temperature": 0.5, "maxOutputTokens": 1000},
            },
        )
    resp.raise_for_status()
    data = resp.json()

    try:
        return data["candidates"][0]["content"]["parts"][0]["text"].strip()
    except (KeyError, IndexError) as e:
        raise RuntimeError(f"Unexpected Gemini API response format: {data}") from e


async def call_groq(system_prompt: str, user_message: str) -> str:
    if not GROQ_API_KEY:
        raise RuntimeError("GROQ_API_KEY is not set. Please configure your .env file.")

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


def combine_rule_and_ai(rule_answer: str, ai_answer: str) -> str:
    rule_answer = (rule_answer or "").strip()
    ai_answer = (ai_answer or "").strip()

    if not ai_answer:
        return rule_answer
    if not rule_answer or "I can currently answer basic questions" in rule_answer:
        return ai_answer

    return f"{rule_answer}\n\nAI insight:\n{ai_answer}"


GROQ_SYSTEM_PROMPT = (
    "You are the user's money-smart older sibling — the one they call when they need "
    "someone to look at their bank statement and tell them straight, but kindly, what's "
    "going on. Warm, encouraging, a little informal, never condescending or preachy. "
    "You're on their side, not judging their spending.\n\n"
    "{name_line}"
    "{bio_line}"
    "Ground rules:\n"
    "- Use ONLY the statement data given below. Never invent numbers, merchants, or "
    "dates that aren't in it.\n"
    "- The transaction list below is a RELEVANT SUBSET picked for this question, not "
    "the full statement — 'totalTransactionCount' shows how many exist in total, and "
    "'transactionCountSentToAI' shows how many are included here. Rely on the "
    "pre-computed summary/category/recurring/anomaly figures for totals and trends; "
    "only use the transaction list to cite specific examples. Don't claim something "
    "'isn't in the statement' just because it isn't in this subset — say the summary "
    "figures don't break it down that way, if that's the case.\n"
    "- You may reference specific transactions (date, merchant, amount, category) from "
    "the transaction list when it helps answer the question, but don't dump the whole "
    "list back at them — pull out only what's relevant.\n"
    "- If a personal bio is given below, use it to shape TONE and FRAMING only (e.g. "
    "someone who mentioned irregular income might want cushion-focused advice, a student "
    "might want a simpler breakdown). It's self-reported context, not a verified fact "
    "about their finances — never treat it as overriding or supplementing the actual "
    "statement numbers.\n"
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

    if any(k in q for k in ["upi", "neft", "imps", "rtgs", "cheque", "chq", "payment mode", "transaction mode", "how did i pay", "atm"]):
        modes = analysis.get("paymentModeBreakdown") or []
        if modes:
            lines = ", ".join(f"{m['mode']}: {money(m['amount'])} across {m['count']} txns" for m in modes[:6])
            top = modes[0]
            return f"Most of your money moved via {top['mode']} ({money(top['amount'])}). Full breakdown: {lines}."
        return "No payment mode breakdown is available yet."

    if "transaction" in q and ("count" in q or "how many" in q or "number" in q):
        return f"There are {summary.get('transactionCount', 'N/A')} transactions in this statement."

    return (
        "I can currently answer basic questions about totals, savings, salary, "
        "categories, recurring merchants, and anomalies from the numbers directly "
        "(no AI model wired up yet — that's the next step). Try asking things like "
        "\"what's my total spend\", \"do I have a salary?\", or \"what are my top categories?\"."
    )


def build_system_prompt(req: ChatRequest, context: str) -> str:
    # Only a first name, if given, is used for personalization — never
    # email, password, or card details. Those fields simply aren't on
    # ChatRequest, so there's nothing to accidentally forward here.
    first_name = (req.user_name or "").strip().split(" ")[0]
    name_line = f"The user's first name is {first_name}. Use it once or twice, naturally, not in every message.\n\n" if first_name else ""
    bio = (req.user_bio or "").strip()
    bio_line = f"The user described themselves like this: \"{bio}\"\n\n" if bio else ""
    return GROQ_SYSTEM_PROMPT.format(name_line=name_line, bio_line=bio_line, context=context)


@app.post("/api/chat", response_model=ChatResponse)
async def chat(req: ChatRequest):
    rule_reply = answer_from_rules(req.message, req.analysis)
    context = build_analysis_context(req.analysis, req.message)
    system_prompt = build_system_prompt(req, context)

    if GEMINI_API_KEY:
        try:
            ai_reply = await call_gemini(system_prompt, req.message)
            return ChatResponse(reply=combine_rule_and_ai(rule_reply, ai_reply))
        except Exception as e:  # noqa: BLE001
            # Gemini failed (bad key, rate limit, region issue, etc.) — fall
            # through to Groq as a backup provider instead of going straight
            # to the rule-based answer.
            print(f"[chat] Gemini call failed: {e}")

    if GROQ_API_KEY:
        try:
            ai_reply = await call_groq(system_prompt, req.message)
            return ChatResponse(reply=combine_rule_and_ai(rule_reply, ai_reply))
        except Exception as e:  # noqa: BLE001
            print(f"[chat] Groq call failed: {e}")

    return ChatResponse(reply=rule_reply)