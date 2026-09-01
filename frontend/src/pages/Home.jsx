import { useEffect, useState } from "react";
import client, { tokens } from "../api/client";

export default function Home() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    client.get("/nearby/")
      .then((res) => setData(res.data))
      .catch((err) => setError(err.response?.data?.detail || "Failed to load"));
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <div className="max-w-lg mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-semibold">Ka Chau?</h1>
          <button
            onClick={() => { tokens.clear(); window.location.href = "/login"; }}
            className="text-sm text-slate-500 hover:text-slate-900"
          >
            Sign out
          </button>
        </div>
        {error && <p className="text-red-600">{error}</p>}
        <pre className="bg-white p-4 rounded-lg border border-slate-200 text-xs overflow-auto">
          {JSON.stringify(data, null, 2)}
        </pre>
      </div>
    </div>
  );
}