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
import { useFrame, useThree } from "@react-three/fiber";
import { Cloud, Clouds, Environment, useGLTF } from "@react-three/drei";
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
import PortalSwirlEffect, { PortalSwirlEffectImpl } from "./PortalSwirlEffect";
import {
  PATH_SCROLL_DISTANCE,
  PATH_ENVIRONMENT_MAP_CONFIG,
  PATH_SUN_LIGHTS,
  PATH_END_LIGHT_CONFIG,
  PATH_PORTAL_CONFIG,
  PATH_SUN_RISE_CONFIG,
  PATH_CAMERA_FOV_CONFIG,
  PATH_FOG_CONFIG,
  PATH_BLOOM_CONFIG,
  PATH_ENVIRONMENT_CONFIG,
  PATH_AMBIENT_LIGHT_CONFIG,
  PATH_CLOUD_CONFIG,
  PATH_BRIDGE_FOG_CONFIG,
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
type CameraFovLevaConfig = { startAtProgress: number; endAtProgress: number; endBoostDeg: number };
type FogLevaConfig = { enabled: boolean; color: string; near: number; far: number };
type BloomLevaConfig = { intensity: number; luminanceThreshold: number; mipmapBlur: boolean };
type EndLightLevaConfig = {
  intensity: number;
  color: string;
  position: Vec3;
  distance: number;
  decay: number;
};
type PortalLevaConfig = { startAtProgress: number; endAtProgress: number; strength: number };
type SunRiseLevaConfig = { startAtProgress: number; endAtProgress: number; riseOffset: number };

type PathSceneContentProps = PathSceneProps & {
  envMap: EnvironmentMapLevaConfig;
  sunLights: SunLevaConfig[];
  endLightCtl: EndLightLevaConfig;
  portalCtl: PortalLevaConfig;
  sunRiseCtl: SunRiseLevaConfig;
  fovCtl: CameraFovLevaConfig;
  fogCtl: FogLevaConfig;
  bloomCtl: BloomLevaConfig;
};

const CAMERA_FAR = 200;

function PathSceneContent({
  modelUrl,
  triggerId,
  envMap: envMapCtl,
  sunLights,
  endLightCtl,
  portalCtl,
  sunRiseCtl,
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
  const cloudSpeedRef = useRef(0);
  // Bridge/water fog near the far end of the path (see PATH_BRIDGE_FOG_CONFIG)
  // — mounted only once scroll reaches the portal window (gate check in the
  // ScrollTrigger onUpdate below) rather than for the whole scroll, so its
  // cloud geometry/materials aren't built until the user is actually close
  // to seeing them.
  const bridgeFogRef = useRef<THREE.Group | null>(null);
  const bridgeFogLoadedRef = useRef(false);
  const [bridgeFogLoaded, setBridgeFogLoaded] = useState(false);
  // Cloud drift (if enabled) keeps invalidating the demand frameloop even
  // once pointer-parallax has settled.
  const parallaxGroupRef = useParallaxGroup(undefined, undefined, () => cloudSpeedRef.current > 0);
  // The GLB's baked "Camera" node/animation — its keyframed local position
  // and rotation ARE the scroll path (see pathSceneConfig.ts's comment for
  // why this replaced a hand-authored start/end lerp). Scrubbed via
  // AnimationMixer.setTime() rather than played in real time, so scroll drives
  // it directly instead of wall-clock time.
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  // Reset to unpaused before every setTime() call (see applyCameraKeyframe)
  // so scrubbing back down after reaching progress 1 doesn't get stuck.
  const scrubbedActionsRef = useRef<THREE.AnimationAction[]>([]);
  const animatedCameraRef = useRef<THREE.Object3D | null>(null);
  const clipDurationRef = useRef(0);
  // The GLB camera's own baked fov — the start value for the scroll-driven
  // widen effect below (glTF has no animated-fov channel, see
  // PATH_CAMERA_FOV_CONFIG's doc comment).
  const baseFovRef = useRef<number | null>(null);
  // "Sun.002" (the sun-disc mesh) — rise is driven in code, not a baked clip;
  // see PATH_SUN_RISE_CONFIG. baseY is its current (risen) position.y,
  // captured once the GLB loads.
  const sunOrbRef = useRef<THREE.Object3D | null>(null);
  const sunOrbBaseYRef = useRef<number | null>(null);
  const scrollProgressRef = useRef(0);
  // Portal-swirl pulse (0..1..0 over PATH_PORTAL_CONFIG's window) — set here,
  // read by the useFrame below that pushes it onto the effect's uniforms.
  const portalProgressRef = useRef(0);
  const portalEffectRef = useRef<PortalSwirlEffectImpl | null>(null);

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
    scrubMixer(
      mixer,
      scrubbedActionsRef.current,
      clipDurationRef.current,
      progress
    );
    camera.position.copy(animatedCamera.position);
    camera.quaternion.copy(animatedCamera.quaternion);

    const baseFov = baseFovRef.current;
    if (baseFov !== null && camera instanceof THREE.PerspectiveCamera) {
      const widenProgress = THREE.MathUtils.clamp(
        (progress - fovCtl.startAtProgress) /
          Math.max(fovCtl.endAtProgress - fovCtl.startAtProgress, 1e-4),
        0,
        1
      );
      camera.fov = baseFov + fovCtl.endBoostDeg * widenProgress;
      camera.updateProjectionMatrix();
    }

    // Portal-swirl pulse: rises then falls back to 0 across the window
    // (mirrors scroll-scene's `Math.sin(transitionT * Math.PI)` dreamCurve)
    // rather than holding at full strength, since there's no destination
    // scene yet to hold the distortion open for.
    const portalRaw = THREE.MathUtils.clamp(
      (progress - portalCtl.startAtProgress) /
        Math.max(portalCtl.endAtProgress - portalCtl.startAtProgress, 1e-4),
      0,
      1
    );
    portalProgressRef.current = Math.sin(portalRaw * Math.PI) * portalCtl.strength;

    // Sun.002 rise — see PATH_SUN_RISE_CONFIG. Not a mixer scrub (no baked
    // clip anymore); just an in-code lerp of the node's own position.y off
    // scroll progress, applied directly since it's already part of the
    // rendered gltfScene primitive (no separate copy-to-render-object step
    // needed, unlike the camera).
    const sunOrb = sunOrbRef.current;
    const sunOrbBaseY = sunOrbBaseYRef.current;
    if (sunOrb && sunOrbBaseY !== null) {
      const riseRaw = THREE.MathUtils.clamp(
        (progress - sunRiseCtl.startAtProgress) /
          Math.max(sunRiseCtl.endAtProgress - sunRiseCtl.startAtProgress, 1e-4),
        0,
        1
      );
      const riseT = THREE.MathUtils.smootherstep(riseRaw, 0, 1);
      sunOrb.position.y = sunOrbBaseY + THREE.MathUtils.lerp(sunRiseCtl.riseOffset, 0, riseT);
    }
  }, [
    camera,
    fovCtl.startAtProgress,
    fovCtl.endAtProgress,
    fovCtl.endBoostDeg,
    portalCtl.startAtProgress,
    portalCtl.endAtProgress,
    portalCtl.strength,
    sunRiseCtl.startAtProgress,
    sunRiseCtl.endAtProgress,
    sunRiseCtl.riseOffset,
  ]);

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

  // Push the portal-swirl pulse onto the effect's uniforms. NOT gated by the
  // same 0.92 cutoff as the wind clock above — PATH_PORTAL_CONFIG's window
  // (0.85–1.0 by default) runs right through it and needs uTime advancing
  // for its sin()-driven wobble the whole time it's visible.
  useFrame((state) => {
    const effect = portalEffectRef.current;
    if (!effect) return;
    effect.uniforms.get("uProgress")!.value = portalProgressRef.current;
    if (portalProgressRef.current > 0) {
      effect.uniforms.get("uTime")!.value = state.clock.elapsedTime;
      invalidate();
    }
  });

  useEffect(() => {
    const animatedCamera = gltfScene.getObjectByName("Camera");
    animatedCameraRef.current = animatedCamera ?? null;

    if (animatedCamera instanceof THREE.PerspectiveCamera && camera instanceof THREE.PerspectiveCamera) {
      baseFovRef.current = animatedCamera.fov;
      camera.near = animatedCamera.near;
      camera.far = animatedCamera.far;
    }

    const cameraClip = findClipForNode(animations, "Camera");

    if (animatedCamera && cameraClip) {
      const mixer = new THREE.AnimationMixer(gltfScene);
      mixerRef.current = mixer;
      scrubbedActionsRef.current = [createScrubbableAction(mixer, cameraClip)];
      clipDurationRef.current = cameraClip.duration;
    } else {
      console.warn("path.glb: no animated \"Camera\" node found — camera won't follow a scroll path.");
      mixerRef.current = null;
      scrubbedActionsRef.current = [];
      clipDurationRef.current = 0;
    }

    // "Sun.002" (the sun-disc mesh) rise is driven in code off scroll
    // progress, not a baked clip — see PATH_SUN_RISE_CONFIG. Its current
    // position.y (the risen resting pose, per the latest path.glb export) is
    // captured once here as the top of the rise.
    const sunOrb = gltfScene.getObjectByName("Sun.002");
    sunOrbRef.current = sunOrb ?? null;
    sunOrbBaseYRef.current = sunOrb ? sunOrb.position.y : null;
    if (!sunOrb) {
      console.warn('path.glb: no "Sun.002" node found — the rising sun-disc mesh won\'t appear.');
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
          if (isFoliageMaterial(mat)) {
            applyFoliageWind(child, mat, windUniform, PATH_WIND_CONFIG);
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

        if (!bridgeFogLoadedRef.current && self.progress >= portalCtl.startAtProgress) {
          bridgeFogLoadedRef.current = true;
          setBridgeFogLoaded(true);
        }

        invalidate();
      },
    });

    return () => {
      trigger.kill();
    };
  }, [triggerId, invalidate, applyCameraKeyframe, portalCtl.startAtProgress]);

  useScrollTriggerRefreshOnResize();

  useEffect(() => {
    cloudSpeedRef.current = cloudCtl.speed;
  }, [cloudCtl.speed]);

  useCloudOpacity(cloudsRef, cloudCtl.opacity);
  useCloudOpacity(bridgeFogRef, PATH_BRIDGE_FOG_CONFIG.opacity, bridgeFogLoaded);

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
        {/* Positioned at the "EuropeanLantern" prop near the far end of the
            path (see PATH_END_LIGHT_CONFIG) — lives in this group, not
            alongside the directional suns above, so it stays aligned with
            the lantern mesh under the pointer-parallax offset. */}
        <pointLight
          intensity={endLightCtl.intensity}
          color={endLightCtl.color}
          position={[endLightCtl.position.x, endLightCtl.position.y, endLightCtl.position.z]}
          distance={endLightCtl.distance}
          decay={endLightCtl.decay}
        />
        {/* Bridge/water fog (see PATH_BRIDGE_FOG_CONFIG) — lazy-mounted once
            scroll reaches the portal window, not for the whole scroll (see
            bridgeFogLoaded above). Flat, low, dense puffs around "Cube.009"
            to read as mist over water rather than sky cloud. */}
        {bridgeFogLoaded && (
          <group
            ref={bridgeFogRef}
            renderOrder={-1}
            position={[
              PATH_BRIDGE_FOG_CONFIG.position.x,
              PATH_BRIDGE_FOG_CONFIG.position.y,
              PATH_BRIDGE_FOG_CONFIG.position.z,
            ]}
          >
            <Clouds material={THREE.MeshLambertMaterial}>
              <Cloud bounds={[3, 0.35, 2.5]} position={[-7, 0.3, -6]} seed={11} speed={PATH_BRIDGE_FOG_CONFIG.speed} color={PATH_BRIDGE_FOG_CONFIG.color} />
              <Cloud bounds={[2.5, 0.3, 2.5]} position={[6, 0.25, -5]} seed={12} speed={PATH_BRIDGE_FOG_CONFIG.speed} color={PATH_BRIDGE_FOG_CONFIG.color} />
              <Cloud bounds={[3, 0.35, 2.5]} position={[-2, 0.35, 5]} seed={13} speed={PATH_BRIDGE_FOG_CONFIG.speed} color={PATH_BRIDGE_FOG_CONFIG.color} />
              <Cloud bounds={[2.5, 0.3, 2.5]} position={[5, 0.3, 3]} seed={14} speed={PATH_BRIDGE_FOG_CONFIG.speed} color={PATH_BRIDGE_FOG_CONFIG.color} />
              <Cloud bounds={[2.5, 0.3, 2.5]} position={[-6, 0.28, 2]} seed={15} speed={PATH_BRIDGE_FOG_CONFIG.speed} color={PATH_BRIDGE_FOG_CONFIG.color} />
            </Clouds>
          </group>
        )}
      </group>
      <EffectComposer enableNormalPass>
        <Bloom
          luminanceThreshold={bloomCtl.luminanceThreshold}
          luminanceSmoothing={0}
          mipmapBlur={bloomCtl.mipmapBlur}
          intensity={bloomCtl.intensity}
        />
        <PortalSwirlEffect ref={portalEffectRef} />
      </EffectComposer>
    </>
  );
}

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

  const endLightCtl: EndLightLevaConfig = useControls("End Light", {
    intensity: { value: PATH_END_LIGHT_CONFIG.intensity, min: 0, max: 30, step: 0.5 },
    color: PATH_END_LIGHT_CONFIG.color,
    position: { value: PATH_END_LIGHT_CONFIG.position, step: 0.1 },
    distance: { value: PATH_END_LIGHT_CONFIG.distance, min: 0, max: 100, step: 1 },
    decay: { value: PATH_END_LIGHT_CONFIG.decay, min: 0, max: 5, step: 0.1 },
  }, { store });

  const fovCtl = useControls("Camera FOV", {
    startAtProgress: { value: PATH_CAMERA_FOV_CONFIG.startAtProgress, min: 0, max: 1, step: 0.01 },
    endAtProgress: { value: PATH_CAMERA_FOV_CONFIG.endAtProgress, min: 0, max: 1, step: 0.01 },
    endBoostDeg: { value: PATH_CAMERA_FOV_CONFIG.endBoostDeg, min: 0, max: 60, step: 1 },
  }, { store });

  const portalCtl: PortalLevaConfig = useControls("Portal", {
    startAtProgress: { value: PATH_PORTAL_CONFIG.startAtProgress, min: 0, max: 1, step: 0.01 },
    endAtProgress: { value: PATH_PORTAL_CONFIG.endAtProgress, min: 0, max: 1, step: 0.01 },
    strength: { value: PATH_PORTAL_CONFIG.strength, min: 0, max: 2, step: 0.05 },
  }, { store });

  const sunRiseCtl: SunRiseLevaConfig = useControls("Sun Rise", {
    startAtProgress: { value: PATH_SUN_RISE_CONFIG.startAtProgress, min: 0, max: 1, step: 0.01 },
    endAtProgress: { value: PATH_SUN_RISE_CONFIG.endAtProgress, min: 0, max: 1, step: 0.01 },
    riseOffset: { value: PATH_SUN_RISE_CONFIG.riseOffset, min: -20, max: 0, step: 0.5 },
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

  useLevaExportButton(store, "pathSceneConfig.ts", {
    PATH_ENVIRONMENT_MAP_CONFIG: envMap,
    PATH_SUN_LIGHTS: sunLights,
    PATH_END_LIGHT_CONFIG: endLightCtl,
    PATH_PORTAL_CONFIG: portalCtl,
    PATH_SUN_RISE_CONFIG: sunRiseCtl,
    PATH_CAMERA_FOV_CONFIG: fovCtl,
    PATH_FOG_CONFIG: fogCtl,
    PATH_BLOOM_CONFIG: bloomCtl,
  });

  return (
    <div className={`h-full w-full ${className}`} aria-hidden="true">
      <DevLevaPanel store={store} title="Path Scene" />
      <SceneCanvas far={CAMERA_FAR}>
        <Suspense fallback={null}>
          <PathSceneContent
            modelUrl={modelUrl}
            triggerId={triggerId}
            envMap={envMap}
            sunLights={sunLights}
            endLightCtl={endLightCtl}
            portalCtl={portalCtl}
            sunRiseCtl={sunRiseCtl}
            fovCtl={fovCtl}
            fogCtl={fogCtl}
            bloomCtl={bloomCtl}
          />
        </Suspense>
      </SceneCanvas>
    </div>
  );
}
