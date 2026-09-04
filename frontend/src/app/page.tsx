import dynamic from "next/dynamic";
import HeroOverlay from "@/components/ui/HeroOverlay";

/**
 * The WebGL scene is client-only: it touches window/WebGL on mount and
 * has no meaningful server-rendered form.
 */
const HeroScene = dynamic(() => import("@/components/scene/HeroScene"), {
  loading: () => <SceneFallback />,
});

function SceneFallback() {
  return (
    <div className="absolute inset-0 grid place-items-center bg-[#FBF7EE]">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-400/20 border-t-cyan-400" />
        <span className="font-mono text-[10px] tracking-[0.2em] text-cyan-400/60">
          INITIALISING ORBIT
        </span>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <main className="relative h-full w-full overflow-hidden bg-[#FBF7EE]">
      <div className="absolute inset-0">
        <HeroScene />
      </div>
      <HeroOverlay />
    </main>
  );
}
