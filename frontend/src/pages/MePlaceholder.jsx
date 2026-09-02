import BottomTabBar from "../components/BottomTabBar";

export default function MePlaceholder() {
  return (
    <div className="min-h-screen bg-page font-body pb-24 flex flex-col">
      <div className="max-w-lg mx-auto px-5 w-full">
        <h1 className="font-display font-medium text-3xl text-ink pt-6 pb-3">Me</h1>
      </div>
      <div className="flex-1 flex items-center justify-center">
        <p className="text-ink-soft text-sm">Coming soon.</p>
      </div>
      <BottomTabBar />
    </div>
  );
}
