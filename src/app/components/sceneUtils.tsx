"use client";

// Shared helpers between R3FHeroScene.tsx and R3FPathScene.tsx — pulled out
// because these bits are identical copy-paste between the two scenes despite
// their lighting/camera/animation logic being deliberately kept independent
// (see the doc comments in each R3F*Scene.tsx for why). Nothing here is
// scene-specific; each piece is a small, self-contained utility.

import * as THREE from "three";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useControls, useCreateStore, button, LevaPanel } from "leva";

type LevaStore = ReturnType<typeof useCreateStore>;

export const SCENE_CAMERA_FOV = 35;
export const SCENE_CAMERA_NEAR = 0.1;
export const PARALLAX_STRENGTH = 0.22;
export const PARALLAX_LERP = 0.08;

export const isDevEnvironment = process.env.NODE_ENV !== "production";

// ---- Foliage cards (grass/leaves/flowers) ----

// Foliage cards are alpha-cutout: most export as alphaMode MASK (alphaTest
// set, transparent=false), some as BLEND (transparent=true). Match either.
export function isFoliageMaterial(mat: THREE.MeshStandardMaterial) {
  return !!mat.map && (mat.transparent || mat.alphaTest > 0);
}

// BLEND sorts whole planes by centroid, so a card behind can paint over one
// in front. Convert to alpha clip (writes depth + per-pixel discard) for
// correct ordering (MASK cards are already alpha clip). Also injects a GPU
// wind displacement: verts sway by a sin() weighted by height above the mesh
// base, so tips sway and roots stay planted; per-plant phase from world
// position. Height (not uv.y) is the robust signal — the grass is one merged
// cluster whose UVs don't run 0→1 per blade.
export function applyFoliageWind(
  mesh: THREE.Mesh,
  mat: THREE.MeshStandardMaterial,
  windUniform: { value: number },
  windConfig: { speed: number; strength: number }
) {
  if (mat.transparent) {
    mat.transparent = false;
    mat.alphaTest = 0.5;
    mat.depthWrite = true;
  }

  mesh.geometry.computeBoundingBox();
  const windBox = mesh.geometry.boundingBox;
  const windBaseY = windBox ? windBox.min.y : 0;
  const windSpanY = windBox ? Math.max(windBox.max.y - windBox.min.y, 1e-4) : 1;

  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uWindTime = windUniform;
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nuniform float uWindTime;"
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        {
          vec4 windWorld = modelMatrix * vec4(transformed, 1.0);
          float windPhase = uWindTime * ${windConfig.speed.toFixed(3)} + (windWorld.x + windWorld.z) * 0.7;
          float windWeight = clamp((position.y - ${windBaseY.toFixed(4)}) / ${windSpanY.toFixed(4)}, 0.0, 1.0);
          transformed.x += sin(windPhase) * ${windConfig.strength.toFixed(3)} * windWeight;
          transformed.z += cos(windPhase * 0.8) * ${(windConfig.strength * 0.5).toFixed(3)} * windWeight;
        }`
      );
  };
  mat.needsUpdate = true;
}

// ---- Pointer parallax ----

// Subtle pointer-follow drift for a scene's whole content group. Returns a
// ref to attach to the <group> that should drift. `extraInvalidateCheck` lets
// a caller keep the demand-frameloop alive for its own reasons (e.g. cloud
// drift) without this hook needing to know about them.
export function useParallaxGroup(
  strength = PARALLAX_STRENGTH,
  lerpAmount = PARALLAX_LERP,
  extraInvalidateCheck?: () => boolean
) {
  const { invalidate } = useThree();
  const groupRef = useRef<THREE.Group | null>(null);
  const targetRef = useRef(new THREE.Vector2(0, 0));
  const offsetRef = useRef(new THREE.Vector2(0, 0));

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const x = (event.clientX / window.innerWidth) * 2 - 1;
      const y = (event.clientY / window.innerHeight) * 2 - 1;
      targetRef.current.set(x, y);
      invalidate();
    };

    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    return () => window.removeEventListener("pointermove", handlePointerMove);
  }, [invalidate]);

  useFrame(() => {
    const target = targetRef.current;
    const offset = offsetRef.current;
    offset.lerp(target, lerpAmount);

    if (groupRef.current) {
      groupRef.current.position.x = offset.x * strength;
      groupRef.current.position.y = -offset.y * strength;
    }

    if (
      (extraInvalidateCheck && extraInvalidateCheck()) ||
      Math.abs(target.x - offset.x) > 0.001 ||
      Math.abs(target.y - offset.y) > 0.001
    ) {
      invalidate();
    }
  });

  return groupRef;
}

// ---- Decorative clouds ----

// drei's <Cloud> material doesn't expose opacity/depthWrite as props, so it's
// set by traversing the rendered meshes directly once mounted. `ready` is for
// clouds that mount conditionally (e.g. lazy-loaded past some scroll
// threshold) — cloudsRef itself never changes identity, so without this the
// effect has no dependency to re-fire on once cloudsRef.current actually
// becomes non-null; defaults to true for clouds that are always mounted.
export function useCloudOpacity(
  cloudsRef: React.RefObject<THREE.Group | null>,
  opacity: number,
  ready = true
) {
  const { invalidate } = useThree();
  useEffect(() => {
    if (!ready || !cloudsRef.current) return;
    const applyOpacity = (mat: THREE.Material | null | undefined) => {
      if (!mat) return;
      mat.transparent = true;
      (mat as THREE.Material & { opacity: number }).opacity = opacity;
      (mat as THREE.Material & { depthWrite: boolean }).depthWrite = false;
    };
    cloudsRef.current.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      const material = child.material;
      if (Array.isArray(material)) {
        material.forEach(applyOpacity);
      } else {
        applyOpacity(material);
      }
    });
    invalidate();
  }, [cloudsRef, opacity, ready, invalidate]);
}

// ---- Baked-animation scrubbing ----

// A clip is matched to a node by its tracks' PropertyBinding path
// ("NodeName.property", three.js's own track-naming convention) rather than
// the clip's own name — Blender auto-suffixes duplicate action names
// (".001", ...) on re-export, but the track's node reference stays stable.
export function findClipForNode(clips: THREE.AnimationClip[], nodeName: string) {
  return clips.find((clip) => clip.tracks.some((track) => track.name.startsWith(`${nodeName}.`))) ?? null;
}

// LoopRepeat (the default) wraps time===duration back to 0 — scrubbing to
// exactly scrollProgress 1 would snap back to the start pose. LoopOnce +
// clampWhenFinished holds the last frame instead.
export function createScrubbableAction(mixer: THREE.AnimationMixer, clip: THREE.AnimationClip) {
  const action = mixer.clipAction(clip);
  action.loop = THREE.LoopOnce;
  action.clampWhenFinished = true;
  action.play();
  return action;
}

// A finished LoopOnce action (see createScrubbableAction) auto-pauses, and a
// paused action's timeScale reads as 0 — so a *subsequent* setTime() call
// would compute a zero delta and freeze it wherever it last was. Un-pausing
// every action before each scrub keeps the mixer fully seekable in both
// directions.
export function scrubMixer(
  mixer: THREE.AnimationMixer,
  actions: THREE.AnimationAction[],
  duration: number,
  progress: number
) {
  actions.forEach((action) => {
    action.paused = false;
  });
  mixer.setTime(progress * duration);
}

// ---- Misc scene wiring ----

export function useScrollTriggerRefreshOnResize() {
  const { invalidate } = useThree();
  useEffect(() => {
    const handleResize = () => {
      ScrollTrigger.refresh();
      invalidate();
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [invalidate]);
}

// Leva freezes a button's onClick at the render it was created in, so a
// callback closing directly over the panel's control values would keep
// logging that first render's (initial, unedited) values forever. Routing
// through a ref instead — refreshed every render, read at click time — makes
// the button always report the latest panel state.
export function useLevaExportButton(
  store: LevaStore,
  configFileName: string,
  snapshot: Record<string, unknown>
) {
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;

  useControls(
    "Export",
    {
      "Log current values": button(() => {
        console.log(
          `${configFileName} values:\n` + JSON.stringify(snapshotRef.current, null, 2)
        );
      }),
    },
    { store }
  );
}

// Leva doesn't portal itself, so mounting it inside a scene's canvas wrapper
// (an `absolute` + `z-0` ancestor in page.tsx, which forms its own stacking
// context) traps its z-index under the nav. Portal it straight to <body> so
// it always sits on top regardless of where the scene is placed.
export function DevLevaPanel({ store, title }: { store: LevaStore; title: string }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) return null;
  return createPortal(
    <LevaPanel store={store} collapsed hidden={!isDevEnvironment} titleBar={{ title }} />,
    document.body
  );
}

// Shared <Canvas> setup — only `far` varies meaningfully per scene (door's
// small interior vs. path's ~50-unit-deep walkway). Note: this must be a
// sibling of <DevLevaPanel>, not a parent — R3F's <Canvas> reconciler only
// expects three.js objects as children, and DevLevaPanel portals straight to
// <body> rather than rendering into the scene graph.
export function SceneCanvas({
  far,
  children,
}: {
  far: number;
  children: React.ReactNode;
}) {
  return (
    <Canvas
      dpr={[1, 1.5]}
      frameloop="demand"
      shadows
      camera={{
        fov: SCENE_CAMERA_FOV,
        near: SCENE_CAMERA_NEAR,
        far,
      }}
      gl={{
        antialias: true,
        alpha: true,
        outputColorSpace: THREE.SRGBColorSpace,
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 1.0,
      }}
      onCreated={({ gl }) => {
        gl.shadowMap.enabled = true;
        gl.shadowMap.type = THREE.VSMShadowMap;
      }}
    >
      {children}
    </Canvas>
  );
}
