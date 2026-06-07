import R3FHeroScene from "./components/R3FHeroScene";
import ScrollAnimations from "./components/ScrollAnimations";
import ArcStroke from "./components/ArcStroke";
import HeroLoadingOverlay from "./components/HeroLoadingOverlay";

export default function Home() {
  return (
    <div>
      <main className="relative">
        <section id="door-hero" className="relative h-screen overflow-hidden">

          <HeroLoadingOverlay />

          <div
            className="pointer-events-none absolute inset-0 z-20 bg-black"
            data-gsap="intro-black"
          />

          <div className="hero-reveal fixed flex flex-col text-white z-100 w-full">
            <div className="flex flex-row justify-between w-full px-8 py-6 mb-4">
              <div>
                Logo
              </div>
              <div>
                UoftHacks
              </div>
              <div>
                Menu
              </div>
            </div>
            <ArcStroke className="mt-4 h-full w-full text-white/70" />
          </div>


          <div className="absolute inset-0 z-10 flex items-center justify-center px-6 text-center">
            <div className="max-w-3xl space-y-4">
              <img
                src="/hero-welcome.png"
                alt="Welcome"
                className="hero-reveal hero-reveal--welcome mx-auto h-6 w-auto sm:h-7"
                data-gsap="intro-image"
              />
              <img
                src="/hero-title.png"
                alt="UofT Hacks 14"
                className="hero-reveal hero-reveal--title mx-auto h-16 w-auto sm:h-20 lg:h-24"
                data-gsap="intro-image"
              />
              <button
                type="button"
                className="hero-reveal hero-reveal--title mx-auto mt-5 inline-flex items-center justify-center rounded-full border border-white/70 bg-white/10 px-6 py-2 text-[0.65rem] uppercase tracking-[0.35em] text-white/90 backdrop-blur-sm transition duration-300 hover:bg-white/20"
              >
                Register Now
              </button>
            </div>
          </div>

          <ScrollAnimations />

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
              <div className="mt-3 text-2xl font-semibold text-white sm:text-3xl">
                Content After Entering the Door
              </div>
              
              <p className="mt-3 text-sm text-white/60">
                Archive fragments, crew logs, and early field notes compiled for review.
              </p>
              <div className="mt-4 flex flex-wrap gap-2 text-[0.65rem] uppercase tracking-[0.25em] text-white/60">
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
