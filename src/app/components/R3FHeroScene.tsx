"use client";

import * as THREE from "three";
import { useEffect, useMemo, useRef, Suspense, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Cloud, Clouds, useGLTF } from "@react-three/drei";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

type HeroSceneProps = {
  modelUrl: string;
  triggerId: string;
  openAngleDeg?: number;
  className?: string;
};

const CAMERA_FOV = 35;
const CAMERA_NEAR = 0.1;
const CAMERA_FAR = 100;
const CAMERA_START_OFFSET_Z = 3.3;
const CAMERA_END_OFFSET_Z = 8.5;
const HERO_SCROLL_DISTANCE = "+=460%";
const FOG_COLOR = "#7cc3ec";
const FOG_NEAR = 4;
const FOG_FAR = 15.5;
const PARALLAX_STRENGTH = 0.22;
const PARALLAX_LERP = 0.08;
const MAX_LEAVES = 24; // InstancedMesh capacity; LEAVES_CONFIG.count must stay <= this

// Scene colors (WebGL canvas — separate from the CSS `--hero-*` tokens in
// globals.css; the two systems can't share values).
const SUN_COLOR = "#feebeb";
const CLOUD_COLOR = "#d4faff";

// Baked scene-tuning values (formerly Leva "useControls" debug panels). This is
// the single place to retune the look; each object mirrors one old panel.
const LEAVES_CONFIG = {
  enabled: true,
  count: 15,
  fallSpeed: 0.75,
  sway: 0.5,
  size: 0.1,
  spin: 2.5,
  position: { x: 0, y: 5, z: 0 },
};
const FOG_CONFIG = {
  enabled: true,
  color: FOG_COLOR,
  near: FOG_NEAR,
  far: FOG_FAR,
};
const CLOUD_CONFIG = {
  visible: true,
  opacity: 0.15,
  speed: 0,
  color: CLOUD_COLOR,
  position: { x: 0, y: -3, z: 2 },
};
const SUN_LIGHT_CONFIG = {
  intensity: 3,
  color: SUN_COLOR,
  position: { x: -3.2, y: 8.5, z: 9.4 },
  // Orthographic shadow-camera frustum: half-width (±) and far plane.
  shadowSize: 5,
  shadowFar: 50,
};
const AMBIENT_LIGHT_CONFIG = {
  intensity: 1,
};
// Dim front fill spotlight — lights the front-facing foliage the sun rakes
// past. No shadows (fill only). decay 0 keeps intensity readable like the sun.
const FRONT_SPOT_CONFIG = {
  intensity: 0.8,
  color: "#e8c08d",
  position: { x: -6.5, y: -17.3, z: 4.1 },
  angle: 1.5,
  penumbra: 1,
  decay: 0,
};
const BLOOM_CONFIG = {
  intensity: 6,
  luminanceThreshold: 0.8,
  mipmapBlur: true,
};
const ENVIRONMENT_CONFIG = {
  environmentIntensity: 1,
  backgroundIntensity: 1.0,
  exposure: 1.0,
};
// Mascot figures read as plastic because they're smooth + slightly metallic and
// reflect the environment map. Matte defaults: high roughness, no metalness,
// low env reflection. Applied to the collected mascot materials.
const MASCOT_CONFIG = {
  roughness: 1,
  metalness: 0.1,
  envMapIntensity: 0,
};
// GPU vertex-shader wind for the foliage cards (grass/leaves/flowers). Cheap:
// one shared uTime uniform + a sin() per vertex. Sway is weighted by uv.y so
// the base stays planted; phase is offset per-plant by world position. Gentle
// defaults — raise strength for more movement, speed for faster gusts.
const WIND_CONFIG = {
  speed: 0.5,
  strength: 0.3,
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

  const ctl = LEAVES_CONFIG;

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

function DoorSceneContent({ modelUrl, triggerId, openAngleDeg = 105 }: HeroSceneProps) {
  const { camera, invalidate, scene, gl } = useThree();
  const { scene: gltfScene, cameras } = useGLTF(modelUrl);
  const [hasSceneLights, setHasSceneLights] = useState(false);
  // Bumped once the traverse has collected mascot materials, so the de-plastic
  // effect (defined earlier) re-runs against a populated set on first load.
  const [mascotsCollected, setMascotsCollected] = useState(0);
  const dirLightRef = useRef<THREE.DirectionalLight | null>(null);
  // Mascot materials collected during the GLB traverse, so the debug panel can
  // retune their roughness/metalness/envMap live (see the "Mascots" panel).
  const mascotMaterialsRef = useRef<Set<THREE.MeshStandardMaterial>>(new Set());
  // Shared wind clock uniform — one object referenced by every foliage material,
  // advanced once per frame so all cards sway off the same time base.
  const windUniform = useMemo(() => ({ value: 0 }), []);
  const cloudsRef = useRef<THREE.Group | null>(null);
  const parallaxGroupRef = useRef<THREE.Group | null>(null);
  const parallaxTargetRef = useRef(new THREE.Vector2(0, 0));
  const parallaxOffsetRef = useRef(new THREE.Vector2(0, 0));
  const doorMeshRef = useRef<THREE.Object3D | null>(null);
  const doorClosedYRef = useRef(0);
  const cameraEndPositionRef = useRef(new THREE.Vector3());
  const timelineRef = useRef<gsap.core.Timeline | null>(null);
  const cloudSpeedRef = useRef(0);
  const scrollProgressRef = useRef(0);
  const [leafData, setLeafData] = useState<{
    texture: THREE.Texture | null;
    region: THREE.Box3 | null;
  }>({ texture: null, region: null });

  // ---- Baked scene-tuning values (see *_CONFIG constants at top of file) ----
  const fogCtl = FOG_CONFIG;
  const cloudCtl = CLOUD_CONFIG;
  const lightCtl = SUN_LIGHT_CONFIG;
  const ambientCtl = AMBIENT_LIGHT_CONFIG;
  const frontSpotCtl = FRONT_SPOT_CONFIG;
  const bloomCtl = BLOOM_CONFIG;
  const envCtl = ENVIRONMENT_CONFIG;
  const mascotCtl = MASCOT_CONFIG;

  // Apply the matte mascot material settings once the traverse has collected
  // them (see MASCOT_CONFIG — fixes the plastic-looking reflections).
  useEffect(() => {
    mascotMaterialsRef.current.forEach((mat) => {
      mat.roughness = mascotCtl.roughness;
      mat.metalness = mascotCtl.metalness;
      mat.envMapIntensity = mascotCtl.envMapIntensity;
      mat.needsUpdate = true;
    });
    invalidate();
  }, [mascotCtl.roughness, mascotCtl.metalness, mascotCtl.envMapIntensity, mascotsCollected, invalidate]);

  // R3F writes the custom shadow-camera bounds but doesn't recompute the ortho
  // projection matrix — without this the frustum stays at three's ±5 default.
  useEffect(() => {
    const light = dirLightRef.current;
    if (!light) return;
    light.shadow.camera.updateProjectionMatrix();
    invalidate();
  }, [lightCtl.shadowSize, lightCtl.shadowFar, invalidate]);

  // Advance the shared wind clock. Gated to the hero (same as the falling
  // leaves) so the demand loop still idles once scrolled past.
  useFrame((state) => {
    if (scrollProgressRef.current >= 0.92) return;
    windUniform.value = state.clock.elapsedTime;
    invalidate();
  });

  useEffect(() => {
    const glbCamera = cameras[0];
    const endPosition = new THREE.Vector3(
      camera.position.x,
      camera.position.y,
      camera.position.z
    );
    if (glbCamera instanceof THREE.PerspectiveCamera && camera instanceof THREE.PerspectiveCamera) {
      camera.position.copy(glbCamera.position);
      camera.quaternion.copy(glbCamera.quaternion);
      camera.fov = glbCamera.fov;
      camera.near = glbCamera.near;
      camera.far = glbCamera.far;
      camera.updateProjectionMatrix();
      endPosition.copy(glbCamera.position);
    }
    const viewDirection = new THREE.Vector3();
    camera.getWorldDirection(viewDirection);
    cameraEndPositionRef.current
      .copy(endPosition)
      .addScaledVector(viewDirection, CAMERA_END_OFFSET_Z);
    camera.position.copy(endPosition).addScaledVector(viewDirection, -CAMERA_START_OFFSET_Z);
    camera.updateProjectionMatrix();

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
          // Mascot parts all carry Blender-default names (head/ears/shirt/hat/
          // body/propeller/Material.###/PaletteMaterial###); scene props use
          // descriptive names. Collect the mascots so the panel can de-plastic
          // them (raise roughness, kill metalness, drop env reflections).
          if (/head|ears|shirt|hat|body|propeller|^material\.|^palettematerial/i.test(mat.name)) {
            mascotMaterialsRef.current.add(mat);
          }
          // Foliage cards (grass/leaves/flowers) are alpha-cutout: most export
          // as alphaMode MASK (alphaTest set, transparent=false), some as BLEND
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
                    float windPhase = uWindTime * ${WIND_CONFIG.speed.toFixed(3)} + (windWorld.x + windWorld.z) * 0.7;
                    float windWeight = clamp((position.y - ${windBaseY.toFixed(4)}) / ${windSpanY.toFixed(4)}, 0.0, 1.0);
                    transformed.x += sin(windPhase) * ${WIND_CONFIG.strength.toFixed(3)} * windWeight;
                    transformed.z += cos(windPhase * 0.8) * ${(WIND_CONFIG.strength * 0.5).toFixed(3)} * windWeight;
                  }`
                );
            };
            mat.needsUpdate = true;
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

    const doorCandidate = gltfScene.getObjectByName("door_inner");
    if (doorCandidate) {
      doorMeshRef.current = doorCandidate;
      doorClosedYRef.current = doorCandidate.rotation.y;
    } else {
      console.warn("door_inner mesh not found in GLB.");
    }

    // Spawn volume for falling leaves = combined bounds of the front trees.
    gltfScene.updateMatrixWorld(true);
    const region = new THREE.Box3();
    let hasRegion = false;
    ["tree", "tree.001"].forEach((name) => {
      const node = gltfScene.getObjectByName(name);
      if (node) {
        region.expandByObject(node);
        hasRegion = true;
      }
    });
    setLeafData({ texture: leafTexture, region: hasRegion ? region : null });
    setMascotsCollected((n) => n + 1);

    invalidate();
  }, [gltfScene, invalidate, cameras, camera, windUniform]);

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
    const doorMesh = doorMeshRef.current;
    const triggerElement = document.getElementById(triggerId);
    if (!doorMesh || !triggerElement) return;

    gsap.registerPlugin(ScrollTrigger);

    const openAngle = THREE.MathUtils.degToRad(openAngleDeg);
    const timeline = gsap.timeline({
      scrollTrigger: {
        trigger: triggerElement,
        start: "top top",
        end: HERO_SCROLL_DISTANCE,
        scrub: 1,
        pin: true,
        anticipatePin: 1,
        onUpdate: (self) => {
          scrollProgressRef.current = self.progress;
          invalidate();
        },
      },
      onUpdate: () => invalidate(),
    });

    timeline.to(doorMesh.rotation, {
      y: doorClosedYRef.current + openAngle,
      ease: "none",
    });

      timeline.to(
        camera.position,
        {
          x: cameraEndPositionRef.current.x,
          y: cameraEndPositionRef.current.y,
          z: cameraEndPositionRef.current.z,
          ease: "none",
        },
        0
      );

    timelineRef.current = timeline;

    return () => {
      timeline.scrollTrigger?.kill();
      timeline.kill();
      timelineRef.current = null;
    };
  }, [camera.position, triggerId, openAngleDeg, invalidate]);

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
      <directionalLight
        ref={dirLightRef}
        intensity={lightCtl.intensity}
        position={[lightCtl.position.x, lightCtl.position.y, lightCtl.position.z]}
        castShadow
        color={lightCtl.color}
        shadow-mapSize-width={4096}
        shadow-mapSize-height={4096}
        shadow-bias={-0.0001}
        shadow-normalBias={0.005}
        shadow-radius={10}
        shadow-camera-left={-lightCtl.shadowSize}
        shadow-camera-right={lightCtl.shadowSize}
        shadow-camera-top={lightCtl.shadowSize}
        shadow-camera-bottom={-lightCtl.shadowSize}
        shadow-camera-near={0.5}
        shadow-camera-far={lightCtl.shadowFar}
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
          intensity={bloomCtl.intensity}
        />
      </EffectComposer>
    </>
  );
}

export default function R3FHeroScene({
  modelUrl,
  triggerId,
  openAngleDeg = 105,
  className = "",
}: HeroSceneProps) {
  return (
    <div className={`h-full w-full ${className}`} aria-hidden="true">
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
          <DoorSceneContent
            modelUrl={modelUrl}
            triggerId={triggerId}
            openAngleDeg={openAngleDeg}
          />
        </Suspense>
      </Canvas>
    </div>
  );
}
