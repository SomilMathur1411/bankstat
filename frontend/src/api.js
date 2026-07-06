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

export async function analyzeDemoFile() {
  // No dedicated backend "demo" route exists — instead we fetch the static
  // sample statement bundled with the frontend (public/sample_bank_statement.csv)
  // and run it through the same /api/analyze endpoint real uploads use.
  const sampleRes = await fetch("/sample_bank_statement.csv");
  if (!sampleRes.ok) {
    throw new Error("Could not load the sample statement file.");
  }
  const blob = await sampleRes.blob();
  const file = new File([blob], "sample_bank_statement.csv", { type: "text/csv" });

  return analyzeFile(file);
}

export async function sendChatMessage(message, analysis, userName, userBio) {
  // Only ever send a first name for personalization — never email,
  // password, or card details, even if a caller passes the whole user
  // object in by mistake.
  const firstNameOnly = typeof userName === "string" ? userName.trim().split(" ")[0] : undefined;
  // Bio is user-authored free text meant for this exact purpose (AI
  // personalization), so it's fine to send as-is, but cap it defensively
  // in case someone pastes something huge in there.
  const trimmedBio = typeof userBio === "string" ? userBio.trim().slice(0, 400) : undefined;

  const res = await fetch(`${API_BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, analysis, user_name: firstNameOnly, user_bio: trimmedBio }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `Chat failed (${res.status})`);
  }
  return res.json();
}