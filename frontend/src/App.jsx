import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { refreshAccess } from "./api/client";
import Login from "./pages/Login";
import Home from "./pages/Home";
import Friends from "./pages/Friends";
import MapPlaceholder from "./pages/MapPlaceholder";
import Me from "./pages/Me";

function Protected({ authed, children }) {
  return authed ? children : <Navigate to="/login" replace />;
}

export default function App() {
  const [booting, setBooting] = useState(true);
  const [authed, setAuthed] = useState(false);

  // The refresh cookie is httpOnly, so a signed-in session is invisible to JS.
  // Asking the server for a fresh access token is the only way to find out.
  useEffect(() => {
    refreshAccess()
      .then(() => setAuthed(true))
      .catch(() => setAuthed(false))
      .finally(() => setBooting(false));
  }, []);

  // Blank rather than the login screen: routing before the refresh resolves
  // would flash sign-in at an already signed-in user on every page load.
  if (booting) return <div className="min-h-screen bg-page" />;

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login onSignedIn={() => setAuthed(true)} />} />
        <Route path="/" element={<Protected authed={authed}><Home /></Protected>} />
        <Route path="/friends" element={<Protected authed={authed}><Friends /></Protected>} />
        <Route path="/map" element={<Protected authed={authed}><MapPlaceholder /></Protected>} />
        <Route path="/me" element={<Protected authed={authed}><Me /></Protected>} />
      </Routes>
    </BrowserRouter>
  );
}
