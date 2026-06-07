"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import * as THREE from "three";
const HERO_SCROLL_DISTANCE = "+=460%";

type HeroSceneProps = {
  modelUrl: string;
  triggerId: string;
  openAngleDeg?: number;
  className?: string;
};

export default function HeroScene({
  modelUrl,
  triggerId,
  openAngleDeg = 105,
  className = "",
}: HeroSceneProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    gsap.registerPlugin(ScrollTrigger);

    const scene = new THREE.Scene();
    scene.background = null;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    mount.appendChild(renderer.domElement);

    const camera = new THREE.PerspectiveCamera(
      35,
      mount.clientWidth / mount.clientHeight,
      0.1,
      100
    );
    camera.position.set(0.6, 1.2, 6.5);

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.2);
    keyLight.position.set(3, 4, 4);
    scene.add(keyLight);

    const fillLight = new THREE.PointLight(0x5ad6ff, 0.6);
    fillLight.position.set(-3, 2, 4);
    scene.add(fillLight);

    const rimLight = new THREE.PointLight(0xff6b6b, 0.5);
    rimLight.position.set(-2, 0.5, -2.5);
    scene.add(rimLight);

    scene.add(new THREE.AmbientLight(0xffffff, 0.4));

    const loader = new GLTFLoader();
    let doorMesh: THREE.Object3D | null = null;
    let doorClosedY = 0;
    let scrollTrigger: ScrollTrigger | null = null;

    loader.load(
      modelUrl,
      (gltf: { scene: any; }) => {
        const root = gltf.scene;
        root.traverse((child: { castShadow: boolean; receiveShadow: boolean; }) => {
          if (child instanceof THREE.Mesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });

        root.position.x += 0.5;
        root.position.y += 1;
        scene.add(root);

        const doorCandidate = root.getObjectByName("door_inner");
        if (doorCandidate) {
          doorMesh = doorCandidate;
          doorClosedY = doorCandidate.rotation.y;
        } else {
          console.warn("door_inner mesh not found in GLB.");
        }

        const triggerElement = document.getElementById(triggerId);
        if (doorMesh && triggerElement) {
          const openAngle = THREE.MathUtils.degToRad(openAngleDeg);
          const timeline = gsap.timeline({
            scrollTrigger: {
              trigger: triggerElement,
              start: "top top",
              end: HERO_SCROLL_DISTANCE,
              scrub: 1,
              pin: true,
              anticipatePin: 1,
            },
          });

          timeline.to(doorMesh.rotation, {
            y: doorClosedY + openAngle,
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

          scrollTrigger = timeline.scrollTrigger ?? null;
        }
      },
      undefined,
      (error: any) => {
        console.error("Failed to load GLB:", error);
      }
    );

    let frameId = 0;
    const renderFrame = () => {
      renderer.render(scene, camera);
      frameId = requestAnimationFrame(renderFrame);
    };

    renderFrame();

    const handleResize = () => {
      if (!mount) return;
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      ScrollTrigger.refresh();
    };

    window.addEventListener("resize", handleResize);

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener("resize", handleResize);
      scrollTrigger?.kill();
      renderer.dispose();
      if (renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
    };
  }, [modelUrl, triggerId, openAngleDeg]);

  return (
    <div
      ref={mountRef}
      className={`h-full w-full ${className}`}
      aria-hidden="true"
    />
  );
}
