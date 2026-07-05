const API_BASE = ""; // proxied to backend via vite.config.js in dev; set a full URL in production if needed

export async function analyzeFile(file) {
  const form = new FormData();
  form.append("file", file);

  const res = await fetch(`${API_BASE}/api/analyze`, {
    method: "POST",
    body: form,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `Analysis failed (${res.status})`);
  }
  return res.json();
}

export async function sendChatMessage(message, analysis, userName) {
  // Only ever send a first name for personalization — never email,
  // password, or card details, even if a caller passes the whole user
  // object in by mistake.
  const firstNameOnly = typeof userName === "string" ? userName.trim().split(" ")[0] : undefined;

  const res = await fetch(`${API_BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, analysis, user_name: firstNameOnly }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `Chat failed (${res.status})`);
  }
  return res.json();
}
