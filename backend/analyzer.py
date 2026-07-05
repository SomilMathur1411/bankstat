"""
Core bank-statement analysis pipeline.

This module ports the logic from the original Colab notebook
(bankStatementAnalyser.ipynb) into a reusable, JSON-serializable pipeline:

  1. Load & clean a raw bank statement (csv / xls / xlsx)
  2. Extract merchants + rule-based categorization
  3. Detect salary / alternate income / misc income
  4. Build pay-cycle summaries (income vs expense, savings)
  5. Detect recurring merchants
  6. Detect anomalies (unusual income / expense events)
  7. Build all the time-series/aggregate data needed to reproduce every
     chart from the notebook, as plain JSON (no matplotlib).

Nothing here calls an LLM. The "Others" category and the /chat endpoint
are the intended hook points for the LLM layer to be added later.
"""

from __future__ import annotations

import io
import re
from collections import defaultdict
from typing import Optional

import numpy as np
import pandas as pd

# ---------------------------------------------------------------------------
# Default rule set (same starting rules as the notebook). Feel free to
# extend this, or later let the AI-fallback step (see notebook cells 24-30)
# propose new keywords for whatever lands in "Others".
# ---------------------------------------------------------------------------
DEFAULT_RULES = {
    "Food": ["swiggy", "zomato", "restaurant", "cafe", "coffee"],
    "Transport": ["uber", "ola", "rapido", "fuel", "petrol"],
    "Shopping": ["amazon", "flipkart", "myntra", "bigbasket", "big basket"],
    "Bills": ["electricity", "recharge", "netflix", "rent", "apple", "cred"],
}

REQUIRED_COLS = ["Date", "Narration", "Withdrawal Amt.", "Deposit Amt.", "Closing Balance"]


class AnalysisError(Exception):
    """Raised when the uploaded file can't be turned into a usable statement."""


# ---------------------------------------------------------------------------
# STEP 1: Loading & cleaning
# ---------------------------------------------------------------------------

def _find_header_row(raw: pd.DataFrame) -> Optional[int]:
    """Bank exports often have several rows of junk/branding before the real
    header row. Scan the first ~40 rows for one that looks like the header
    (contains both 'Date' and 'Narration')."""
    for i in range(min(40, len(raw))):
        row_vals = [str(v).strip().lower() for v in raw.iloc[i].tolist()]
        if any("narration" in v for v in row_vals) and any(v == "date" for v in row_vals):
            return i
    return None


def load_statement(file_bytes: bytes, filename: str) -> pd.DataFrame:
    filename_lower = filename.lower()

    if filename_lower.endswith((".xls", ".xlsx")):
        raw = pd.read_excel(io.BytesIO(file_bytes), header=None)
    else:
        raw = pd.read_csv(io.BytesIO(file_bytes), header=None, dtype=str)

    # Does row 0 already look like a proper header?
    first_row_vals = [str(v).strip().lower() for v in raw.iloc[0].tolist()]
    if any("narration" in v for v in first_row_vals):
        df = raw.copy()
        df.columns = df.iloc[0]
        df = df[1:].reset_index(drop=True)
    else:
        header_idx = _find_header_row(raw)
        if header_idx is None:
            raise AnalysisError(
                "Couldn't find a 'Date' / 'Narration' header row in this file. "
                "Please upload a bank statement export or the cleaned "
                "transactions CSV."
            )
        df = raw[header_idx + 1:].copy()
        df.columns = raw.iloc[header_idx]
        df = df.reset_index(drop=True)

    df.columns = [str(c).strip() for c in df.columns]

    missing = [c for c in ["Date", "Narration"] if c not in df.columns]
    if missing:
        raise AnalysisError(f"Missing required column(s): {', '.join(missing)}")

    for col in ["Withdrawal Amt.", "Deposit Amt.", "Closing Balance"]:
        if col not in df.columns:
            df[col] = np.nan

    return df


def clean_statement(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()

    df["Withdrawal Amt."] = pd.to_numeric(df["Withdrawal Amt."], errors="coerce")
    df["Deposit Amt."] = pd.to_numeric(df["Deposit Amt."], errors="coerce")
    df["Closing Balance"] = pd.to_numeric(df["Closing Balance"], errors="coerce")
    df["amount"] = df["Deposit Amt."].fillna(0) - df["Withdrawal Amt."].fillna(0)

    parsed = pd.to_datetime(df["Date"], errors="coerce", format="%d/%m/%y")
    if parsed.isna().mean() > 0.3:  # that format didn't fit well, fall back to a flexible parse
        parsed = pd.to_datetime(df["Date"], errors="coerce", dayfirst=True)
    df["Date"] = parsed
    df = df.dropna(subset=["Date"]).reset_index(drop=True)
    df = df[(df["Withdrawal Amt."].notna()) | (df["Deposit Amt."].notna())].reset_index(drop=True)

    df["balance"] = df["Closing Balance"]
    df = df.sort_values("Date").reset_index(drop=True)
    return df


# ---------------------------------------------------------------------------
# STEP 2: Merchant extraction + categorization
# ---------------------------------------------------------------------------

_BLACKLIST = {"bkid", "hdfc", "icici", "axis", "okaxis", "hdfcbank", "upi", "bank", "hdfc0merupi"}


def normalize(text: str) -> str:
    text = str(text).lower()
    text = re.sub(r"upi[-]", "", text)
    text = re.sub(r"[^a-z0-9 ]", " ", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def extract_merchant(narration: str) -> str:
    narration = normalize(narration)
    parts = narration.split()
    cleaned = [p for p in parts if p not in _BLACKLIST]
    return " ".join(cleaned[:3])


def clean_merchant(x: str) -> str:
    x = str(x).lower()
    x = re.sub(r"[^a-z0-9\s]", " ", x)
    x = re.sub(r"\s+", " ", x).strip()
    stop_words = {"ltd", "limited", "pvt", "private", "india"}
    tokens = [t for t in x.split() if t not in stop_words]
    return " ".join(tokens[:4])


def categorize(merchant: str, rules: dict) -> str:
    merchant = normalize(merchant)
    for category, keywords in rules.items():
        for kw in keywords:
            if normalize(kw) in merchant:
                return category
    return "Others"


def apply_categorization(df: pd.DataFrame, rules: Optional[dict] = None) -> pd.DataFrame:
    rules = rules or DEFAULT_RULES
    df = df.copy()
    df["merchant"] = df["Narration"].apply(extract_merchant)
    df["merchant_clean"] = df["merchant"].apply(clean_merchant)
    df["category"] = df["merchant"].apply(lambda m: categorize(m, rules))
    return df


# ---------------------------------------------------------------------------
# STEP 3: Recurring merchant detection (notebook cells 45-50)
# ---------------------------------------------------------------------------

def detect_recurring(df: pd.DataFrame) -> pd.DataFrame:
    """Flags recurring transactions.

    NOTE: this used to only look at `amount < 0` (withdrawals), which meant a
    monthly salary credit — the single most obviously periodic transaction in
    the whole statement — was never flagged as "recurring" and never showed
    up in the Recurring Merchants list. Recurrence has nothing to do with the
    direction of money movement, so we now look at every transaction (income
    *and* expense) and match on merchant + a rounded absolute amount.

    On top of that, anything already classified as `income_type == "salary"`
    (see `detect_income_and_cycles`, which requires 3+ months of a consistent
    amount from the same source) is forced to `recurring = True` even if a
    raise/bonus means the exact amount doesn't round-match every month.
    """
    df = df.copy()
    txn_df = df.copy()
    txn_df["abs_amount"] = txn_df["amount"].abs()

    if txn_df.empty:
        df["recurring"] = False
        return df

    txn_df["amount_rounded"] = txn_df["abs_amount"].round(-1)
    pair_counts = txn_df.groupby(["merchant", "amount_rounded"])["abs_amount"].transform("count")
    txn_df["recurring"] = pair_counts >= 3

    df["recurring"] = False
    df.loc[txn_df.index, "recurring"] = txn_df["recurring"]

    if "income_type" in df.columns:
        df.loc[df["income_type"] == "salary", "recurring"] = True

    return df


def recurring_merchants_summary(df: pd.DataFrame) -> list[dict]:
    recurring = df[df.get("recurring", False) == True].copy()  # noqa: E712
    if recurring.empty:
        return []
    recurring["abs_amount"] = recurring["amount"].abs()
    summary = (
        recurring.groupby("merchant")
        .agg(abs_total=("abs_amount", "sum"), occurrences=("abs_amount", "count"))
        .sort_values("abs_total", ascending=False)
        .reset_index()
    )
    out = []
    for _, r in summary.head(15).iterrows():
        merchant_rows = recurring[recurring["merchant"] == r["merchant"]]
        # A merchant is "income" if most of its recurring hits were credits
        # (covers salary as well as any other recurring incoming payment).
        is_income = (merchant_rows["amount"] > 0).mean() >= 0.5
        out.append(
            {
                "merchant": r["merchant"] or "(unknown)",
                "totalSpend": round(float(r["abs_total"]), 2),
                "occurrences": int(r["occurrences"]),
                "type": "income" if is_income else "expense",
            }
        )
    return out


# ---------------------------------------------------------------------------
# STEP 4: Salary / income detection + pay cycles (notebook cell 56)
# ---------------------------------------------------------------------------

def is_salary_like(narration: str) -> bool:
    narration = str(narration).lower()
    keywords = ["salary", "sal cr", "payroll", "wages", "neft cr"]
    return any(k in narration for k in keywords)


def detect_income_and_cycles(df: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame, list[str]]:
    """Returns (df with income_type column, cycle_summary dataframe, salary_merchants).
    If salary can't be confidently detected, income_type will still be set
    (misc_income / expense) but cycle_summary will be empty.
    """
    df = df.copy()
    df["income_type"] = "expense"
    df.loc[df["amount"] > 0, "income_type"] = "misc_income"

    income_df = df[df["amount"] > 0].copy()
    if income_df.empty:
        return df, pd.DataFrame(), []

    income_df["month"] = income_df["Date"].dt.to_period("M")
    income_by_source = income_df.groupby("merchant_clean")["month"].nunique()
    salary_candidates = income_by_source[income_by_source >= 3].index.tolist()
    income_df["is_salary_keyword"] = income_df["Narration"].apply(is_salary_like)

    salary_df = income_df[
        (income_df["merchant_clean"].isin(salary_candidates)) | (income_df["is_salary_keyword"])
    ].copy()

    salary_merchants: list[str] = []
    if not salary_df.empty:
        salary_stats = salary_df.groupby("merchant_clean")["amount"].agg(["mean", "std", "count"])
        salary_stats["cv"] = salary_stats["std"] / salary_stats["mean"]
        likely = salary_stats[(salary_stats["cv"].fillna(0) < 0.15) & (salary_stats["count"] >= 3)]
        salary_merchants = likely.index.tolist()

    if not salary_merchants:
        # Fall back: anything hitting the keyword match, even without 3+ occurrences
        keyword_hits = income_df[income_df["is_salary_keyword"]]["merchant_clean"].unique().tolist()
        salary_merchants = keyword_hits

    avg_salary = (
        df[df["merchant_clean"].isin(salary_merchants)]["amount"].mean() if salary_merchants else 0
    )
    avg_salary = 0 if pd.isna(avg_salary) else avg_salary
    alt_income_threshold = 0.5 * avg_salary if avg_salary else float("inf")

    other_credits = df[(df["amount"] > 0) & (~df["merchant_clean"].isin(salary_merchants))].copy()
    alt_income_sources: list[str] = []
    if not other_credits.empty and avg_salary:
        other_credits["is_alt_income_txn"] = other_credits["amount"] > alt_income_threshold
        alt_income_sources = other_credits[other_credits["is_alt_income_txn"]]["merchant_clean"].unique().tolist()

    df.loc[
        (df["merchant_clean"].isin(salary_merchants)) | (df["Narration"].apply(is_salary_like)),
        "income_type",
    ] = "salary"
    df.loc[
        (df["merchant_clean"].isin(alt_income_sources)) & (df["income_type"] != "salary"),
        "income_type",
    ] = "alt_income"

    salary_dates = df[df["income_type"] == "salary"]["Date"].sort_values().reset_index(drop=True)

    if len(salary_dates) < 2:
        return df, pd.DataFrame(), salary_merchants

    cycles = []
    for i in range(len(salary_dates) - 1):
        cycles.append({"cycle": i + 1, "start": salary_dates[i], "end": salary_dates[i + 1]})
    cycles.append(
        {
            "cycle": len(salary_dates),
            "start": salary_dates.iloc[-1],
            "end": df["Date"].max() + pd.Timedelta(days=1),
        }
    )
    cycles_df = pd.DataFrame(cycles)

    def cycle_insights(row):
        mask = (df["Date"] >= row["start"]) & (df["Date"] < row["end"])
        cycle_txns = df[mask]
        salary_in = cycle_txns[cycle_txns["income_type"] == "salary"]["amount"].sum()
        alt_in = cycle_txns[cycle_txns["income_type"] == "alt_income"]["amount"].sum()
        misc_in = cycle_txns[cycle_txns["income_type"] == "misc_income"]["amount"].sum()
        spend = cycle_txns[cycle_txns["amount"] < 0]["amount"].abs().sum()
        total_income = salary_in + alt_in + misc_in
        net = total_income - spend
        return pd.Series(
            {
                "salary_in": salary_in,
                "alt_income_in": alt_in,
                "misc_income_in": misc_in,
                "total_spend": spend,
                "net_saved": net,
                "savings_pct": round((net / salary_in) * 100, 1) if salary_in > 0 else None,
            }
        )

    insights = cycles_df.apply(cycle_insights, axis=1)
    cycle_summary = pd.concat([cycles_df, insights], axis=1)

    def category_breakdown(row):
        mask = (df["Date"] >= row["start"]) & (df["Date"] < row["end"]) & (df["amount"] < 0)
        temp = df[mask].copy()
        temp["spend"] = temp["amount"].abs()
        return temp.groupby("category")["spend"].sum().to_dict()

    cycle_summary["category_breakdown"] = [category_breakdown(r) for _, r in cycles_df.iterrows()]

    return df, cycle_summary, salary_merchants


# ---------------------------------------------------------------------------
# STEP 5: Anomaly detection (notebook cells 72-81)
# ---------------------------------------------------------------------------

def detect_anomalies(df: pd.DataFrame) -> pd.DataFrame:
    anomalies = []
    for group in ["salary", "alt_income", "expense"]:
        temp = df[df["income_type"] == group]
        if len(temp) < 3:
            continue
        thresh = temp["amount"].abs().mean() + 2 * temp["amount"].abs().std()
        anomalies.append(temp[temp["amount"].abs() > thresh])
    if not anomalies:
        return pd.DataFrame(columns=df.columns)
    return pd.concat(anomalies)


# ---------------------------------------------------------------------------
# Helpers to make everything JSON-safe
# ---------------------------------------------------------------------------

def _d(dt) -> str:
    return pd.Timestamp(dt).strftime("%Y-%m-%d")


def _num(x) -> Optional[float]:
    if x is None or (isinstance(x, float) and (np.isnan(x) or np.isinf(x))):
        return None
    return round(float(x), 2)


# ---------------------------------------------------------------------------
# Orchestration: run everything, build the full JSON payload for the frontend
# ---------------------------------------------------------------------------

def run_full_analysis(file_bytes: bytes, filename: str, rules: Optional[dict] = None) -> dict:
    raw = load_statement(file_bytes, filename)
    df = clean_statement(raw)

    if df.empty:
        raise AnalysisError("No valid transactions found after cleaning this file.")

    df = apply_categorization(df, rules)
    # Income/salary detection must run before recurring detection, since
    # detect_recurring uses the resulting income_type to make sure salary is
    # always treated as recurring (see detect_recurring's docstring).
    df, cycle_summary, salary_merchants = detect_income_and_cycles(df)
    df = detect_recurring(df)
    anomalies_df = detect_anomalies(df)

    # ---- KPI summary ----
    total_income = df[df["amount"] > 0]["amount"].sum()
    total_expense = df[df["amount"] < 0]["amount"].abs().sum()
    net_savings = total_income - total_expense
    n_months = max(df["Date"].dt.to_period("M").nunique(), 1)

    summary = {
        "transactionCount": int(len(df)),
        "dateRange": {"start": _d(df["Date"].min()), "end": _d(df["Date"].max())},
        "totalIncome": _num(total_income),
        "totalExpense": _num(total_expense),
        "netSavings": _num(net_savings),
        "avgMonthlySpend": _num(total_expense / n_months),
        "salaryDetected": bool(salary_merchants),
        "salaryMerchants": salary_merchants,
        "categoriesFound": sorted(df["category"].unique().tolist()),
        "uncategorizedCount": int((df["category"] == "Others").sum()),
    }

    # ---- Monthly spend trend ----
    spend_df = df[df["amount"] < 0].copy()
    spend_df["spend"] = spend_df["amount"].abs()
    monthly_spend = spend_df.groupby(spend_df["Date"].dt.to_period("M"))["spend"].sum().sort_index()
    monthly_spend_out = [
        {"month": str(period), "spend": _num(val)} for period, val in monthly_spend.items()
    ]

    # ---- Overall category breakdown ----
    category_totals = spend_df.groupby("category")["spend"].sum().sort_values(ascending=False)
    category_breakdown_out = [
        {"category": cat, "amount": _num(val)} for cat, val in category_totals.items()
    ]

    # ---- Recurring merchants ----
    recurring_out = recurring_merchants_summary(df)

    # ---- Income vs expense per cycle / savings trend ----
    cycle_out = []
    if not cycle_summary.empty:
        for _, row in cycle_summary.iterrows():
            cycle_out.append(
                {
                    "cycle": int(row["cycle"]),
                    "start": _d(row["start"]),
                    "end": _d(row["end"]),
                    "salaryIn": _num(row["salary_in"]),
                    "altIncomeIn": _num(row["alt_income_in"]),
                    "miscIncomeIn": _num(row["misc_income_in"]),
                    "totalSpend": _num(row["total_spend"]),
                    "netSaved": _num(row["net_saved"]),
                    "savingsPct": _num(row["savings_pct"]),
                }
            )

    # ---- Overall top spending categories (from cycle breakdowns, notebook cell 66) ----
    combined = defaultdict(float)
    for d in cycle_summary["category_breakdown"] if not cycle_summary.empty else []:
        for k, v in d.items():
            combined[k] += v
    top_categories_out = [
        {"category": k, "amount": _num(v)}
        for k, v in sorted(combined.items(), key=lambda kv: kv[1], reverse=True)[:10]
    ] or category_breakdown_out[:10]

    # ---- Daily cumulative cashflow ----
    daily = df.groupby("Date")["amount"].sum().cumsum()
    daily_cashflow_out = [{"date": _d(idx), "cumulative": _num(val)} for idx, val in daily.items()]

    # ---- Expense spike scatter + spike days ----
    expenses = df[df["amount"] < 0].copy()
    expenses["abs"] = expenses["amount"].abs()
    expense_spikes_out = [
        {"date": _d(row["Date"]), "amount": _num(row["abs"])} for _, row in expenses.iterrows()
    ]

    daily_spend = df[df["amount"] < 0].groupby("Date")["amount"].sum().abs()
    spike_days_out = []
    if not daily_spend.empty and daily_spend.std() == daily_spend.std():  # not NaN
        spike_threshold = daily_spend.mean() + 2 * daily_spend.std()
        spike_days = daily_spend[daily_spend > spike_threshold]
        spike_days_out = [{"date": _d(idx), "amount": _num(val)} for idx, val in spike_days.items()]

    # ---- Anomalies ----
    income_anoms = anomalies_df[anomalies_df["amount"] > 0] if not anomalies_df.empty else anomalies_df
    expense_anoms = anomalies_df[anomalies_df["amount"] < 0] if not anomalies_df.empty else anomalies_df
    anomalies_out = {
        "income": [
            {"date": _d(r["Date"]), "amount": _num(r["amount"]), "merchant": r["merchant"]}
            for _, r in income_anoms.iterrows()
        ],
        "expense": [
            {"date": _d(r["Date"]), "amount": _num(r["amount"]), "merchant": r["merchant"]}
            for _, r in expense_anoms.iterrows()
        ],
    }

    # ---- Balance over time (with income-type coloring) ----
    balance_out = [
        {
            "date": _d(row["Date"]),
            "balance": _num(row["balance"]),
            "type": row["income_type"],
            "amount": _num(row["amount"]),
            "merchant": row["merchant"],
        }
        for _, row in df.iterrows()
        if row["balance"] == row["balance"]  # drop NaN balances
    ]

    # ---- Income dependency pie ----
    income_summary = df[df["amount"] > 0].groupby("income_type")["amount"].sum()
    income_dependency_out = [
        {"type": k, "amount": _num(v)} for k, v in income_summary.items()
    ]

    # ---- Salary cycle burn curves (normalized balance + cumulative net flow) ----
    salary_dates = df[df["income_type"] == "salary"]["Date"].sort_values().tolist()
    normalized_balance_cycles = []
    burn_cycles = []

    for i in range(len(salary_dates) - 1):
        start, end = salary_dates[i], salary_dates[i + 1]
        temp = df[(df["Date"] >= start) & (df["Date"] < end)].copy()
        if len(temp) < 2:
            continue
        temp["days_from_salary"] = (temp["Date"] - start).dt.days
        temp["normalized_balance"] = temp["balance"] - temp["balance"].iloc[0]
        normalized_balance_cycles.append(
            {
                "cycle": i + 1,
                "points": [
                    {"day": int(r["days_from_salary"]), "value": _num(r["normalized_balance"])}
                    for _, r in temp.iterrows()
                ],
            }
        )

    for i in range(len(salary_dates)):
        start = salary_dates[i]
        end = salary_dates[i + 1] if i + 1 < len(salary_dates) else df["Date"].max()
        temp = df[(df["Date"] >= start) & (df["Date"] <= end)].copy()
        if temp.empty:
            continue
        temp["days_from_salary"] = (temp["Date"] - start).dt.days
        daily_flow = temp.groupby("days_from_salary")["amount"].sum().reset_index()
        daily_flow = daily_flow.sort_values("days_from_salary")
        daily_flow["cum_flow"] = daily_flow["amount"].cumsum()
        burn_cycles.append(
            {
                "cycle": i + 1,
                "points": [
                    {"day": int(r["days_from_salary"]), "value": _num(r["cum_flow"])}
                    for _, r in daily_flow.iterrows()
                ],
            }
        )

    avg_burn = []
    if burn_cycles:
        by_day = defaultdict(list)
        for c in burn_cycles:
            for p in c["points"]:
                by_day[p["day"]].append(p["value"])
        avg_burn = [
            {"day": day, "value": _num(np.mean(vals))}
            for day, vals in sorted(by_day.items())
        ]

    payload = {
        "summary": summary,
        "monthlySpend": monthly_spend_out,
        "categoryBreakdown": category_breakdown_out,
        "topCategoriesOverall": top_categories_out,
        "recurringMerchants": recurring_out,
        "cycleSummary": cycle_out,
        "dailyCashflow": daily_cashflow_out,
        "expenseSpikes": expense_spikes_out,
        "spikeDays": spike_days_out,
        "anomalies": anomalies_out,
        "balanceOverTime": balance_out,
        "incomeDependency": income_dependency_out,
        "burnCurve": {"cycles": burn_cycles, "average": avg_burn},
        "salaryCycleCurve": {"cycles": normalized_balance_cycles},
    }
    return payload