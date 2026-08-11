// Scene-tuning constants for the /faq page's path.glb hero (mirrors the
// *_CONFIG constants baked into R3FHeroScene.tsx for door.glb — kept in its
// own file/component so the two hero scenes stay independently tunable).

export const PATH_SCROLL_DISTANCE = "+=600%";

// The Blender World's Nishita sky (elevation -1.2deg, rotation 124deg, air
// 0.225, dust 3.791, ozone 2.189, strength 1) baked to an equirectangular
// HDRI in Blender (panoramic camera at the origin, Cycles render, saved as
// .hdr) rather than approximated with drei's <Sky> — that component is
// Preetham/Hosek-Wilkie, a daytime-only atmospheric model with no twilight/
// night falloff, so it couldn't reproduce this scene's near-horizon sun
// darkening into a night sky the way real Nishita does. `rotationYDeg`
// compensates for Blender (Z-up) vs. three.js (Y-up) equirect orientation
// differing — tune by eye until the sun glow lines up with the two
// directional lights below.
export const PATH_ENVIRONMENT_MAP_CONFIG = {
  file: "/path-sky.hdr",
  background: true,
  backgroundBlurriness: 0.35,
  rotationYDeg: -77,
};

// The two Blender "Sun" objects. `position` is the direction each shines
// *from* (a three.js directionalLight aims at the origin), derived from the
// Blender object's rotation (a Sun's own position is irrelevant to Blender's
// lighting — only its rotation sets the light direction):
//   sun 1: rotation (54.147, 42.42, 10.503)deg
//   sun 2: rotation (26.841, -32.451, -42.945)deg
// Intensities are scaled to preserve the ~5.52x ratio between the two suns'
// Blender "Strength" values (1 and 5.52, both at exposure 2.136) while
// staying in this renderer's existing light-intensity range — Blender's
// physical W/m2 units don't translate 1:1 to three.js light intensity.
export const PATH_SUN_LIGHTS = [
  {
    intensity: 1.0,
    color: "#2195ff",
    position: { x: 10.118, y: 6.486, z: 8.975 },
    castShadow: false,
  },
  {
    intensity: 5.5,
    color: "#176ece",
    position: { x: -8.049, y: 11.294, z: 5.715 },
    castShadow: true,
    // Orthographic shadow-camera frustum: half-width (±) and far plane.
    // Bigger than door.glb's (5 / 50) — this scene is ~50 units deep.
    shadowSize: 12,
    shadowFar: 60,
  },
];

// Warm point light at the "EuropeanLantern" prop near the far end of the
// path (world position from path.glb — a direct child of the scene root,
// same as Camera; see R3FPathScene.tsx). The camera's baked path only
// travels as far as z≈-19.7, so this sits a bit beyond where scroll ends,
// lighting the room/interior cluster the camera approaches but doesn't
// fully reach.
export const PATH_END_LIGHT_CONFIG = {
  intensity: 8,
  color: "#ffc691",
  position: { x: 1.26, y: 4.67, z: -29.65 },
  distance: 20,
  decay: 2,
};

// path.glb has a baked-in "Camera" node with a keyframed CameraAction
// animation (unlike door.glb's static baked camera) — R3FPathScene scrubs
// that animation directly off scroll progress via AnimationMixer.setTime(),
// so the scroll path is authored in Blender rather than as constants here.

// glTF's core animation channels only cover node translation/rotation/scale
// (no camera-intrinsic channel), so an animated FOV can't be authored in
// Blender/exported — this widen-on-scroll is done here instead. Camera's own
// baked fov (from path.glb) is the start value; the boost stays at 0 until
// scrollProgress passes `startAtProgress`, ramps linearly to `endBoostDeg`
// degrees by `endAtProgress`, then holds. startAtProgress = 60/200 and
// endAtProgress = 70/200 — frames 60 and 70 of the baked camera clip's
// 200-frame sequence.
export const PATH_CAMERA_FOV_CONFIG = {
  startAtProgress: 50 / 200,
  endAtProgress: 60 / 200,
  endBoostDeg: 15,
};

// Scene is ~50 units deep (vs. door.glb's small interior) — door.glb's fog
// near/far (4 / 15.5) would fog out almost everything, so it's widened to
// match this scene's scale.
export const PATH_FOG_CONFIG = {
  enabled: true,
  color: "#10396c",
  near: 0,
  far: 60,
};

// door.glb's bloom intensity (6) was tuned around its single close-up sun
// highlight; it blows out this scene's larger sky/sun. Toned down.
export const PATH_BLOOM_CONFIG = {
  intensity: 1.2,
  luminanceThreshold: 0.8,
  mipmapBlur: true,
};

export const PATH_ENVIRONMENT_CONFIG = {
  environmentIntensity: 1.0,
  backgroundIntensity: 1.0,
  exposure: 1,
};

export const PATH_AMBIENT_LIGHT_CONFIG = {
  intensity: 0,
};

export const PATH_CLOUD_CONFIG = {
  visible: false,
  opacity: 0.15,
  speed: 0,
  color: "#d4faff",
  position: { x: 0, y: -3, z: 2 },
};

// GPU vertex-shader wind for the foliage cards (grass/flowers). See
// R3FHeroScene.tsx's WIND_CONFIG for how this is applied.
export const PATH_WIND_CONFIG = {
  speed: 0.5,
  strength: 0.3,
};
