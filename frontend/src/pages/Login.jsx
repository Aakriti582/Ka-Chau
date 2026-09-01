import { useState } from "react";
import { useNavigate } from "react-router-dom";
import client, { tokens } from "../api/client";

export default function Login() {
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
      tokens.set(data.access, data.refresh);
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
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-slate-200 p-8"
      >
        <h1 className="text-3xl font-semibold text-slate-900">Ka Chau?</h1>
        <p className="text-slate-500 mt-1 mb-6">See which friends are nearby.</p>

        <label className="block text-sm font-medium text-slate-700 mb-1">
          Username
        </label>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          className="w-full border border-slate-300 rounded-lg px-3 py-2 mb-4
                     focus:outline-none focus:ring-2 focus:ring-slate-900"
        />

        <label className="block text-sm font-medium text-slate-700 mb-1">
          Password
        </label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          className="w-full border border-slate-300 rounded-lg px-3 py-2 mb-6
                     focus:outline-none focus:ring-2 focus:ring-slate-900"
        />

        {error && (
          <p className="text-sm text-red-600 mb-4">{error}</p>
        )}

        <button
          type="submit"
          disabled={busy || !username || !password}
          className="w-full bg-slate-900 text-white rounded-lg py-2.5 font-medium
                     disabled:opacity-40 hover:bg-slate-800 transition"
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}