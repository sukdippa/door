"use client";

// door2.glb replaces door.glb's in-browser scroll math (camera dolly offset
// from a static baked camera, gsap-tweened door_inner.rotation.y) with baked
// keyframe animations — a "CameraAction" (camera translation) and a
// "door_innerAction" (door swinging open), scrubbed together directly off
// scroll progress via AnimationMixer.setTime(), same approach as
// R3FPathScene.tsx. door2.glb also bakes a "propeller_actuallyAction" for
// the mascot's propeller, but that's replaced with a plain constant-speed
// spin (see DOOR_PROPELLER_CONFIG) rather than played back — the baked
// version varies speed for a "windy" look, which read as unwanted rather
// than intentional.

import * as THREE from "three";
import { useCallback, useEffect, useMemo, useRef, Suspense, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Cloud, Clouds, useGLTF } from "@react-three/drei";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useControls, useCreateStore } from "leva";
import {
  applyFoliageWind,
  createScrubbableAction,
  DevLevaPanel,
  findClipForNode,
  isFoliageMaterial,
  scrubMixer,
  SceneCanvas,
  useCloudOpacity,
  useLevaExportButton,
  useParallaxGroup,
  useScrollTriggerRefreshOnResize,
} from "../components/sceneUtils";
import {
  DOOR_SCROLL_DISTANCE,
  DOOR_SUN_LIGHT_CONFIG,
  DOOR_AMBIENT_LIGHT_CONFIG,
  DOOR_FRONT_SPOT_CONFIG,
  DOOR_FOG_CONFIG,
  DOOR_BLOOM_CONFIG,
  DOOR_FOG_BLOOM_FADE_CONFIG,
  DOOR_PROPELLER_CONFIG,
  DOOR_ENVIRONMENT_CONFIG,
  DOOR_CLOUD_CONFIG,
  DOOR_MASCOT_CONFIG,
  DOOR_WIND_CONFIG,
  DOOR_LEAVES_CONFIG,
} from "./doorSceneConfig";

type HeroSceneProps = {
  modelUrl: string;
  triggerId: string;
  className?: string;
};

type Vec3 = { x: number; y: number; z: number };

const CAMERA_FAR = 100;
const MAX_LEAVES = 24; // InstancedMesh capacity; DOOR_LEAVES_CONFIG.count must stay <= this

// Live-tunable values, sourced from the Leva panel in R3FHeroScene below (the
// doorSceneConfig.ts constants are only the panel's *initial* values — hit
// "Log current values" in the Export folder to print a doorSceneConfig.ts-
// shaped object to the console, then copy the tuned numbers back in and
// remove the panel, matching R3FPathScene.tsx's "formerly Leva" convention).
type SunLevaConfig = {
  intensity: number;
  color: string;
  position: Vec3;
  shadowSize: number;
  shadowFar: number;
};
type AmbientLevaConfig = { intensity: number };
type FrontSpotLevaConfig = {
  intensity: number;
  color: string;
  position: Vec3;
  angle: number;
  penumbra: number;
  decay: number;
};
type FogLevaConfig = { enabled: boolean; color: string; near: number; far: number };
type BloomLevaConfig = { intensity: number; luminanceThreshold: number; mipmapBlur: boolean };
type FogBloomFadeLevaConfig = {
  startProgress: number;
  fogCurvePower: number;
  bloomCurvePower: number;
  fogFarAtFullFade: number;
};

type DoorSceneContentProps = HeroSceneProps & {
  sunCtl: SunLevaConfig;
  ambientCtl: AmbientLevaConfig;
  frontSpotCtl: FrontSpotLevaConfig;
  fogCtl: FogLevaConfig;
  bloomCtl: BloomLevaConfig;
  fadeCtl: FogBloomFadeLevaConfig;
};

type Leaf = {
  x: number;
  z: number;
  y: number;
  phase: number;
  swayFreq: number;
  swayAmp: number;
  fallMul: number;
  scaleMul: number;
  rx: number;
  ry: number;
  rz: number;
  spinX: number;
  spinY: number;
  spinZ: number;
};

type FallingLeavesProps = {
  texture: THREE.Texture;
  region: THREE.Box3;
  scrollProgressRef: React.RefObject<number>;
};

// Sparse falling-leaves particle system: one InstancedMesh of alpha-tested
// quads, animated per-instance in a single useFrame. Because the canvas uses
// frameloop="demand", it invalidates each active frame and stops (letting the
// loop rest) once the hero has been scrolled past.
function FallingLeaves({ texture, region, scrollProgressRef }: FallingLeavesProps) {
  const { invalidate } = useThree();
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  const ctl = DOOR_LEAVES_CONFIG;

  const geometry = useMemo(() => {
    const g = new THREE.PlaneGeometry(1, 1);
    // Per-instance opacity, driven each frame for the fade-out.
    g.setAttribute(
      "aOpacity",
      new THREE.InstancedBufferAttribute(new Float32Array(MAX_LEAVES).fill(1), 1)
    );
    return g;
  }, []);
  const material = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({
      map: texture,
      alphaTest: 0.5, // keeps the leaf cutout crisp
      transparent: true, // needed so the per-instance fade takes effect
      depthWrite: true,
      side: THREE.DoubleSide,
      roughness: 0.85,
      metalness: 0,
    });
    // Inject the per-instance opacity: alphaTest still discards outside the leaf
    // shape, then we multiply the final alpha by aOpacity for the fade.
    m.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          "#include <common>\nattribute float aOpacity;\nvarying float vLeafOpacity;"
        )
        .replace(
          "#include <begin_vertex>",
          "#include <begin_vertex>\nvLeafOpacity = aOpacity;"
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          "#include <common>\nvarying float vLeafOpacity;"
        )
        .replace(
          "#include <opaque_fragment>",
          "#include <opaque_fragment>\ngl_FragColor.a *= vLeafOpacity;"
        );
    };
    return m;
  }, [texture]);

  const spawn = useMemo(() => {
    const { min, max } = region;
    const topY = max.y + 0.3;
    // Fall ~4x the tree height before respawning at the top.
    const fallDistance = (Math.max(max.y - min.y, 1) + 0.5) * 4;
    return {
      minX: min.x,
      width: Math.max(max.x - min.x, 0.5),
      minZ: min.z - 0.2,
      depth: Math.max(max.z - min.z, 0.3) + 0.4,
      topY,
      floorY: topY - fallDistance,
      fallDistance,
    };
  }, [region]);

  const leaves = useMemo<Leaf[]>(() => {
    const rangeY = spawn.topY - spawn.floorY;
    return Array.from({ length: ctl.count }, () => ({
      x: spawn.minX + Math.random() * spawn.width,
      z: spawn.minZ + Math.random() * spawn.depth,
      y: spawn.topY - Math.random() * rangeY,
      phase: Math.random() * Math.PI * 2,
      swayFreq: 0.5 + Math.random(),
      swayAmp: 0.5 + Math.random() * 0.8,
      fallMul: 0.7 + Math.random() * 0.6,
      scaleMul: 0.7 + Math.random() * 0.6,
      rx: Math.random() * Math.PI * 2,
      ry: Math.random() * Math.PI * 2,
      rz: Math.random() * Math.PI * 2,
      spinX: (Math.random() - 0.5) * 1.2,
      spinY: (Math.random() - 0.5) * 1.2,
      spinZ: (Math.random() - 0.5) * 0.8,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctl.count, spawn]);

  // Fade in briefly at the top (no pop on respawn) and out near the bottom.
  const opacityFor = useMemo(() => {
    return (y: number) => {
      const p = (y - spawn.floorY) / spawn.fallDistance; // 0 at floor .. 1 at top
      return Math.min(
        THREE.MathUtils.clamp(p / 0.25, 0, 1),
        THREE.MathUtils.clamp((1 - p) / 0.08, 0, 1)
      );
    };
  }, [spawn]);

  // Seed initial matrices/opacity so nothing flashes at the origin or full alpha.
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    mesh.count = leaves.length;
    const opacityAttr = mesh.geometry.getAttribute("aOpacity") as THREE.InstancedBufferAttribute;
    leaves.forEach((l, i) => {
      dummy.position.set(l.x, l.y, l.z);
      dummy.rotation.set(l.rx, l.ry, l.rz);
      dummy.scale.setScalar(ctl.size * l.scaleMul);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      opacityAttr.setX(i, opacityFor(l.y));
    });
    mesh.instanceMatrix.needsUpdate = true;
    opacityAttr.needsUpdate = true;
    invalidate();
  }, [leaves, dummy, ctl.size, opacityFor, invalidate]);

  useFrame((state, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    // Only run during the hero; once scrolled past, stop (camera has moved
    // through the door anyway) so the demand loop can idle.
    const active = ctl.enabled && scrollProgressRef.current < 0.92;
    if (mesh.visible !== active) mesh.visible = active;
    if (!active) return;

    const dt = Math.min(delta, 0.05); // clamp after idle gaps
    const t = state.clock.elapsedTime;
    const opacityAttr = mesh.geometry.getAttribute("aOpacity") as THREE.InstancedBufferAttribute;
    for (let i = 0; i < leaves.length; i++) {
      const l = leaves[i];
      l.y -= ctl.fallSpeed * l.fallMul * dt;
      if (l.y < spawn.floorY) {
        l.y = spawn.topY;
        l.x = spawn.minX + Math.random() * spawn.width;
        l.z = spawn.minZ + Math.random() * spawn.depth;
      }
      const swayX = Math.sin(t * l.swayFreq + l.phase) * ctl.sway * l.swayAmp;
      const swayZ = Math.cos(t * l.swayFreq * 0.8 + l.phase) * ctl.sway * l.swayAmp * 0.5;
      dummy.position.set(l.x + swayX, l.y, l.z + swayZ);
      dummy.rotation.set(
        l.rx + t * l.spinX * ctl.spin,
        l.ry + t * l.spinY * ctl.spin,
        l.rz + t * l.spinZ * ctl.spin
      );
      dummy.scale.setScalar(ctl.size * l.scaleMul);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      opacityAttr.setX(i, opacityFor(l.y));
    }
    mesh.instanceMatrix.needsUpdate = true;
    opacityAttr.needsUpdate = true;
    invalidate();
  });

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, MAX_LEAVES]}
      position={[ctl.position.x, ctl.position.y, ctl.position.z]}
      frustumCulled={false}
    />
  );
}

function DoorSceneContent({
  modelUrl,
  triggerId,
  sunCtl,
  ambientCtl,
  frontSpotCtl,
  fogCtl,
  bloomCtl,
  fadeCtl,
}: DoorSceneContentProps) {
  const { camera, invalidate, scene, gl } = useThree();
  const { scene: gltfScene, animations } = useGLTF(modelUrl);
  const [hasSceneLights, setHasSceneLights] = useState(false);
  // Bumped once the traverse has collected mascot materials, so the de-plastic
  // effect (defined earlier) re-runs against a populated set on first load.
  const [mascotsCollected, setMascotsCollected] = useState(0);
  // Faded bloom intensity (see applyCameraKeyframe/DOOR_FOG_BLOOM_FADE_CONFIG).
  // State, not a ref — @react-three/postprocessing's <Bloom> wrapper doesn't
  // accept a ref safely (it spreads unrecognized props, including `ref` in
  // React 19, into a `JSON.stringify(props)` memo key, which throws once
  // ref.current holds a real Object3D with circular parent/children refs).
  const [bloomIntensity, setBloomIntensity] = useState(bloomCtl.intensity);
  const [leafData, setLeafData] = useState<{
    texture: THREE.Texture | null;
    region: THREE.Box3 | null;
  }>({ texture: null, region: null });
  const dirLightRef = useRef<THREE.DirectionalLight | null>(null);
  // Mascot materials collected during the GLB traverse, so the matte-material
  // effect can retune them once they're known.
  const mascotMaterialsRef = useRef<Set<THREE.MeshStandardMaterial>>(new Set());
  // Shared wind clock uniform — one object referenced by every foliage material,
  // advanced once per frame so all cards sway off the same time base.
  const windUniform = useMemo(() => ({ value: 0 }), []);
  const cloudsRef = useRef<THREE.Group | null>(null);
  const parallaxGroupRef = useParallaxGroup();
  // The GLB's baked "Camera" (translation) and "door_inner" (rotation)
  // animations — scrubbed together off scroll progress via one shared
  // AnimationMixer, on a SHARED absolute timeline (the camera clip's own
  // duration — it's the longer of the two). Both actions play unscaled
  // against that same clock, exactly as authored in Blender: door_inner's
  // clip (2.5s) is much shorter than the camera's (8.33s), so it finishes
  // opening well before the camera does and then holds (LoopOnce +
  // clampWhenFinished) for the rest of the scroll — it does NOT get
  // independently stretched to span the full scroll range (an earlier
  // version of this scaled each action's timeScale to its own clip
  // duration, which desynced door_inner from the camera and made the door
  // open in slow motion, barely rotating before the camera flew past it).
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const masterDurationRef = useRef(0);
  // Both actions on that mixer — reset to unpaused before every setTime()
  // call (see applyCameraKeyframe) so scrubbing back down after reaching
  // progress 1 doesn't get stuck.
  const scrubbedActionsRef = useRef<THREE.AnimationAction[]>([]);
  const animatedCameraRef = useRef<THREE.Object3D | null>(null);
  // The mascot's propeller — spins at a constant real-time rate, unrelated
  // to scroll and to its own (variable-speed, "windy") baked animation; see
  // the useFrame below.
  const propellerRef = useRef<THREE.Object3D | null>(null);
  const scrollProgressRef = useRef(0);
  // Fog fade target — mutated directly (THREE.Fog is a plain object on
  // `scene.fog`, not JSX-managed, so no re-render risk here). Bloom's fade
  // goes through the bloomIntensity state above instead (see its comment).
  const fogRef = useRef<THREE.Fog | null>(null);

  // Scrub the baked camera + door_inner animations to `progress` (0..1, each
  // over its own clip's full duration) and copy the camera's local
  // position/rotation onto the render camera. Local (not world) space: the
  // Camera node is a direct child of the scene root, and using local space
  // keeps this independent of the parallax group's pointer-driven offset
  // below (that's a rendering trick over the whole scene, not part of the
  // authored camera path). Also fades fog/bloom to 0 over the back
  // three-quarters of the path (see DOOR_FOG_BLOOM_FADE_CONFIG).
  const applyCameraKeyframe = useCallback((progress: number) => {
    const mixer = mixerRef.current;
    const animatedCamera = animatedCameraRef.current;
    if (!mixer || !animatedCamera) return;
    scrubMixer(mixer, scrubbedActionsRef.current, masterDurationRef.current, progress);
    camera.position.copy(animatedCamera.position);
    camera.quaternion.copy(animatedCamera.quaternion);

    const fadeLinear = THREE.MathUtils.clamp(
      (progress - fadeCtl.startProgress) / Math.max(1 - fadeCtl.startProgress, 1e-4),
      0,
      1
    );
    // curvePower < 1 front-loads the ramp (rises faster than linear near 0)
    // so a fade feels like it kicks in sooner without startProgress having
    // to go below 0 (which scroll progress itself can't do either). Bloom's
    // is lower/steeper by default so it visibly clears before fog does.
    const fogFadeT = Math.pow(fadeLinear, fadeCtl.fogCurvePower);
    const bloomFadeT = Math.pow(fadeLinear, fadeCtl.bloomCurvePower);
    if (fogRef.current) {
      // THREE.Fog has no opacity scalar — push `far` out instead. But fog
      // opacity at a given distance d is ~(far-d)/(far-near): a plain lerp
      // toward a huge target clears any on-screen depth within the first
      // few percent of fogFadeT, so it reads as an instant snap, not a fade.
      // Scaling by 1/(1-fogFadeT) instead grows `far` smoothly (visually
      // closer to linear) and only reaches the clamp right at fogFadeT=1.
      const farScale = 1 / Math.max(1 - fogFadeT, 1e-4);
      fogRef.current.far = Math.min(fogCtl.far * farScale, fadeCtl.fogFarAtFullFade);
    }
    setBloomIntensity(THREE.MathUtils.lerp(bloomCtl.intensity, 0, bloomFadeT));
  }, [
    camera,
    fogCtl.far,
    bloomCtl.intensity,
    fadeCtl.startProgress,
    fadeCtl.fogCurvePower,
    fadeCtl.bloomCurvePower,
    fadeCtl.fogFarAtFullFade,
  ]);

  // Re-sync the faded value whenever the Leva base intensity changes (e.g.
  // dragging the "Bloom" panel) rather than leaving it stuck at a stale fade.
  useEffect(() => {
    applyCameraKeyframe(scrollProgressRef.current);
  }, [bloomCtl.intensity, applyCameraKeyframe]);

  // R3F writes the custom shadow-camera bounds but doesn't recompute the ortho
  // projection matrix — without this the frustum stays at three's ±5 default.
  useEffect(() => {
    const light = dirLightRef.current;
    if (!light) return;
    light.shadow.camera.updateProjectionMatrix();
    invalidate();
  }, [sunCtl.shadowSize, sunCtl.shadowFar, invalidate]);

  // Advance the shared wind clock and the propeller's real-time spin. Gated
  // to the hero (same as the falling leaves) so the demand loop still idles
  // once scrolled past.
  useFrame((state, delta) => {
    if (scrollProgressRef.current >= 0.92) return;
    windUniform.value = state.clock.elapsedTime;
    if (propellerRef.current) {
      propellerRef.current.rotation.y += DOOR_PROPELLER_CONFIG.speed * delta;
    }
    invalidate();
  });

  useEffect(() => {
    const animatedCamera = gltfScene.getObjectByName("Camera");
    animatedCameraRef.current = animatedCamera ?? null;

    if (animatedCamera instanceof THREE.PerspectiveCamera && camera instanceof THREE.PerspectiveCamera) {
      camera.fov = animatedCamera.fov;
      camera.near = animatedCamera.near;
      camera.far = animatedCamera.far;
    }

    const cameraClip = findClipForNode(animations, "Camera");
    const doorClip = findClipForNode(animations, "door_inner");

    if (animatedCamera && cameraClip && doorClip) {
      const mixer = new THREE.AnimationMixer(gltfScene);
      // No per-clip timeScale — both actions share the camera's own duration
      // as the timeline (set below), matching Blender (paused is reset
      // before every scrub — see applyCameraKeyframe).
      scrubbedActionsRef.current = [cameraClip, doorClip].map((clip) =>
        createScrubbableAction(mixer, clip)
      );
      mixerRef.current = mixer;
      masterDurationRef.current = cameraClip.duration;
    } else {
      console.warn("door2.glb: missing baked Camera/door_inner animation — scroll won't drive them.");
      mixerRef.current = null;
      scrubbedActionsRef.current = [];
      masterDurationRef.current = 0;
    }

    // Constant-speed spin (not the baked propeller_actuallyAction, which
    // varies speed for a "windy" look) — see the useFrame below.
    propellerRef.current = gltfScene.getObjectByName("propeller_actually") ?? null;

    camera.updateProjectionMatrix();
    applyCameraKeyframe(scrollProgressRef.current);

    let hasLight = false;
    let leafTexture: THREE.Texture | null = null;
    mascotMaterialsRef.current.clear();
    gltfScene.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach((mat) => {
          if (!(mat instanceof THREE.MeshStandardMaterial)) return;
          mat.envMapIntensity = 1;
          // Mascot parts all carry Blender-default names (head/ears/antlers/
          // shirt/hat/body/propeller/Material.###/PaletteMaterial###); scene
          // props use descriptive names. Collect the mascots so the matte
          // pass can de-plastic them (raise roughness, kill metalness, drop
          // env reflections).
          if (/head|ears|antlers|shirt|hat|body|propeller|^material\.|^palettematerial/i.test(mat.name)) {
            mascotMaterialsRef.current.add(mat);
          }
          if (isFoliageMaterial(mat)) {
            applyFoliageWind(child, mat, windUniform, DOOR_WIND_CONFIG);
          }
          // Grab the single-leaf texture off the tree's "leaf bush" material to
          // reuse for the falling-leaves particles (keeps the art consistent).
          if (!leafTexture && mat.map && /bush/i.test(mat.name)) {
            leafTexture = mat.map;
          }
        });
      }
      if (child instanceof THREE.Light) {
        hasLight = true;
      }
    });

    setHasSceneLights(hasLight);
    setMascotsCollected((n) => n + 1);

    // Spawn volume for falling leaves = combined bounds of the front trees.
    // door2.glb's tree objects are named "tree-leaves"/"tree-branch" (its
    // mesh *data* is still "tree"/"tree.001", inherited from door.glb, but
    // the object/node names — what getObjectByName reads — differ).
    gltfScene.updateMatrixWorld(true);
    const region = new THREE.Box3();
    let hasRegion = false;
    ["tree-leaves", "tree-branch"].forEach((name) => {
      const node = gltfScene.getObjectByName(name);
      if (node) {
        region.expandByObject(node);
        hasRegion = true;
      }
    });
    setLeafData({ texture: leafTexture, region: hasRegion ? region : null });

    invalidate();
  }, [gltfScene, animations, invalidate, camera, windUniform, applyCameraKeyframe]);

  // Apply the matte mascot material settings once the traverse has collected
  // them (see DOOR_MASCOT_CONFIG — fixes the plastic-looking reflections).
  useEffect(() => {
    mascotMaterialsRef.current.forEach((mat) => {
      mat.roughness = DOOR_MASCOT_CONFIG.roughness;
      mat.metalness = DOOR_MASCOT_CONFIG.metalness;
      mat.envMapIntensity = DOOR_MASCOT_CONFIG.envMapIntensity;
      mat.needsUpdate = true;
    });
    invalidate();
  }, [mascotsCollected, invalidate]);

  useEffect(() => {
    const intensityScene = scene as unknown as {
      backgroundIntensity: number;
      environmentIntensity: number;
    };
    intensityScene.backgroundIntensity = DOOR_ENVIRONMENT_CONFIG.backgroundIntensity;
    intensityScene.environmentIntensity = DOOR_ENVIRONMENT_CONFIG.environmentIntensity;
    gl.toneMappingExposure = DOOR_ENVIRONMENT_CONFIG.exposure;
    invalidate();
  }, [scene, gl, invalidate]);

  useEffect(() => {
    const fog = fogCtl.enabled
      ? new THREE.Fog(new THREE.Color(fogCtl.color), fogCtl.near, fogCtl.far)
      : null;
    scene.fog = fog;
    fogRef.current = fog;
    invalidate();

    return () => {
      scene.fog = null;
      fogRef.current = null;
    };
  }, [scene, invalidate, fogCtl.enabled, fogCtl.color, fogCtl.near, fogCtl.far]);

  useEffect(() => {
    const triggerElement = document.getElementById(triggerId);
    if (!triggerElement) return;

    gsap.registerPlugin(ScrollTrigger);

    // Title image, date, Register CTA, and the arc stroke (2D overlay,
    // rendered in page.tsx — see data-scroll-fade="hero") fade out once
    // scrolled into the pin (after a slight delay, so a tiny/accidental
    // scroll doesn't yank them away) and back in when scrolled back up.
    // Driven from THIS ScrollTrigger's onUpdate rather than a separate one:
    // a second independent ScrollTrigger on the same pinned trigger element
    // fought with this one during GSAP's internal refresh (when the second
    // trigger initializes, layout shifts from this one's pin-spacer
    // insertion left the other stuck on a stale/wrong progress value with
    // zero scroll ever happening) — so this is the single source of truth
    // for scroll progress on this section.
    const heroFadeElements = Array.from(
      document.querySelectorAll<HTMLElement>("[data-scroll-fade='hero']")
    );
    const HERO_FADE_START_PROGRESS = 0.15;
    const HERO_FADE_END_PROGRESS = 0.25;

    // No tween needed — the camera/door path comes from scrubbing door2.glb's
    // baked animations (applyCameraKeyframe) directly off scroll progress.
    // `scrub: 1` still smooths that progress value itself.
    const trigger = ScrollTrigger.create({
      trigger: triggerElement,
      start: "top top",
      end: DOOR_SCROLL_DISTANCE,
      scrub: 1,
      pin: true,
      anticipatePin: 1,
      onUpdate: (self) => {
        scrollProgressRef.current = self.progress;
        applyCameraKeyframe(self.progress);

        const fadeT = THREE.MathUtils.clamp(
          (self.progress - HERO_FADE_START_PROGRESS) /
            (HERO_FADE_END_PROGRESS - HERO_FADE_START_PROGRESS),
          0,
          1
        );
        const opacity = String(1 - fadeT);
        const pointerEvents = fadeT > 0.5 ? "none" : "auto";
        heroFadeElements.forEach((el) => {
          // `.hero-reveal`'s CSS `transition: opacity 0.6s ease` would
          // otherwise fight this per-tick update, lagging the fade behind
          // actual scroll position — force it off (this only ever touches
          // opacity, so dropping the whole transition here is safe).
          el.style.transition = "none";
          el.style.opacity = opacity;
          el.style.pointerEvents = pointerEvents;
        });

        invalidate();
      },
    });

    return () => {
      trigger.kill();
    };
  }, [triggerId, invalidate, applyCameraKeyframe]);

  useScrollTriggerRefreshOnResize();
  useCloudOpacity(cloudsRef, DOOR_CLOUD_CONFIG.opacity);

  return (
    <>
      <directionalLight
        ref={dirLightRef}
        intensity={sunCtl.intensity}
        position={[sunCtl.position.x, sunCtl.position.y, sunCtl.position.z]}
        castShadow
        color={sunCtl.color}
        shadow-mapSize-width={4096}
        shadow-mapSize-height={4096}
        shadow-bias={-0.0001}
        shadow-normalBias={0.005}
        shadow-radius={10}
        shadow-camera-left={-sunCtl.shadowSize}
        shadow-camera-right={sunCtl.shadowSize}
        shadow-camera-top={sunCtl.shadowSize}
        shadow-camera-bottom={-sunCtl.shadowSize}
        shadow-camera-near={0.5}
        shadow-camera-far={sunCtl.shadowFar}
      />
      {!hasSceneLights && <ambientLight intensity={ambientCtl.intensity} />}
      <spotLight
        intensity={frontSpotCtl.intensity}
        color={frontSpotCtl.color}
        position={[frontSpotCtl.position.x, frontSpotCtl.position.y, frontSpotCtl.position.z]}
        angle={frontSpotCtl.angle}
        penumbra={frontSpotCtl.penumbra}
        decay={frontSpotCtl.decay}
      />
      <group ref={parallaxGroupRef}>
        <group
          ref={cloudsRef}
          renderOrder={-1}
          visible={DOOR_CLOUD_CONFIG.visible}
          position={[DOOR_CLOUD_CONFIG.position.x, DOOR_CLOUD_CONFIG.position.y, DOOR_CLOUD_CONFIG.position.z]}
        >
          <Clouds material={THREE.MeshLambertMaterial}>
            <Cloud bounds={[2.5, 0.6, 1]} position={[-2.2, 0.3, 0]} seed={1} speed={DOOR_CLOUD_CONFIG.speed} color={DOOR_CLOUD_CONFIG.color} />
            <Cloud bounds={[2.2, 0.5, 1]} position={[1.1, 0.8, 0.2]} seed={2} speed={DOOR_CLOUD_CONFIG.speed} color={DOOR_CLOUD_CONFIG.color} />
            <Cloud bounds={[1.6, 0.4, 1]} position={[0.2, 0.55, -0.4]} seed={3} speed={DOOR_CLOUD_CONFIG.speed} color={DOOR_CLOUD_CONFIG.color} />
          </Clouds>
        </group>
        <primitive object={gltfScene} />
        {leafData.texture && leafData.region && (
          <FallingLeaves
            texture={leafData.texture}
            region={leafData.region}
            scrollProgressRef={scrollProgressRef}
          />
        )}
      </group>
      <EffectComposer enableNormalPass>
        <Bloom
          luminanceThreshold={bloomCtl.luminanceThreshold}
          luminanceSmoothing={0}
          mipmapBlur={bloomCtl.mipmapBlur}
          intensity={bloomIntensity}
        />
      </EffectComposer>
    </>
  );
}

export default function R3FHeroScene({ modelUrl, triggerId, className = "" }: HeroSceneProps) {
  // Own Leva store — R3FPathScene.tsx uses folder names that collide with
  // this file's ("Fog", "Bloom", "Export"), and Leva's default store is a
  // single global singleton keyed by folder/control path, not scoped per
  // component. Without a dedicated store, navigating between the two scenes
  // has the newly-mounted one's useControls() read back whatever the other
  // scene's panel last held, instead of this file's doorSceneConfig.ts
  // defaults (looks like "inherits the previous scene's properties," and
  // clears on refresh because that resets the whole store).
  const store = useCreateStore();

  // Leva panel (dev-only tuning UI). doorSceneConfig.ts values seed the
  // initial state; drag the panel to iterate, then use the Export folder's
  // button to print the current values. No HDRI/Environment here — this
  // scene uses the same sun/ambient/spot rig as the pre-migration door.glb.
  const sunCtl = useControls("Sun", {
    intensity: { value: DOOR_SUN_LIGHT_CONFIG.intensity, min: 0, max: 20, step: 0.1 },
    color: DOOR_SUN_LIGHT_CONFIG.color,
    position: { value: DOOR_SUN_LIGHT_CONFIG.position, step: 0.1 },
    shadowSize: { value: DOOR_SUN_LIGHT_CONFIG.shadowSize, min: 1, max: 50 },
    shadowFar: { value: DOOR_SUN_LIGHT_CONFIG.shadowFar, min: 10, max: 300 },
  }, { store });

  const ambientCtl = useControls("Ambient", {
    intensity: { value: DOOR_AMBIENT_LIGHT_CONFIG.intensity, min: 0, max: 5, step: 0.1 },
  }, { store });

  const frontSpotCtl = useControls("Front Fill", {
    intensity: { value: DOOR_FRONT_SPOT_CONFIG.intensity, min: 0, max: 5, step: 0.1 },
    color: DOOR_FRONT_SPOT_CONFIG.color,
    position: { value: DOOR_FRONT_SPOT_CONFIG.position, step: 0.1 },
    angle: { value: DOOR_FRONT_SPOT_CONFIG.angle, min: 0, max: Math.PI / 2, step: 0.01 },
    penumbra: { value: DOOR_FRONT_SPOT_CONFIG.penumbra, min: 0, max: 1, step: 0.01 },
    decay: { value: DOOR_FRONT_SPOT_CONFIG.decay, min: 0, max: 2, step: 0.1 },
  }, { store });

  const fogCtl = useControls("Fog", {
    enabled: DOOR_FOG_CONFIG.enabled,
    color: DOOR_FOG_CONFIG.color,
    near: { value: DOOR_FOG_CONFIG.near, min: 0, max: 100 },
    far: { value: DOOR_FOG_CONFIG.far, min: 0, max: 200 },
  }, { store });

  const bloomRaw = useControls("Bloom", {
    intensity: { value: DOOR_BLOOM_CONFIG.intensity, min: 0, max: 10, step: 0.1 },
  }, { store });

  const bloomCtl: BloomLevaConfig = {
    intensity: bloomRaw.intensity,
    luminanceThreshold: DOOR_BLOOM_CONFIG.luminanceThreshold,
    mipmapBlur: DOOR_BLOOM_CONFIG.mipmapBlur,
  };

  const fadeCtl = useControls("Fog/Bloom Fade", {
    startProgress: { value: DOOR_FOG_BLOOM_FADE_CONFIG.startProgress, min: 0, max: 1, step: 0.01 },
    fogCurvePower: { value: DOOR_FOG_BLOOM_FADE_CONFIG.fogCurvePower, min: 0.1, max: 2, step: 0.05 },
    bloomCurvePower: { value: DOOR_FOG_BLOOM_FADE_CONFIG.bloomCurvePower, min: 0.1, max: 2, step: 0.05 },
    fogFarAtFullFade: { value: DOOR_FOG_BLOOM_FADE_CONFIG.fogFarAtFullFade, min: 100, max: 20000, step: 100 },
  }, { store });

  useLevaExportButton(store, "doorSceneConfig.ts", {
    DOOR_SUN_LIGHT_CONFIG: sunCtl,
    DOOR_AMBIENT_LIGHT_CONFIG: ambientCtl,
    DOOR_FRONT_SPOT_CONFIG: frontSpotCtl,
    DOOR_FOG_CONFIG: fogCtl,
    DOOR_BLOOM_CONFIG: bloomCtl,
    DOOR_FOG_BLOOM_FADE_CONFIG: fadeCtl,
  });

  return (
    <div className={`h-full w-full ${className}`} aria-hidden="true">
      <DevLevaPanel store={store} title="Door Scene" />
      <SceneCanvas far={CAMERA_FAR}>
        <Suspense fallback={null}>
          <DoorSceneContent
            modelUrl={modelUrl}
            triggerId={triggerId}
            sunCtl={sunCtl}
            ambientCtl={ambientCtl}
            frontSpotCtl={frontSpotCtl}
            fogCtl={fogCtl}
            bloomCtl={bloomCtl}
            fadeCtl={fadeCtl}
          />
        </Suspense>
      </SceneCanvas>
    </div>
  );
}
