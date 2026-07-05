import React from "react";

const fmt = (n) =>
  n === null || n === undefined
    ? "—"
    : n.toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

export default function KpiCards({ summary }) {
  if (!summary) return null;

  const netPositive = (summary.netSavings ?? 0) >= 0;
  const categorized = summary.transactionCount ? summary.transactionCount - summary.uncategorizedCount : 0;

  const cards = [
    {
      label: "Total income",
      value: fmt(summary.totalIncome),
      detail: `${summary.dateRange?.start ?? "Recent"} → ${summary.dateRange?.end ?? "history"}`,
      pill: "Flow in",
      accent: "violet",
      icon: "↗",
    },
    {
      label: "Total spend",
      value: fmt(summary.totalExpense),
      detail: `Avg / month ${fmt(summary.avgMonthlySpend)}`,
      pill: "Tracked",
      accent: "rose",
      icon: "↘",
    },
    {
      label: "Net savings",
      value: fmt(summary.netSavings),
      detail: `${summary.transactionCount ?? 0} transactions captured`,
      pill: netPositive ? "Healthy" : "Needs attention",
      accent: netPositive ? "emerald" : "amber",
      icon: netPositive ? "✓" : "!",
    },
    {
      label: "Salary pattern",
      value: summary.salaryDetected ? "Detected" : "Not found",
      detail: summary.salaryDetected ? (summary.salaryMerchants || []).join(", ") : "No confident salary cycle yet",
      pill: summary.salaryDetected ? "Recurring" : "Pending",
      accent: "sky",
      icon: "◌",
    },
    {
      label: "Categorized",
      value: `${categorized}/${summary.transactionCount ?? 0}`,
      detail: `${summary.uncategorizedCount ?? 0} items still in Others`,
      pill: "AI-ready",
      accent: "mint",
      icon: "✦",
    },
  ];

  return (
    <div className="kpi-grid">
      {cards.map((card) => (
        <div key={card.label} className={`kpi-card ${card.accent}`}>
          <div className="kpi-card-top">
            <div className={`kpi-icon ${card.accent}`}>{card.icon}</div>
            <span className="kpi-pill">{card.pill}</span>
          </div>
          <div className="kpi-label">{card.label}</div>
          <div className="kpi-value">{card.value}</div>
          <div className="kpi-sub">{card.detail}</div>
        </div>
      ))}
    </div>
  );
}
