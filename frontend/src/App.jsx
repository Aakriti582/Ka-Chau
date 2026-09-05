import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { tokens } from "./api/client";
import Login from "./pages/Login";
import Home from "./pages/Home";
import Friends from "./pages/Friends";
import MapPlaceholder from "./pages/MapPlaceholder";
import Me from "./pages/Me";

function Protected({ children }) {
  return tokens.access ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<Protected><Home /></Protected>} />
        <Route path="/friends" element={<Protected><Friends /></Protected>} />
        <Route path="/map" element={<Protected><MapPlaceholder /></Protected>} />
        <Route path="/me" element={<Protected><Me /></Protected>} />
      </Routes>
    </BrowserRouter>
  );
}