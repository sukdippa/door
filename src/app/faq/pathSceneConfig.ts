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

// Screen-space "portal swirl" flourish (radial blur + chromatic aberration +
// vignette + warm flash, see PortalSwirlEffect.tsx) — NOT a scene transition.
// path.glb's baked camera path currently ends short of the mascot/lantern
// cluster (see PATH_END_LIGHT_CONFIG) but still faces roughly straight at it
// (near-zero yaw at the final keyframe), so this just ramps in as that
// cluster fills the frame and settles back out by the end of scroll — no
// second scene to crossfade into yet. If a destination scene gets added
// later (past the mascots, with the camera clip re-baked in Blender to
// actually reach it), widen `endAtProgress` toward the new scroll range's
// end and pair this with an opacity crossfade like scroll-scene's
// setGroupOpacity, timed to the same window.
export const PATH_PORTAL_CONFIG = {
  startAtProgress: 0.85,
  endAtProgress: 1.0,
  strength: 1.0,
};

// path.glb has a baked-in "Camera" node with a keyframed CameraAction
// animation (unlike door.glb's static baked camera) — R3FPathScene scrubs
// that animation directly off scroll progress via AnimationMixer.setTime(),
// so the scroll path is authored in Blender rather than as constants here.

// "Sun.002" is a small visible sun-disc mesh (a sphere, not a light — the two
// actual PATH_SUN_LIGHTS directional lights above don't correspond to any GLB
// node). It used to have its own baked rise animation ("Sun.002Action"), but
// that clip is gone as of the latest path.glb re-export (the node now just
// sits at its risen resting position) and, per a console warning
// ("Instancing is not currently supported for animated models") the baked
// version may never have reliably played anyway. So this rise is done in
// code instead, same approach as DOOR_PROPELLER_CONFIG replacing a baked
// clip in doorSceneConfig.ts: R3FPathScene finds "Sun.002" by name, treats
// its current (risen) position.y as the resting value, and lerps up from
// `riseOffset` below that over the given progress window.
export const PATH_SUN_RISE_CONFIG = {
  startAtProgress: 0.75,
  endAtProgress: 1.0,
  riseOffset: -6,
};

// glTF's core animation channels only cover node translation/rotation/scale
// (no camera-intrinsic channel), so an animated FOV can't be authored in
// Blender/exported — this widen-on-scroll is done here instead. Camera's own
// baked fov (from path.glb) is the start value; the boost stays at 0 until
// scrollProgress passes `startAtProgress`, ramps linearly to `endBoostDeg`
// degrees by `endAtProgress`, then holds. startAtProgress = 60/300 and
// endAtProgress = 70/300 — frames 60 and 70 of the baked camera clip's
// 300-frame sequence.
export const PATH_CAMERA_FOV_CONFIG = {
  startAtProgress: 50 / 300,
  endAtProgress: 60 / 300,
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

// Low ground-fog puffs around "Cube.009" (world position from path.glb — the
// bridge/water area near the far end of the path, same cluster as the other
// Cube.00x meshes around z≈-58 to -72). Separate from PATH_CLOUD_CONFIG's sky
// clouds — flatter, lower, meant to read as a thin mist over water rather
// than sky (kept sparse/low-opacity on purpose — several puffs' alpha
// compounds where they overlap, so this reads much denser in-scene than the
// opacity value alone suggests; see the wide spacing between puffs in
// R3FPathScene.tsx). Lazy-mounted in R3FPathScene.tsx once scroll reaches
// the portal window (see PATH_PORTAL_CONFIG) rather than for the whole
// scroll, so it isn't paying for cloud geometry/materials before the user
// ever scrolls that far.
export const PATH_BRIDGE_FOG_CONFIG = {
  position: { x: -1.63, y: -0.13, z: -62.33 },
  opacity: 0.12,
  color: "#dfeaf2",
  speed: 0.05,
};
