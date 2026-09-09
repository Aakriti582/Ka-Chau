import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { refreshAccess } from "./api/client";
import BootScreen from "./components/BootScreen";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Home from "./pages/Home";
import Friends from "./pages/Friends";
import MapScreen from "./pages/Map";
import Me from "./pages/Me";

const BOOT_TIMEOUT_MS = 25_000;

function Protected({ authed, children }) {
  return authed ? children : <Navigate to="/login" replace />;
}

export default function App() {
  const [booting, setBooting] = useState(true);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    let settled = false;

    // Backstop. .finally() handles a rejected promise, but not one that never
    // settles at all -- which is what a hung request produces, and what an
    // in-app browser silently dropping the call produces. Without this the
    // boot screen stays up forever.
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        setAuthed(false);
        setBooting(false);
      }
    }, BOOT_TIMEOUT_MS);

    refreshAccess()
      .then(() => { if (!settled) setAuthed(true); })
      .catch(() => { if (!settled) setAuthed(false); })
      .finally(() => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        setBooting(false);
      });

    return () => clearTimeout(timer);
  }, []);

  if (booting) return <BootScreen />;

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login onSignedIn={() => setAuthed(true)} />} />
        <Route path="/register" element={<Register onSignedIn={() => setAuthed(true)} />} />
        <Route path="/" element={<Protected authed={authed}><Home /></Protected>} />
        <Route path="/friends" element={<Protected authed={authed}><Friends /></Protected>} />
        <Route path="/map" element={<Protected authed={authed}><MapScreen /></Protected>} />
        <Route path="/me" element={<Protected authed={authed}><Me /></Protected>} />
      </Routes>
    </BrowserRouter>
  );
}