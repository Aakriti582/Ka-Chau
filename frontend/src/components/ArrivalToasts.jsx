import { distanceLabel } from "../utils/distance";

const STYLE = {
  arrived: {
    box: "border-[#c6dcc9] bg-[#f1f6f1]",
    dot: "bg-sage",
    name: "text-forest",
    detail: "text-ink-soft",
  },
  left: {
    box: "border-border bg-card",
    dot: "bg-ink-faint",
    name: "text-ink-soft",
    detail: "text-ink-faint",
  },
};

function nameOf(user) {
  return user.display_name || user.username;
}

// Arrivals reuse FriendRow's distance vocabulary, so an exact share reads
// "400 m away" and a proximity_only one reads as its bucket -- never a figure
// the server did not send.
function detail(toast) {
  return toast.type === "arrived"
    ? `Arrived · ${distanceLabel(toast.entry)}`
    : "Left the area";
}

export default function ArrivalToasts({ toasts, onDismiss }) {
  if (toasts.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 mb-4" role="status" aria-live="polite">
      {toasts.map((toast) => {
        const style = STYLE[toast.type];
        const name = nameOf(toast.user);

        return (
          <div
            key={toast.id}
            className={`flex items-center gap-2.5 rounded-[18px] border px-4 py-3 ${style.box}`}
          >
            <span className={`w-[9px] h-[9px] rounded-full shrink-0 ${style.dot}`} />

            <div className="min-w-0 flex-1">
              <p className={`text-sm truncate ${style.name}`}>{name}</p>
              <p className={`text-[12.5px] mt-0.5 ${style.detail}`}>{detail(toast)}</p>
            </div>

            <button
              onClick={() => onDismiss(toast.id)}
              aria-label={`Dismiss ${name}`}
              className="shrink-0 text-ink-faint hover:text-ink-soft text-lg leading-none px-1"
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}
