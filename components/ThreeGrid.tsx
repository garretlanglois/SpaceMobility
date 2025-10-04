"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

type CleanupHandles = {
  dispose: () => void;
};

export default function ThreeGrid() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState<number>(1);
  const [lineCount, setLineCount] = useState<number>(0);

  const cleanupRef = useRef<CleanupHandles | null>(null);
  const worldGroupRef = useRef<THREE.Group | null>(null);
  const pointsMeshRef = useRef<THREE.InstancedMesh | null>(null);
  const createdLinesRef = useRef<THREE.Line[]>([]);
  const selectedARef = useRef<number | null>(null);
  const hoveredIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b1020);

    const camera = new THREE.PerspectiveCamera(
      60,
      container.clientWidth / container.clientHeight,
      0.1,
      1000
    );
    camera.position.set(8, 8, 8);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 2;
    controls.maxDistance = 200;

    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x222233, 0.8);
    scene.add(hemiLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(5, 10, 7);
    scene.add(dirLight);

    // Group to hold grid and lines so we can uniformly scale
    const worldGroup = new THREE.Group();
    worldGroupRef.current = worldGroup;
    scene.add(worldGroup);

    // Grid helper for orientation
    const gridHelper = new THREE.GridHelper(50, 50, 0x334455, 0x223344);
    gridHelper.position.y = -6;
    worldGroup.add(gridHelper);

    // Create an InstancedMesh of small spheres for points
    const gridCount = 11; // 11x11x11 = 1331 points
    const half = Math.floor(gridCount / 2);
    const sphereGeom = new THREE.SphereGeometry(0.06, 12, 12);
    const pointMaterial = new THREE.MeshStandardMaterial({ color: 0x88ccff });
    const totalInstances = gridCount * gridCount * gridCount;
    const pointsMesh = new THREE.InstancedMesh(
      sphereGeom,
      pointMaterial,
      totalInstances
    );
    pointsMeshRef.current = pointsMesh;
    pointsMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    // Colors per instance (default and selected)
    const defaultColor = new THREE.Color(0x88ccff);
    const hoverColor = new THREE.Color(0xffd166);
    const selectedColor = new THREE.Color(0xef476f);

    const tmpMatrix = new THREE.Matrix4();
    const tmpPosition = new THREE.Vector3();
    const baseSpacing = 1.0;

    let idx = 0;
    for (let x = -half; x <= half; x++) {
      for (let y = -half; y <= half; y++) {
        for (let z = -half; z <= half; z++) {
          tmpMatrix.makeTranslation(
            x * baseSpacing,
            y * baseSpacing,
            z * baseSpacing
          );
          pointsMesh.setMatrixAt(idx, tmpMatrix);
          pointsMesh.setColorAt(idx, defaultColor);
          idx++;
        }
      }
    }
    pointsMesh.instanceMatrix.needsUpdate = true;
    if (pointsMesh.instanceColor) pointsMesh.instanceColor.needsUpdate = true;

    worldGroup.add(pointsMesh);

    // Raycaster & pointer state
    const raycaster = new THREE.Raycaster();
    const pointerNDC = new THREE.Vector2();
    let hoveredId: number | null = null;
    let selectedA: number | null = null;
    createdLinesRef.current = [];
    hoveredIdRef.current = null;
    selectedARef.current = null;

    function getInstancePosition(instanceId: number): THREE.Vector3 {
      const m = new THREE.Matrix4();
      const p = new THREE.Vector3();
      const q = new THREE.Quaternion();
      const s = new THREE.Vector3();
      pointsMesh.getMatrixAt(instanceId, m);
      m.decompose(p, q, s);
      return p;
    }

    function setInstanceColor(instanceId: number, color: THREE.Color) {
      pointsMesh.setColorAt(instanceId, color);
      if (pointsMesh.instanceColor) pointsMesh.instanceColor.needsUpdate = true;
    }

    function resetHover() {
      if (hoveredId !== null && hoveredId !== selectedA) {
        setInstanceColor(hoveredId, defaultColor);
      }
      hoveredId = null;
    }

    function onPointerMove(event: PointerEvent) {
      const rect = renderer.domElement.getBoundingClientRect();
      pointerNDC.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointerNDC.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointerNDC, camera);
      const intersects = raycaster.intersectObject(pointsMesh, false);
      if (intersects.length > 0 && typeof intersects[0].instanceId === "number") {
        const id = intersects[0].instanceId;
        if (hoveredId !== id) {
          if (hoveredId !== null && hoveredId !== selectedA) {
            setInstanceColor(hoveredId, defaultColor);
          }
          hoveredId = id;
          if (hoveredId !== selectedA) setInstanceColor(hoveredId, hoverColor);
        }
      } else {
        resetHover();
      }
    }

    function onPointerDown(event: PointerEvent) {
      const rect = renderer.domElement.getBoundingClientRect();
      pointerNDC.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointerNDC.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointerNDC, camera);
      const intersects = raycaster.intersectObject(pointsMesh, false);
      if (intersects.length === 0) return;
      const hit = intersects[0];
      if (typeof hit.instanceId !== "number") return;
      const id = hit.instanceId;

      if (selectedA === null) {
        selectedA = id;
        selectedARef.current = id;
        setInstanceColor(id, selectedColor);
        return;
      }

      const selectedB = id;
      if (selectedB === selectedA) return;

      const aPos = getInstancePosition(selectedA);
      const bPos = getInstancePosition(selectedB);
      const geom = new THREE.BufferGeometry().setFromPoints([aPos, bPos]);
      const mat = new THREE.LineBasicMaterial({ color: 0xffffff });
      const line = new THREE.Line(geom, mat);
      worldGroup.add(line);
      createdLinesRef.current.push(line);
      setLineCount(createdLinesRef.current.length);

      // Reset selection A but keep its color defaulted back
      setInstanceColor(selectedA, defaultColor);
      selectedA = null;
      selectedARef.current = null;

      // Maintain hover color if applicable
      if (hoveredId !== null) {
        if (hoveredId !== selectedA) setInstanceColor(hoveredId, hoverColor);
      }
    }

    function onResize() {
      const width = container.clientWidth;
      const height = container.clientHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    }

    function animate() {
      controls.update();
      renderer.render(scene, camera);
      requestAnimationFrame(animate);
    }

    renderer.domElement.style.display = "block";
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";

    container.addEventListener("pointermove", onPointerMove);
    container.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("resize", onResize);

    animate();

    cleanupRef.current = {
      dispose: () => {
        container.removeEventListener("pointermove", onPointerMove);
        container.removeEventListener("pointerdown", onPointerDown);
        window.removeEventListener("resize", onResize);
        createdLinesRef.current.forEach((l) => {
          l.geometry.dispose();
          (l.material as THREE.Material).dispose();
          worldGroup.remove(l);
        });
        createdLinesRef.current = [];
        scene.remove(worldGroup);
        pointsMesh.geometry.dispose();
        (pointsMesh.material as THREE.Material).dispose();
        renderer.dispose();
        if (renderer.domElement.parentElement === container) {
          container.removeChild(renderer.domElement);
        }
      }
    };

    // Return cleanup on unmount
    return () => {
      cleanupRef.current?.dispose();
      cleanupRef.current = null;
    };
  }, []);

  // Apply scale to the Three.js group in realtime
  useEffect(() => {
    const group = worldGroupRef.current;
    if (!group) return;
    const s = Math.max(0.25, Math.min(4, scale));
    group.scale.set(s, s, s);
  }, [scale]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
      <div
        style={{
          position: "absolute",
          top: 12,
          left: 12,
          background: "rgba(0,0,0,0.55)",
          color: "#fff",
          padding: "10px 12px",
          borderRadius: 8,
          display: "flex",
          flexDirection: "column",
          gap: 8,
          userSelect: "none"
        }}
      >
        <div style={{ fontSize: 12, opacity: 0.85 }}>
          Left-drag to orbit, wheel to zoom. Click two points to draw a line.
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 60 }}>Scale</span>
          <input
            type="range"
            min={0.5}
            max={3}
            step={0.1}
            value={scale}
            onChange={(e) => setScale(parseFloat(e.target.value))}
          />
          <span style={{ width: 36, textAlign: "right" }}>{scale.toFixed(1)}x</span>
        </label>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => {
              const group = worldGroupRef.current;
              if (!group) return;
              createdLinesRef.current.forEach((l) => {
                group.remove(l);
                l.geometry.dispose();
                (l.material as THREE.Material).dispose();
              });
              createdLinesRef.current = [];
              setLineCount(0);
            }}
            style={{
              background: "#ef476f",
              color: "white",
              border: "none",
              padding: "6px 10px",
              borderRadius: 6,
              cursor: "pointer"
            }}
          >
            Clear Lines
          </button>
          <button
            onClick={() => setScale(1)}
            style={{
              background: "#118ab2",
              color: "white",
              border: "none",
              padding: "6px 10px",
              borderRadius: 6,
              cursor: "pointer"
            }}
          >
            Reset Scale
          </button>
        </div>
        <div style={{ fontSize: 12, opacity: 0.8 }}>Lines: {lineCount}</div>
      </div>
    </div>
  );
}

