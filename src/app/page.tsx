import R3FHeroScene from "./components/R3FHeroScene";
import ScrollAnimations from "./components/ScrollAnimations";

export default function Home() {
  return (
    <div className="min-h-screen text-white">
      <ScrollAnimations />
      <main className="relative">
        <section id="door-hero" className="relative h-screen overflow-hidden">
          <div
            className="pointer-events-none absolute inset-0 z-20 bg-black"
            data-gsap="intro-black"
          />
          <div className="absolute inset-0 z-10 flex items-center justify-center px-6 text-center">
            <div className="max-w-3xl space-y-4">
              <img
                src="/hero-welcome.png"
                alt="Welcome"
                className="mx-auto h-6 w-auto sm:h-7"
                data-gsap="intro-image"
              />
              <img
                src="/hero-title.png"
                alt="UofT Hacks 14"
                className="mx-auto h-16 w-auto sm:h-20 lg:h-24"
                data-gsap="intro-image"
              />
            </div>
          </div>

          <div className="absolute inset-0 z-0">
            <R3FHeroScene
              modelUrl="/door.glb"
              triggerId="door-hero"
              openAngleDeg={105}
              className="pointer-events-none"
            />
          </div>
          <div className="pointer-events-none absolute inset-0 z-[-1] flex items-center justify-center px-6 text-left">
            <div
              className="w-full max-w-2xl rounded-3xl border border-white/15 bg-black/40 p-6 text-white/80 backdrop-blur-md sm:p-8"
              data-gsap="hero-card"
            >
              <div className="text-[0.65rem] uppercase tracking-[0.4em] text-white/60">
                Access dossier
              </div>
              <div className="mt-3 text-2xl font-semibold text-white sm:text-3xl">
                Door Protocol // Phase One
              </div>
              <p className="mt-3 text-sm text-white/60">
                Archive fragments, crew logs, and early field notes compiled for review.
              </p>
              <div className="mt-4 flex flex-wrap gap-2 text-[0.65rem] uppercase tracking-[0.25em] text-white/60">
                <span className="rounded-full border border-white/20 px-3 py-1">
                  Status: prototype
                </span>
                <span className="rounded-full border border-white/20 px-3 py-1">
                  Signal: live
                </span>
                <span className="rounded-full border border-white/20 px-3 py-1">
                  Sector: 07
                </span>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
