import React, { useMemo, useState } from "react";

const emptyCard = {
  nickname: "",
  bank: "",
  type: "Debit",
  number: "",
  expiry: "",
  notes: "",
};

export default function AccountPanel({ user, onUserUpdate, onLogout }) {
  const [profileForm, setProfileForm] = useState({
    name: user?.name || "",
    email: user?.email || "",
    bio: user?.bio || "",
  });
  const [cardForm, setCardForm] = useState(emptyCard);

  const cardCountText = useMemo(() => `${user?.cards?.length || 0} saved card${(user?.cards?.length || 0) === 1 ? "" : "s"}`, [user]);

  function handleProfileChange(event) {
    const { name, value } = event.target;
    setProfileForm((prev) => ({ ...prev, [name]: value }));
  }

  function handleProfileSave(event) {
    event.preventDefault();
    const nextUser = { ...user, ...profileForm, email: profileForm.email.trim().toLowerCase() };
    onUserUpdate(nextUser);
  }

  function handleCardChange(event) {
    const { name, value } = event.target;
    setCardForm((prev) => ({ ...prev, [name]: value }));
  }

  function handleCardAdd(event) {
    event.preventDefault();
    if (!cardForm.nickname || !cardForm.bank || !cardForm.number) return;
    const nextUser = {
      ...user,
      cards: [
        ...((user?.cards || []).filter(Boolean)),
        {
          ...cardForm,
          number: cardForm.number.replace(/\D/g, "").slice(-4),
          id: Date.now().toString(),
        },
      ],
    };
    onUserUpdate(nextUser);
    setCardForm(emptyCard);
  }

  function handleDeleteCard(id) {
    const nextUser = {
      ...user,
      cards: (user?.cards || []).filter((card) => card.id !== id),
    };
    onUserUpdate(nextUser);
  }

  return (
    <div className="account-shell">
      <section className="account-card account-hero">
        <div>
          <div className="auth-badge">Profile & cards</div>
          <h2>{user?.name || "Your account"}</h2>
          <p>{user?.bio || "Store your preferences and keep your important cards close at hand."}</p>
        </div>
        <button className="btn btn-secondary" type="button" onClick={onLogout}>
          Log out
        </button>
      </section>

      <section className="account-grid">
        <div className="account-card">
          <div className="section-title compact">Profile details</div>
          <form className="account-form" onSubmit={handleProfileSave}>
            <label>
              <span>Name</span>
              <input name="name" value={profileForm.name} onChange={handleProfileChange} required />
            </label>
            <label>
              <span>Email</span>
              <input type="email" name="email" value={profileForm.email} onChange={handleProfileChange} required />
            </label>
            <label>
              <span>Short bio</span>
              <textarea name="bio" value={profileForm.bio} onChange={handleProfileChange} rows="3" placeholder="A quick note about how you use this account" />
            </label>
            <button className="btn btn-primary" type="submit">Save profile</button>
          </form>
        </div>

        <div className="account-card">
          <div className="section-title compact">Saved cards</div>
          <div className="account-summary">
            <span className="summary-pill">{cardCountText}</span>
            <span className="summary-pill">Secure local storage</span>
          </div>

          <form className="account-form compact" onSubmit={handleCardAdd}>
            <label>
              <span>Nickname</span>
              <input name="nickname" value={cardForm.nickname} onChange={handleCardChange} placeholder="Travel card" required />
            </label>
            <label>
              <span>Bank</span>
              <input name="bank" value={cardForm.bank} onChange={handleCardChange} placeholder="HDFC Bank" required />
            </label>
            <label>
              <span>Card type</span>
              <select name="type" value={cardForm.type} onChange={handleCardChange}>
                <option>Debit</option>
                <option>Credit</option>
                <option>Prepaid</option>
              </select>
            </label>
            <label>
              <span>Card number</span>
              <input name="number" value={cardForm.number} onChange={handleCardChange} placeholder="1234 5678 9012 3456" required />
            </label>
            <label>
              <span>Expiry</span>
              <input name="expiry" value={cardForm.expiry} onChange={handleCardChange} placeholder="08/28" />
            </label>
            <label>
              <span>Notes</span>
              <textarea name="notes" value={cardForm.notes} onChange={handleCardChange} rows="3" placeholder="Annual fee, reward points, travel perks..." />
            </label>
            <button className="btn btn-primary" type="submit">Add card</button>
          </form>

          <div className="card-list">
            {(user?.cards || []).map((card) => (
              <div className="card-item" key={card.id}>
                <div>
                  <div className="card-item-title">{card.nickname}</div>
                  <div className="card-item-meta">{card.bank} · {card.type}</div>
                  <div className="card-item-meta">•••• {card.number}</div>
                  {card.expiry && <div className="card-item-meta">Valid till {card.expiry}</div>}
                  {card.notes && <div className="card-item-notes">{card.notes}</div>}
                </div>
                <button className="btn btn-secondary small" type="button" onClick={() => handleDeleteCard(card.id)}>
                  Remove
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
