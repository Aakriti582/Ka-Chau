import { useEffect, useState } from "react";

// An empty div is indistinguishable from a crashed page, which is exactly what
// people saw when opening the link from Instagram: the boot placeholder, held
// open by a refresh call that never resolved.
//
// The explanation waits four seconds, so a normal fast load doesn't flash an
// apology at anyone.
export default function BootScreen() {
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => setSlow(true), 4000);
    return () => clearTimeout(id);
  }, []);

  return (
    <div className="min-h-screen bg-page flex flex-col items-center justify-center px-8">
      <div className="w-11 h-11 rounded-full border border-border flex items-center
                      justify-center mb-4">
        <svg
          width="20" height="20" viewBox="0 0 24 24" fill="none"
          stroke="#2A3D2E" strokeWidth="1.5" strokeLinecap="round"
          strokeLinejoin="round" aria-hidden="true"
        >
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
          <circle cx="12" cy="10" r="3" />
        </svg>
      </div>

      <h1 className="font-display text-3xl text-ink">Ka Chau?</h1>

      {slow && (
        <p className="text-ink-soft text-sm text-center mt-3 max-w-[260px]">
          Waking the server — this can take up to a minute the first time.
        </p>
      )}
    </div>
  );
}
