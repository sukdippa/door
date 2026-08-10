// Scene-tuning constants for the / (home) page's door2.glb hero (mirrors
// pathSceneConfig.ts's structure — kept in its own file/component so the two
// hero scenes stay independently tunable, same reasoning as R3FHeroScene.tsx
// vs. R3FPathScene.tsx).

export const DOOR_SCROLL_DISTANCE = "+=460%";

// Single sun (door2.glb, like the original door.glb, bakes no
// KHR_lights_punctual — so this is authored here, not read from the file).
// Seeded from the pre-migration door.glb light rig; retune by eye against
// the new HDRI sky in the "Sun" Leva panel.
export const DOOR_SUN_LIGHT_CONFIG = {
  intensity: 3,
  color: "#feebeb",
  position: { x: -3.2, y: 8.5, z: 9.4 },
  // Orthographic shadow-camera frustum: half-width (±) and far plane.
  shadowSize: 5,
  shadowFar: 50,
};

export const DOOR_AMBIENT_LIGHT_CONFIG = {
  intensity: 1,
};

// Dim front fill spotlight — lights the front-facing foliage the sun rakes
// past. No shadows (fill only). decay 0 keeps intensity readable like the sun.
export const DOOR_FRONT_SPOT_CONFIG = {
  intensity: 0.8,
  color: "#e8c08d",
  position: { x: -6.5, y: -17.3, z: 4.1 },
  angle: 1.5,
  penumbra: 1,
  decay: 0,
};

export const DOOR_FOG_CONFIG = {
  enabled: true,
  color: "#7cc3ec",
  near: 4,
  far: 18,
};

export const DOOR_BLOOM_CONFIG = {
  intensity: 6,
  luminanceThreshold: 0.8,
  mipmapBlur: true,
};

// From `startProgress` to the end of scroll, fog and bloom fade to 0 (fog
// can't go to a literal 0 intensity — THREE.Fog has no such scalar — so
// `far` is pushed out instead, past reach of any on-screen geometry; see
// applyCameraKeyframe in R3FHeroScene.tsx). `startProgress` can't go below 0
// (scroll progress itself starts at 0) — to make a fade feel like it kicks
// in even sooner than that, lower its `curvePower` (< 1) instead: it
// front-loads the ramp (e.g. 0.35 means ~65% of the fade is already done by
// just 10% of the way through the fade range) rather than rising linearly.
// Fog and bloom share one `startProgress` (the earliest either can begin)
// but have their own curvePower — bloom's is lower/steeper by default so it
// visibly clears before fog fully does, rather than both bottoming out
// together. Tunable live via the "Fog/Bloom Fade" Leva panel.
export const DOOR_FOG_BLOOM_FADE_CONFIG = {
  startProgress: 0.08,
  fogCurvePower: 0.4,
  bloomCurvePower: 0.22,
  fogFarAtFullFade: 10000,
};

// Constant-speed spin for the mascot's propeller — door2.glb bakes its own
// propeller_actuallyAction, but it varies speed for a "windy" look; this
// replaces it with a plain real-time loop instead (see the useFrame in
// R3FHeroScene.tsx). Seeded from the baked clip's average rate (~1 full
// rotation every ~10.4s).
export const DOOR_PROPELLER_CONFIG = {
  speed: (2 * Math.PI) / 10.4, // radians/sec around local Y
};

export const DOOR_ENVIRONMENT_CONFIG = {
  environmentIntensity: 1,
  backgroundIntensity: 1.0,
  exposure: 1.0,
};

export const DOOR_CLOUD_CONFIG = {
  visible: true,
  opacity: 0.15,
  speed: 0,
  color: "#d4faff",
  position: { x: 0, y: -3, z: 2 },
};

// Mascot figures read as plastic because they're smooth + slightly metallic
// and reflect the environment map. Matte defaults: high roughness, no
// metalness, low env reflection. Applied to the collected mascot materials.
// Not exposed in the Leva panel — unrelated to the door2.glb/HDRI migration.
export const DOOR_MASCOT_CONFIG = {
  roughness: 1,
  metalness: 0.1,
  envMapIntensity: 0,
};

// GPU vertex-shader wind for the foliage cards (grass/leaves/flowers). Not
// exposed in the Leva panel — unrelated to the door2.glb/HDRI migration.
export const DOOR_WIND_CONFIG = {
  speed: 0.5,
  strength: 0.3,
};

// Falling-leaves particle system. Not exposed in the Leva panel — unrelated
// to the door2.glb/HDRI migration.
export const DOOR_LEAVES_CONFIG = {
  enabled: true,
  count: 15,
  fallSpeed: 0.75,
  sway: 0.5,
  size: 0.1,
  spin: 2.5,
  position: { x: 0, y: 5, z: 0 },
};
