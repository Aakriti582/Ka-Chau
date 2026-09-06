import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import client, { tokens } from "../api/client";

// The inputs the API can key an error to. Anything else it sends back is not
// tied to a field on this form, so it has to surface at the form level rather
// than be dropped on the floor.
const FIELDS = ["username", "display_name", "password"];

function Field({ label, optional, hint, error, children }) {
  return (
    <div className="mb-4">
      <label className="block text-xs tracking-[.1em] uppercase text-ink-soft mb-1.5">
        {label}
        {optional && <span className="text-ink-faint"> — optional</span>}
      </label>
      {children}
      {error ? (
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-danger">{error}</p>
      ) : (
        hint && (
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-soft">{hint}</p>
        )
      )}
    </div>
  );
}

function inputClass(hasError) {
  return `w-full font-body text-base text-ink border rounded-[14px] px-4 py-3.5
          outline-none focus:border-sage ${hasError ? "border-danger" : "border-border"}`;
}

export default function Register({ onSignedIn }) {
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  async function submit(e) {
    e.preventDefault();
    setErrors({});
    setFormError("");
    setBusy(true);
    try {
      const { data } = await client.post("/auth/register/", {
        username,
        display_name: displayName.trim(),
        password,
      });
      // Registering signs you straight in: same handling as a login, so the
      // refresh cookie is already set and only the access token is ours.
      tokens.set(data.access);
      onSignedIn?.();
      navigate("/");
    } catch (err) {
      const { status, data } = err.response ?? {};
      if (status === 429) {
        setFormError(
          "Too many sign-up attempts from this device. Wait a few minutes and try again."
        );
      } else if (status === 400 && data && typeof data === "object") {
        const fieldErrors = {};
        const unkeyed = [];
        for (const [key, value] of Object.entries(data)) {
          const message = Array.isArray(value) ? value.join(" ") : String(value);
          if (FIELDS.includes(key)) fieldErrors[key] = message;
          else unkeyed.push(message);
        }
        setErrors(fieldErrors);
        setFormError(unkeyed.join(" "));
      } else {
        setFormError("Could not create your account. Try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-page font-body px-4 py-10">
      <form
        onSubmit={submit}
        noValidate
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

        <Field
          label="Username"
          hint="3–30 letters, numbers or underscores. This is permanent — you can't change it later."
          error={errors.username}
        >
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck="false"
            className={inputClass(errors.username)}
          />
        </Field>

        <Field
          label="Display name"
          optional
          hint="The name friends see next to you. You can change this any time."
          error={errors.display_name}
        >
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            autoComplete="nickname"
            maxLength={60}
            className={inputClass(errors.display_name)}
          />
        </Field>

        <Field
          label="Password"
          hint="At least 8 characters."
          error={errors.password}
        >
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            className={inputClass(errors.password)}
          />
        </Field>

        {formError && <p className="text-sm text-danger mt-5 mb-1">{formError}</p>}

        <button
          type="submit"
          disabled={busy || !username || !password}
          className="w-full bg-forest text-white rounded-2xl py-3.5 font-body text-base mt-2
                     disabled:opacity-40 hover:bg-forest-dark transition"
        >
          {busy ? "Creating account…" : "Create account"}
        </button>

        <p className="mt-5 text-center text-sm text-ink-soft">
          Already have an account?{" "}
          <Link to="/login" className="text-forest border-b border-sage">
            Sign in
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
