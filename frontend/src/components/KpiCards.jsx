import React from "react";

const fmt = (n) =>
  n === null || n === undefined
    ? "—"
    : n.toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

export default function KpiCards({ summary }) {
  if (!summary) return null;

  const netPositive = (summary.netSavings ?? 0) >= 0;

  return (
    <div className="kpi-grid">
      <div className="kpi-card">
        <div className="kpi-label">Total Income</div>
        <div className="kpi-value pos">{fmt(summary.totalIncome)}</div>
        <div className="kpi-sub">{summary.dateRange?.start} → {summary.dateRange?.end}</div>
      </div>
      <div className="kpi-card">
        <div className="kpi-label">Total Spend</div>
        <div className="kpi-value neg">{fmt(summary.totalExpense)}</div>
        <div className="kpi-sub">Avg / month: {fmt(summary.avgMonthlySpend)}</div>
      </div>
      <div className="kpi-card">
        <div className="kpi-label">Net Savings</div>
        <div className={`kpi-value ${netPositive ? "pos" : "neg"}`}>{fmt(summary.netSavings)}</div>
        <div className="kpi-sub">{summary.transactionCount} transactions</div>
      </div>
      <div className="kpi-card">
        <div className="kpi-label">Salary</div>
        <div className="kpi-value">{summary.salaryDetected ? "Detected" : "Not found"}</div>
        <div className="kpi-sub">
          {summary.salaryDetected ? (summary.salaryMerchants || []).join(", ") : "No confident pattern"}
        </div>
      </div>
      <div className="kpi-card">
        <div className="kpi-label">Categorized</div>
        <div className="kpi-value">
          {summary.transactionCount - summary.uncategorizedCount}/{summary.transactionCount}
        </div>
        <div className="kpi-sub">{summary.uncategorizedCount} in "Others" — good AI-fallback candidates</div>
      </div>
    </div>
  );
}
