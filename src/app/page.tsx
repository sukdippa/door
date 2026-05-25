import HeroScene from "./components/HeroScene";
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
            <HeroScene
              modelUrl="/door.glb"
              triggerId="door-hero"
              openAngleDeg={105}
              className="pointer-events-none"
            />
          </div>
        </section>
      </main>
    </div>
  );
}
