"use client";

import * as THREE from "three";
import { useEffect, useRef, Suspense, useState } from "react";
import { Canvas, useFrame, useLoader, useThree } from "@react-three/fiber";
import { Cloud, Clouds, useGLTF } from "@react-three/drei";
import { EffectComposer, Bloom, GodRays } from "@react-three/postprocessing";
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js";
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
const CAMERA_START_OFFSET_Z = 2.5;
const CAMERA_END_OFFSET_Z = 8.5;
const HERO_SCROLL_DISTANCE = "+=460%";
const FOG_COLOR = "#7cc3ec";
const FOG_NEAR = 3.5;
const FOG_FAR = 15.5;
const PARALLAX_STRENGTH = 0.22;
const PARALLAX_LERP = 0.08;

function DoorSceneContent({ modelUrl, triggerId, openAngleDeg = 105 }: HeroSceneProps) {
  const { camera, invalidate, scene } = useThree();
  const { scene: gltfScene, cameras } = useGLTF(modelUrl);
  const [hasSceneLights, setHasSceneLights] = useState(false);
  const cloudsRef = useRef<THREE.Group | null>(null);
  const parallaxGroupRef = useRef<THREE.Group | null>(null);
  const parallaxTargetRef = useRef(new THREE.Vector2(0, 0));
  const parallaxOffsetRef = useRef(new THREE.Vector2(0, 0));
  const sunLightRef = useRef<THREE.DirectionalLight | null>(null);
  const [sunMesh, setSunMesh] = useState<THREE.Mesh | null>(null);
  const hdrTexture = useLoader(RGBELoader, "/industrial_sunset_puresky_4k.hdr");

  const doorMeshRef = useRef<THREE.Object3D | null>(null);
  const doorClosedYRef = useRef(0);
  const cameraEndPositionRef = useRef(new THREE.Vector3());
  const timelineRef = useRef<gsap.core.Timeline | null>(null);

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
    gltfScene.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        if (child.material instanceof THREE.MeshStandardMaterial) {
          child.material.envMapIntensity = 1;
        }
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

    invalidate();
  }, [gltfScene, invalidate, cameras, camera]);

  useEffect(() => {
    hdrTexture.mapping = THREE.EquirectangularReflectionMapping;
    scene.environment = hdrTexture;
    scene.background = null; //set to hdrTexture for the actual image in the sky (skybox). this will prevent you from seeing underneath tho
    const intensityScene = scene as unknown as {
      backgroundIntensity: number;
      environmentIntensity: number;
    };
    intensityScene.backgroundIntensity = 1.0;
    intensityScene.environmentIntensity = 0.12;
    invalidate();
  }, [hdrTexture, scene, invalidate]);

  useEffect(() => {
    const fogColor = new THREE.Color(FOG_COLOR);
    scene.fog = new THREE.Fog(fogColor, FOG_NEAR, FOG_FAR);
    invalidate();

    return () => {
      scene.fog = null;
    };
  }, [scene, invalidate]);

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
        onUpdate: () => invalidate(),
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

    if (Math.abs(target.x - offset.x) > 0.001 || Math.abs(target.y - offset.y) > 0.001) {
      invalidate();
    }
  });

  useEffect(() => {
    if (!cloudsRef.current) return;
    cloudsRef.current.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      const material = child.material;
      if (!material) return;
      if (Array.isArray(material)) {
        material.forEach((mat) => {
          if (!mat) return;
          mat.transparent = true;
          mat.opacity = 0.6;
          mat.depthWrite = false;
        });
      } else if (material instanceof THREE.Material) {
        material.transparent = true;
        material.opacity = 0.6;
        material.depthWrite = false;
      }
    });
  }, []);

  return (
    <>
      <directionalLight
        ref={sunLightRef}
        intensity={3.7}
        position={[3, 8, 3]}
        castShadow
        color="#feebeb"
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-bias={-0.0001}
        shadow-normalBias={0.005}
        shadow-radius={10}
      />
      <pointLight
        color="#dfdeef"
        intensity={0}
        distance={20}
        decay={2}
        position={[0, 0.6, 1]}
      />
      <mesh ref={setSunMesh} position={[3, 8, 3]} visible={false}>
        <sphereGeometry args={[0.5, 16, 16]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
      {!hasSceneLights && <ambientLight intensity={0.35} />}
      <group ref={parallaxGroupRef}>
        {/* Clouds are rendered as part of the parallax group to give them a subtle parallax effect. 
        <group ref={cloudsRef} renderOrder={-1}>
          <Clouds material={THREE.MeshLambertMaterial} position={[0, -3, 2]}>
            <Cloud bounds={[2.5, 0.6, 1]} position={[-2.2, 0.3, 0]} seed={1} speed={0} />
            <Cloud bounds={[2.2, 0.5, 1]} position={[1.1, 0.8, 0.2]} seed={2} speed={0} />
            <Cloud bounds={[1.6, 0.4, 1]} position={[0.2, 0.55, -0.4]} seed={3} speed={0} />
          </Clouds>
        </group>*/}
        <primitive object={gltfScene} />
      </group>
      <EffectComposer enableNormalPass>
        <Bloom
          luminanceThreshold={0.8}
          luminanceSmoothing={0}
          mipmapBlur
          intensity={1.8}
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
