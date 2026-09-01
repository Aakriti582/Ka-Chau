import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { tokens } from "./api/client";
import Login from "./pages/Login";
import Home from "./pages/Home";

function Protected({ children }) {
  return tokens.access ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<Protected><Home /></Protected>} />
      </Routes>
    </BrowserRouter>
  );
}