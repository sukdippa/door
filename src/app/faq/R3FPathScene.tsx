"use client";

// Sibling of R3FHeroScene.tsx for the /faq page's path.glb hero. Deliberately
// a near-duplicate rather than a shared/parameterized component — door.glb and
// path.glb have different cameras (baked-in vs. none), lighting rigs (single
// sun vs. HDRI sky + 2 suns), and scene scale (small interior vs. a ~50-unit
// walkway), so keeping them independent avoids one scene's tuning leaking into
// the other's prop surface. See pathSceneConfig.ts for the tunable constants
// (formerly a Leva "useControls" debug panel here too — baked once the look
// was settled, same convention as R3FHeroScene.tsx's *_CONFIG constants).

import * as THREE from "three";
import { useCallback, useEffect, useMemo, useRef, Suspense, useState } from "react";
import { createPortal } from "react-dom";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Cloud, Clouds, Environment, useGLTF } from "@react-three/drei";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useControls, useCreateStore, button, LevaPanel } from "leva";
import {
  PATH_SCROLL_DISTANCE,
  PATH_ENVIRONMENT_MAP_CONFIG,
  PATH_SUN_LIGHTS,
  PATH_CAMERA_FOV_CONFIG,
  PATH_FOG_CONFIG,
  PATH_BLOOM_CONFIG,
  PATH_ENVIRONMENT_CONFIG,
  PATH_AMBIENT_LIGHT_CONFIG,
  PATH_CLOUD_CONFIG,
  PATH_WIND_CONFIG,
} from "./pathSceneConfig";

type PathSceneProps = {
  modelUrl: string;
  triggerId: string;
  className?: string;
};

type Vec3 = { x: number; y: number; z: number };

// Live-tunable values, sourced from the Leva panel in R3FPathScene below (the
// pathSceneConfig.ts constants are only the panel's *initial* values — hit
// "Log current values" in the Export folder to print a pathSceneConfig.ts-
// shaped object to the console, then copy the tuned numbers back in and
// remove the panel, matching R3FHeroScene.tsx's "formerly Leva" convention).
type EnvironmentMapLevaConfig = {
  file: string;
  background: boolean;
  backgroundBlurriness: number;
  rotationYDeg: number;
};
type SunLevaConfig = {
  intensity: number;
  color: string;
  position: Vec3;
  castShadow: boolean;
  shadowSize?: number;
  shadowFar?: number;
};
type CameraFovLevaConfig = { startAtProgress: number; endBoostDeg: number };
type FogLevaConfig = { enabled: boolean; color: string; near: number; far: number };
type BloomLevaConfig = { intensity: number; luminanceThreshold: number; mipmapBlur: boolean };

type PathSceneContentProps = PathSceneProps & {
  envMap: EnvironmentMapLevaConfig;
  sunLights: SunLevaConfig[];
  fovCtl: CameraFovLevaConfig;
  fogCtl: FogLevaConfig;
  bloomCtl: BloomLevaConfig;
};

const CAMERA_FOV = 35;
const CAMERA_NEAR = 0.1;
const CAMERA_FAR = 200;
const PARALLAX_STRENGTH = 0.22;
const PARALLAX_LERP = 0.08;

function PathSceneContent({
  modelUrl,
  triggerId,
  envMap: envMapCtl,
  sunLights,
  fovCtl,
  fogCtl,
  bloomCtl,
}: PathSceneContentProps) {
  const { camera, invalidate, scene, gl } = useThree();
  const { scene: gltfScene, animations } = useGLTF(modelUrl);
  const [hasSceneLights, setHasSceneLights] = useState(false);
  const mainSunRef = useRef<THREE.DirectionalLight | null>(null);
  // Shared wind clock uniform — one object referenced by every foliage material,
  // advanced once per frame so all cards sway off the same time base.
  const windUniform = useMemo(() => ({ value: 0 }), []);
  const cloudsRef = useRef<THREE.Group | null>(null);
  const parallaxGroupRef = useRef<THREE.Group | null>(null);
  const parallaxTargetRef = useRef(new THREE.Vector2(0, 0));
  const parallaxOffsetRef = useRef(new THREE.Vector2(0, 0));
  // The GLB's baked "Camera" node/animation — its keyframed local position
  // and rotation ARE the scroll path (see pathSceneConfig.ts's comment for
  // why this replaced a hand-authored start/end lerp). Scrubbed via
  // AnimationMixer.setTime() rather than played in real time, so scroll drives
  // it directly instead of wall-clock time.
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  // Reset to unpaused before every setTime() call (see applyCameraKeyframe)
  // so scrubbing back down after reaching progress 1 doesn't get stuck.
  const cameraActionRef = useRef<THREE.AnimationAction | null>(null);
  const animatedCameraRef = useRef<THREE.Object3D | null>(null);
  const clipDurationRef = useRef(0);
  // The GLB camera's own baked fov — the start value for the scroll-driven
  // widen effect below (glTF has no animated-fov channel, see
  // PATH_CAMERA_FOV_CONFIG's doc comment).
  const baseFovRef = useRef<number | null>(null);
  const cloudSpeedRef = useRef(0);
  const scrollProgressRef = useRef(0);

  // Scrub the baked camera animation to `progress` (0..1 over the clip's full
  // duration) and copy its local position/rotation onto the render camera.
  // Local (not world) space: the Camera node is a direct child of the scene
  // root, and using local space keeps this independent of the parallax
  // group's pointer-driven offset below (that's a rendering trick over the
  // whole scene, not part of the authored camera path). Also widens fov
  // linearly with progress on top of the baked position/rotation.
  const applyCameraKeyframe = useCallback((progress: number) => {
    const mixer = mixerRef.current;
    const animatedCamera = animatedCameraRef.current;
    if (!mixer || !animatedCamera) return;
    // LoopOnce + clampWhenFinished (see the clip setup below) pauses the
    // action once it reaches its end, and a paused action's timeScale reads
    // as 0 — so a *subsequent* setTime() call would compute a zero delta and
    // freeze it wherever it last was. Un-pause before every scrub to keep it
    // fully seekable in both directions.
    if (cameraActionRef.current) cameraActionRef.current.paused = false;
    mixer.setTime(progress * clipDurationRef.current);
    camera.position.copy(animatedCamera.position);
    camera.quaternion.copy(animatedCamera.quaternion);

    const baseFov = baseFovRef.current;
    if (baseFov !== null && camera instanceof THREE.PerspectiveCamera) {
      const widenProgress = THREE.MathUtils.clamp(
        (progress - fovCtl.startAtProgress) / Math.max(1 - fovCtl.startAtProgress, 1e-4),
        0,
        1
      );
      camera.fov = baseFov + fovCtl.endBoostDeg * widenProgress;
      camera.updateProjectionMatrix();
    }
  }, [camera, fovCtl.startAtProgress, fovCtl.endBoostDeg]);

  // ---- Baked scene-tuning values not exposed in the Leva panel ----
  const envCtl = PATH_ENVIRONMENT_CONFIG;
  const ambientCtl = PATH_AMBIENT_LIGHT_CONFIG;
  const cloudCtl = PATH_CLOUD_CONFIG;
  const shadowSun = sunLights[1];

  // R3F writes the custom shadow-camera bounds but doesn't recompute the ortho
  // projection matrix — without this the frustum stays at three's ±5 default.
  useEffect(() => {
    const light = mainSunRef.current;
    if (!light) return;
    light.shadow.camera.updateProjectionMatrix();
    invalidate();
  }, [shadowSun, invalidate]);

  // Advance the shared wind clock. Gated to the hero (same as door.glb) so
  // the demand loop still idles once scrolled past.
  useFrame((state) => {
    if (scrollProgressRef.current >= 0.92) return;
    windUniform.value = state.clock.elapsedTime;
    invalidate();
  });

  useEffect(() => {
    const animatedCamera = gltfScene.getObjectByName("Camera");
    animatedCameraRef.current = animatedCamera ?? null;
    const clip = animations[0];

    if (animatedCamera instanceof THREE.PerspectiveCamera && camera instanceof THREE.PerspectiveCamera) {
      baseFovRef.current = animatedCamera.fov;
      camera.near = animatedCamera.near;
      camera.far = animatedCamera.far;
    }

    if (animatedCamera && clip) {
      const mixer = new THREE.AnimationMixer(gltfScene);
      const action = mixer.clipAction(clip);
      // LoopRepeat (the default) wraps time===duration back to 0 — scrubbing
      // to exactly scrollProgress 1 would snap the camera back to its start
      // pose. LoopOnce + clampWhenFinished holds the last frame instead.
      action.loop = THREE.LoopOnce;
      action.clampWhenFinished = true;
      action.play();
      mixerRef.current = mixer;
      cameraActionRef.current = action;
      clipDurationRef.current = clip.duration;
    } else {
      console.warn("path.glb: no animated \"Camera\" node found — camera won't follow a scroll path.");
      mixerRef.current = null;
      cameraActionRef.current = null;
      clipDurationRef.current = 0;
    }

    camera.updateProjectionMatrix();
    applyCameraKeyframe(scrollProgressRef.current);

    let hasLight = false;
    gltfScene.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach((mat) => {
          if (!(mat instanceof THREE.MeshStandardMaterial)) return;
          mat.envMapIntensity = 1;
          // Foliage cards (grass/flowers) are alpha-cutout: most export as
          // alphaMode MASK (alphaTest set, transparent=false), some as BLEND
          // (transparent=true). Match either.
          const isFoliage = !!mat.map && (mat.transparent || mat.alphaTest > 0);
          if (isFoliage) {
            // BLEND sorts whole planes by centroid, so a card behind can paint
            // over one in front. Convert to alpha clip (writes depth + per-pixel
            // discard) for correct ordering. (MASK cards are already alpha clip.)
            if (mat.transparent) {
              mat.transparent = false;
              mat.alphaTest = 0.5;
              mat.depthWrite = true;
            }
            // GPU wind: displace verts by a sin() weighted by height above the
            // mesh base, so tips sway and roots stay planted; per-plant phase
            // from world position. Height (not uv.y) is the robust signal — the
            // grass is one merged cluster whose UVs don't run 0→1 per blade.
            child.geometry.computeBoundingBox();
            const windBox = child.geometry.boundingBox;
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
                    float windPhase = uWindTime * ${PATH_WIND_CONFIG.speed.toFixed(3)} + (windWorld.x + windWorld.z) * 0.7;
                    float windWeight = clamp((position.y - ${windBaseY.toFixed(4)}) / ${windSpanY.toFixed(4)}, 0.0, 1.0);
                    transformed.x += sin(windPhase) * ${PATH_WIND_CONFIG.strength.toFixed(3)} * windWeight;
                    transformed.z += cos(windPhase * 0.8) * ${(PATH_WIND_CONFIG.strength * 0.5).toFixed(3)} * windWeight;
                  }`
                );
            };
            mat.needsUpdate = true;
          }
        });
      }
      if (child instanceof THREE.Light) {
        hasLight = true;
      }
    });

    setHasSceneLights(hasLight);
    invalidate();
  }, [gltfScene, animations, invalidate, camera, windUniform, applyCameraKeyframe]);

  useEffect(() => {
    const intensityScene = scene as unknown as {
      backgroundIntensity: number;
      environmentIntensity: number;
    };
    intensityScene.backgroundIntensity = envCtl.backgroundIntensity;
    intensityScene.environmentIntensity = envCtl.environmentIntensity;
    gl.toneMappingExposure = envCtl.exposure;
    invalidate();
  }, [
    scene,
    gl,
    invalidate,
    envCtl.backgroundIntensity,
    envCtl.environmentIntensity,
    envCtl.exposure,
  ]);

  useEffect(() => {
    scene.fog = fogCtl.enabled
      ? new THREE.Fog(new THREE.Color(fogCtl.color), fogCtl.near, fogCtl.far)
      : null;
    invalidate();

    return () => {
      scene.fog = null;
    };
  }, [scene, invalidate, fogCtl.enabled, fogCtl.color, fogCtl.near, fogCtl.far]);

  useEffect(() => {
    const triggerElement = document.getElementById(triggerId);
    if (!triggerElement) return;

    gsap.registerPlugin(ScrollTrigger);

    // No tween needed — the camera's path comes from scrubbing the GLB's
    // baked animation (applyCameraKeyframe) directly off scroll progress.
    // `scrub: 1` still smooths that progress value itself.
    const trigger = ScrollTrigger.create({
      trigger: triggerElement,
      start: "top top",
      end: PATH_SCROLL_DISTANCE,
      scrub: 1,
      pin: true,
      anticipatePin: 1,
      onUpdate: (self) => {
        scrollProgressRef.current = self.progress;
        applyCameraKeyframe(self.progress);
        invalidate();
      },
    });

    return () => {
      trigger.kill();
    };
  }, [triggerId, invalidate, applyCameraKeyframe]);

  useEffect(() => {
    const handleResize = () => {
      ScrollTrigger.refresh();
      invalidate();
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [invalidate]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const x = (event.clientX / window.innerWidth) * 2 - 1;
      const y = (event.clientY / window.innerHeight) * 2 - 1;
      parallaxTargetRef.current.set(x, y);
      invalidate();
    };

    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    return () => window.removeEventListener("pointermove", handlePointerMove);
  }, [invalidate]);

  useFrame(() => {
    const target = parallaxTargetRef.current;
    const offset = parallaxOffsetRef.current;
    offset.lerp(target, PARALLAX_LERP);

    if (parallaxGroupRef.current) {
      parallaxGroupRef.current.position.x = offset.x * PARALLAX_STRENGTH;
      parallaxGroupRef.current.position.y = -offset.y * PARALLAX_STRENGTH;
    }

    if (
      cloudSpeedRef.current > 0 ||
      Math.abs(target.x - offset.x) > 0.001 ||
      Math.abs(target.y - offset.y) > 0.001
    ) {
      invalidate();
    }
  });

  useEffect(() => {
    cloudSpeedRef.current = cloudCtl.speed;
  }, [cloudCtl.speed]);

  useEffect(() => {
    if (!cloudsRef.current) return;
    const applyOpacity = (mat: THREE.Material | null | undefined) => {
      if (!mat) return;
      mat.transparent = true;
      (mat as THREE.Material & { opacity: number }).opacity = cloudCtl.opacity;
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
  }, [cloudCtl.opacity, cloudCtl.visible, cloudCtl.color, cloudCtl.speed, invalidate]);

  return (
    <>
      <Environment
        files={envMapCtl.file}
        background={envMapCtl.background}
        backgroundBlurriness={envMapCtl.backgroundBlurriness}
        backgroundRotation={[0, THREE.MathUtils.degToRad(envMapCtl.rotationYDeg), 0]}
        environmentRotation={[0, THREE.MathUtils.degToRad(envMapCtl.rotationYDeg), 0]}
      />
      {sunLights.map((sun, i) => (
        <directionalLight
          key={i}
          ref={sun.castShadow ? mainSunRef : undefined}
          intensity={sun.intensity}
          color={sun.color}
          position={[sun.position.x, sun.position.y, sun.position.z]}
          castShadow={sun.castShadow}
          shadow-mapSize-width={4096}
          shadow-mapSize-height={4096}
          shadow-bias={-0.0001}
          shadow-normalBias={0.005}
          shadow-radius={10}
          shadow-camera-left={-(sun.shadowSize ?? 5)}
          shadow-camera-right={sun.shadowSize ?? 5}
          shadow-camera-top={sun.shadowSize ?? 5}
          shadow-camera-bottom={-(sun.shadowSize ?? 5)}
          shadow-camera-near={0.5}
          shadow-camera-far={sun.shadowFar ?? 50}
        />
      ))}
      {!hasSceneLights && <ambientLight intensity={ambientCtl.intensity} />}
      <group ref={parallaxGroupRef}>
        <group
          ref={cloudsRef}
          renderOrder={-1}
          visible={cloudCtl.visible}
          position={[cloudCtl.position.x, cloudCtl.position.y, cloudCtl.position.z]}
        >
          <Clouds material={THREE.MeshLambertMaterial}>
            <Cloud bounds={[2.5, 0.6, 1]} position={[-2.2, 0.3, 0]} seed={1} speed={cloudCtl.speed} color={cloudCtl.color} />
            <Cloud bounds={[2.2, 0.5, 1]} position={[1.1, 0.8, 0.2]} seed={2} speed={cloudCtl.speed} color={cloudCtl.color} />
            <Cloud bounds={[1.6, 0.4, 1]} position={[0.2, 0.55, -0.4]} seed={3} speed={cloudCtl.speed} color={cloudCtl.color} />
          </Clouds>
        </group>
        <primitive object={gltfScene} />
      </group>
      <EffectComposer enableNormalPass>
        <Bloom
          luminanceThreshold={bloomCtl.luminanceThreshold}
          luminanceSmoothing={0}
          mipmapBlur={bloomCtl.mipmapBlur}
          intensity={bloomCtl.intensity}
        />
      </EffectComposer>
    </>
  );
}

const isDev = process.env.NODE_ENV !== "production";

export default function R3FPathScene({ modelUrl, triggerId, className = "" }: PathSceneProps) {
  // Own Leva store — R3FHeroScene.tsx uses folder names that collide with
  // this file's ("Fog", "Bloom", "Export"), and Leva's default store is a
  // single global singleton keyed by folder/control path, not scoped per
  // component. Without a dedicated store, navigating between the two scenes
  // has the newly-mounted one's useControls() read back whatever the other
  // scene's panel last held, instead of this file's pathSceneConfig.ts
  // defaults (looks like "inherits the previous scene's properties," and
  // clears on refresh because that resets the whole store).
  const store = useCreateStore();

  // Leva panel (dev-only tuning UI — see the EnvironmentMapLevaConfig doc comment).
  // pathSceneConfig.ts values seed the initial state; drag the panel to iterate,
  // then use the Export folder's button to print the current values.
  const envMapRaw = useControls("Environment", {
    background: PATH_ENVIRONMENT_MAP_CONFIG.background,
    backgroundBlurriness: {
      value: PATH_ENVIRONMENT_MAP_CONFIG.backgroundBlurriness,
      min: 0,
      max: 1,
      step: 0.01,
    },
    rotationYDeg: {
      value: PATH_ENVIRONMENT_MAP_CONFIG.rotationYDeg,
      min: -180,
      max: 180,
      step: 1,
    },
  }, { store });
  const envMap: EnvironmentMapLevaConfig = { ...envMapRaw, file: PATH_ENVIRONMENT_MAP_CONFIG.file };

  const sun1 = useControls("Sun 1", {
    intensity: { value: PATH_SUN_LIGHTS[0].intensity, min: 0, max: 20, step: 0.1 },
    color: PATH_SUN_LIGHTS[0].color,
    position: { value: PATH_SUN_LIGHTS[0].position, step: 0.1 },
    castShadow: PATH_SUN_LIGHTS[0].castShadow,
  }, { store });

  const sun2 = useControls("Sun 2", {
    intensity: { value: PATH_SUN_LIGHTS[1].intensity, min: 0, max: 20, step: 0.1 },
    color: PATH_SUN_LIGHTS[1].color,
    position: { value: PATH_SUN_LIGHTS[1].position, step: 0.1 },
    castShadow: PATH_SUN_LIGHTS[1].castShadow,
    shadowSize: { value: PATH_SUN_LIGHTS[1].shadowSize ?? 12, min: 1, max: 50 },
    shadowFar: { value: PATH_SUN_LIGHTS[1].shadowFar ?? 60, min: 10, max: 300 },
  }, { store });

  const fovCtl = useControls("Camera FOV", {
    startAtProgress: { value: PATH_CAMERA_FOV_CONFIG.startAtProgress, min: 0, max: 1, step: 0.01 },
    endBoostDeg: { value: PATH_CAMERA_FOV_CONFIG.endBoostDeg, min: 0, max: 60, step: 1 },
  }, { store });

  const fogCtl = useControls("Fog", {
    enabled: PATH_FOG_CONFIG.enabled,
    color: PATH_FOG_CONFIG.color,
    near: { value: PATH_FOG_CONFIG.near, min: 0, max: 100 },
    far: { value: PATH_FOG_CONFIG.far, min: 0, max: 200 },
  }, { store });

  const bloomRaw = useControls("Bloom", {
    intensity: { value: PATH_BLOOM_CONFIG.intensity, min: 0, max: 10, step: 0.1 },
  }, { store });

  const sunLights: SunLevaConfig[] = [sun1, sun2];
  const bloomCtl: BloomLevaConfig = {
    intensity: bloomRaw.intensity,
    luminanceThreshold: PATH_BLOOM_CONFIG.luminanceThreshold,
    mipmapBlur: PATH_BLOOM_CONFIG.mipmapBlur,
  };

  // Leva freezes a button's onClick at the render it was created in, so a
  // callback closing directly over envMap/sunLights/etc. would keep logging
  // that first render's (initial, unedited) values forever. Route through a
  // ref instead — refreshed every render, read at click time — so the button
  // always reports the latest panel state.
  const exportSnapshotRef = useRef({ envMap, sunLights, fovCtl, fogCtl, bloomCtl });
  exportSnapshotRef.current = { envMap, sunLights, fovCtl, fogCtl, bloomCtl };

  useControls("Export", {
    "Log current values": button(() => {
      const snapshot = exportSnapshotRef.current;
      console.log(
        "pathSceneConfig.ts values:\n" +
          JSON.stringify(
            {
              PATH_ENVIRONMENT_MAP_CONFIG: snapshot.envMap,
              PATH_SUN_LIGHTS: snapshot.sunLights,
              PATH_CAMERA_FOV_CONFIG: snapshot.fovCtl,
              PATH_FOG_CONFIG: snapshot.fogCtl,
              PATH_BLOOM_CONFIG: snapshot.bloomCtl,
            },
            null,
            2
          )
      );
    }),
  }, { store });

  // Leva doesn't portal itself, so mounting it inside the canvas wrapper below
  // (an `absolute` + `z-0` ancestor in page.tsx, which forms its own stacking
  // context) traps its z-index under the nav. Portal it straight to <body> so
  // it always sits on top regardless of where this component is placed.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <div className={`h-full w-full ${className}`} aria-hidden="true">
      {mounted &&
        createPortal(
          <LevaPanel store={store} collapsed hidden={!isDev} titleBar={{ title: "Path Scene" }} />,
          document.body
        )}
      <Canvas
        dpr={[1, 1.5]}
        frameloop="demand"
        shadows
        camera={{
          fov: CAMERA_FOV,
          near: CAMERA_NEAR,
          far: CAMERA_FAR,
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
        <Suspense fallback={null}>
          <PathSceneContent
            modelUrl={modelUrl}
            triggerId={triggerId}
            envMap={envMap}
            sunLights={sunLights}
            fovCtl={fovCtl}
            fogCtl={fogCtl}
            bloomCtl={bloomCtl}
          />
        </Suspense>
      </Canvas>
    </div>
  );
}
