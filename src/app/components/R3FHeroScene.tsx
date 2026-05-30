"use client";

import * as THREE from "three";
import { useEffect, useRef, Suspense } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { Cloud, Clouds, Sparkles, useGLTF } from "@react-three/drei";
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

function DoorSceneContent({ modelUrl, triggerId, openAngleDeg = 105 }: HeroSceneProps) {
  const { scene, camera, invalidate } = useThree();
  const { scene: gltfScene, cameras } = useGLTF(modelUrl);
  const fallbackLightsAdded = useRef(false);

  const doorMeshRef = useRef<THREE.Object3D | null>(null);
  const doorClosedYRef = useRef(0);
  const timelineRef = useRef<gsap.core.Timeline | null>(null);

  useEffect(() => {
    const glbCamera = cameras[0];
    if (glbCamera instanceof THREE.PerspectiveCamera) {
      camera.position.copy(glbCamera.position);
      camera.quaternion.copy(glbCamera.quaternion);
      camera.fov = glbCamera.fov;
      camera.near = glbCamera.near;
      camera.far = glbCamera.far;
      camera.updateProjectionMatrix();
    }

    gltfScene.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

    scene.add(gltfScene);

    if (!fallbackLightsAdded.current) {
      let hasLight = false;
      gltfScene.traverse((child) => {
        if (child instanceof THREE.Light) {
          hasLight = true;
        }
      });

      if (!hasLight) {
        fallbackLightsAdded.current = true;
        const ambient = new THREE.AmbientLight(0xffffff, 0.5);
        const keyLight = new THREE.DirectionalLight(0xffffff, 1.2);
        keyLight.position.set(3, 4, 4);
        scene.add(ambient);
        scene.add(keyLight);
      }
    }

    const doorCandidate = gltfScene.getObjectByName("door_inner");
    if (doorCandidate) {
      doorMeshRef.current = doorCandidate;
      doorClosedYRef.current = doorCandidate.rotation.y;
    } else {
      console.warn("door_inner mesh not found in GLB.");
    }

    invalidate();

    return () => {
      scene.remove(gltfScene);
    };
  }, [gltfScene, scene, invalidate, cameras, camera]);

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
        end: "+=220%",
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
        z: 0,
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

  return (
    <>
      <pointLight
        color="#ff6b6b"
        intensity={0.7}
        distance={8}
        decay={2}
        position={[0, 1.2, 2.2]}
      />
      <Sparkles
        count={40}
        scale={[6, 3, 4]}
        size={2}
        speed={0.2}
        opacity={0.3}
        color="#ffd1d1"
        position={[0, 1.2, 0]}
      />
      <Clouds>
        <Cloud
          position={[0, 1.2, 1.6]}
          scale={1.2}
          opacity={0.4}
          speed={0.1}
          segments={20}
        />
        <Cloud
          position={[-1.6, 0.6, 2.0]}
          scale={0.9}
          opacity={0.35}
          speed={0.06}
          segments={16}
        />
        <Cloud
          position={[1.4, 0.2, 2.4]}
          scale={0.75}
          opacity={0.3}
          speed={0.05}
          segments={14}
        />
      </Clouds>
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
          physicallyCorrectLights: true,
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
