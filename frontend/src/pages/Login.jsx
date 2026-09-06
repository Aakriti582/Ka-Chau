import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import client, { tokens } from "../api/client";

export default function Login({ onSignedIn }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  async function submit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const { data } = await client.post("/auth/login/", { username, password });
      // The refresh token came back as an httpOnly cookie; only the access
      // token is ours to hold, and only in memory.
      tokens.set(data.access);
      onSignedIn?.();
      navigate("/");
    } catch (err) {
      setError(
        err.response?.data?.detail || "Could not sign in. Check your details."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-page font-body px-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm bg-card rounded-[22px] shadow-sm border border-border p-8"
      >
        <div className="text-center mb-8">
          <div className="w-14 h-14 mx-auto mb-4 rounded-full border border-sage flex items-center justify-center">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#2A3D2E" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
          </div>
          <h1 className="font-display font-medium text-4xl text-forest">Ka Chau?</h1>
          <p className="mt-1.5 text-sm text-ink-soft italic">See which friends are nearby.</p>
        </div>

        <label className="block text-xs tracking-[.1em] uppercase text-ink-soft mb-1.5">
          Username
        </label>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          className="w-full font-body text-base text-ink border border-border rounded-[14px] px-4 py-3.5 mb-4
                     outline-none focus:border-sage"
        />

        <label className="block text-xs tracking-[.1em] uppercase text-ink-soft mb-1.5">
          Password
        </label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          className="w-full font-body text-base text-ink border border-border rounded-[14px] px-4 py-3.5 mb-6
                     outline-none focus:border-sage"
        />

        {error && (
          <p className="text-sm text-danger mb-4">{error}</p>
        )}

        <button
          type="submit"
          disabled={busy || !username || !password}
          className="w-full bg-forest text-white rounded-2xl py-3.5 font-body text-base
                     disabled:opacity-40 hover:bg-forest-dark transition"
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>

        <p className="mt-5 text-center text-sm text-ink-soft">
          New here?{" "}
          <Link to="/register" className="text-forest border-b border-sage">
            Create an account
          </Link>
        </p>

        <div className="mt-5 flex gap-2.5 items-start px-4 py-3.5 border border-border rounded-[14px]">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7CA982" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-0.5">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
          </svg>
          <p className="text-xs leading-relaxed text-ink-soft text-balance">
            Nothing is shared until you choose to. New shares default to <em>proximity only</em> — no
            coordinates, ever.
          </p>
        </div>
      </form>
    </div>
  );
}