/**
 * This is the SceneDesigner component.
 * This is the main component that handles all the operations of the appliation itself.
 * Part of this code was written by ChatGPT, these portions are marked with "WRITTEN BY CHATGPT".
 * 
 * The way that this component works is as follows: 
 * 1. It creates a scene, camera, and renderer.
 * 2. It adds a grid to the scene.
 * 3. The user can add their own model to the scene.
 * 4. The user adds the route for tha astronaut to take.
 * 5. The program will evaluate the route and give a score.

 */


// Note: Handle point highlighting better later


"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

type RouteType = "handrail" | "free_drift" | "tethered";

type SavedPoint = {
  instanceId: number;
  position: { x: number; y: number; z: number };
};

  //Define a type for handling the line data
  //This could be worked into line analysis later on and potentially used to store all of the line segemnts as the entire route for analysis
  type LineData = {
    line: THREE.Line;
    startPointId: number;
    endPointId: number;
    isCurved: boolean;
    radius: number; // curve radius (offset magnitude)
    t: number; // control point position along the line [0..1]
    timeAtLocation: number; // time spent at this location (seconds)
    taskType: "push" | "pull" | "reach" | "translate" | "rotate" | "none"; // type of task performed
    taskIntensity: number; // intensity of task (0-10 scale)
  };

// Hide the non-selected plane instances
const HIDDEN_SCALE = 0.001; 
const MIN_PLANE = -5;
const MAX_PLANE = 5;

// Build a curved geometry using a quadratic Bezier with a user-controlled control point.
function createCurvedLineGeometryWithParams(start: THREE.Vector3, end: THREE.Vector3, radius: number, t: number) {
  const direction = new THREE.Vector3().subVectors(end, start);
  const pointOnLine = new THREE.Vector3().copy(start).addScaledVector(direction, Math.max(0, Math.min(1, t)));
  const up = new THREE.Vector3(0, 1, 0);
  let normal = new THREE.Vector3().crossVectors(direction, up);
  if (normal.lengthSq() < 1e-6) {
    normal = new THREE.Vector3().crossVectors(direction, new THREE.Vector3(1, 0, 0));
  }
  normal.normalize().multiplyScalar(radius);
  const control = new THREE.Vector3().copy(pointOnLine).add(normal);
  const curve = new THREE.QuadraticBezierCurve3(start, control, end);
  const points = curve.getPoints(64);
  return new THREE.BufferGeometry().setFromPoints(points);
}

export default function SceneDesigner() {
  const containerRef = useRef<HTMLDivElement | null>(null);


  //React state variable implemmentations
  //where the plane is
  const [planeIndex, setPlaneIndex] = useState<number>(-5);
  //number of lines
  const [linesCount, setLinesCount] = useState<number>(0);

  //what type of route the astronaut will take
  const [routeType, setRouteType] = useState<RouteType>("handrail");
  
  //is color blind mode on
  const [colorBlindMode, setColorBlindMode] = useState<boolean>(false);

  //set the disstance between the two points to derive the unit
  const [unitDistance, setUnitDistance] = useState<number | null>(null);

  //saved points for the route
  const [savedPoints, setSavedPoints] = useState<SavedPoint[]>([]);

  //show the scene panel
  const [showScenePanel, setShowScenePanel] = useState<boolean>(true);

  //show the plane panel
  const [showPlanePanel, setShowPlanePanel] = useState<boolean>(true);

  //is the model loading
  const [isLoadingModel, setIsLoadingModel] = useState<boolean>(false);

  //the imported model
  const [importedModel, setImportedModel] = useState<THREE.Group | null>(null);

  //the density of the grid
  const [gridDensity, setGridDensity] = useState<number>(31); // Higher density for smaller points

  //tracks when points are replaced/restored to trigger re-renders
  const [replacementChangeTrigger, setReplacementChangeTrigger] = useState<number>(0);

  //selected line index for editing
  const [selectedLineIndex, setSelectedLineIndex] = useState<number | null>(null);

  //trigger to force re-render when line parameters change
  const [lineParamsTrigger, setLineParamsTrigger] = useState<number>(0);

  //path quality score
  const [pathQualityScore, setPathQualityScore] = useState<number>(100);

  //is the model plane open
  const [showModelPanel, setShowModelPanel] = useState<boolean>(false);

  //what is the scale of the model
  const [modelScale, setModelScale] = useState<number>(1);

  //what is the rotation of the model
  const [modelRotation, setModelRotation] = useState<{x: number, y: number, z: number}>({x: 0, y: 0, z: 0});

  //what is the position of the model
  const [modelPosition, setModelPosition] = useState<{x: number, y: number, z: number}>({x: 0, y: 0, z: 0});

  //clipping plane height for slicing the model vertically
  const [clippingHeight, setClippingHeight] = useState<number>(10); // Default to show full model

  //memoized colors
  const defaultColor = useMemo(
    () => new THREE.Color(0xffffff), // White default points
    [colorBlindMode]
  );
  const hoverColor = useMemo(
    () => new THREE.Color(0xffffff), // White on hover (brighter effect can be added)
    [colorBlindMode]
  );
  const clickedColor = useMemo(
    () => new THREE.Color(0xff3333), // Red when clicked/toggled
    [colorBlindMode]
  );

  //WRITTEN BY CHATGPT: This is the code that handles the 3D scene and the interactions with the scene.

  const worldGroupRef = useRef<THREE.Group | null>(null);
  const pointsMeshRef = useRef<THREE.InstancedMesh | null>(null);
  const basePositionsRef = useRef<THREE.Vector3[] | null>(null);
  const gridYRef = useRef<Int16Array | null>(null);
  const createdLinesRef = useRef<LineData[]>([]);
  const hoveredIdRef = useRef<number | null>(null);
  const selectedARef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const importedModelRef = useRef<THREE.Group | null>(null);
  const planeIndexRef = useRef<number>(planeIndex);
  const routeTypeRef = useRef<RouteType>(routeType);
  const replacedPointsRef = useRef<Map<number, {mesh: THREE.Mesh, plane: number}>>(new Map());
  const currentRedPointRef = useRef<number | null>(null); // Track the currently red point
  const previousPointRef = useRef<number | null>(null); // Track the previous point for line drawing
  const selectedLineIndexRef = useRef<number | null>(null); // Track selected line for editing


  //UseEffect for the scene
  useEffect(() => {

    //if the container is not found, return
    if (!containerRef.current) return;
    const container = containerRef.current;

    //create the scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);

    // Create starfield background
    const starGeometry = new THREE.BufferGeometry();
    const starCount = 2000;
    const starPositions = new Float32Array(starCount * 3);
    const starColors = new Float32Array(starCount * 3);
    
    //Add the stars to the scene (purely for aesthetic purposes)
    for (let i = 0; i < starCount; i++) {
      const i3 = i * 3;
      // Distribute stars in a large sphere around the scene
      const radius = 100 + Math.random() * 400;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      
      starPositions[i3] = radius * Math.sin(phi) * Math.cos(theta);
      starPositions[i3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
      starPositions[i3 + 2] = radius * Math.cos(phi);
      
      // Vary star brightness
      const brightness = 0.5 + Math.random() * 0.5;
      starColors[i3] = brightness;
      starColors[i3 + 1] = brightness;
      starColors[i3 + 2] = brightness;
    }
    
    starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    starGeometry.setAttribute('color', new THREE.BufferAttribute(starColors, 3));
    
    //This is the material that is used for the very very very aesthetic starfield background
    const starMaterial = new THREE.PointsMaterial({
      size: 0.5,
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
      sizeAttenuation: true
    });
    
    //Add the stars to the scene
    const stars = new THREE.Points(starGeometry, starMaterial);
    scene.add(stars);

    //create the camera, this position will be changed later for route tracing
    const camera = new THREE.PerspectiveCamera(
      60,
      container.clientWidth / container.clientHeight,
      0.1,
      1000
    );
    camera.position.set(8, 8, 8);

    //create the renderer using WebGL (faster than canvas)
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.localClippingEnabled = true; // Enable clipping planes
    container.appendChild(renderer.domElement);

    //add the orbit controls to the camera, this is to allo the user to orbit the scene
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

    const worldGroup = new THREE.Group();
    worldGroupRef.current = worldGroup;
    scene.add(worldGroup);

    const gridHelper = new THREE.GridHelper(50, 50, 0x666666, 0x444444);
    gridHelper.position.y = -6;
    worldGroup.add(gridHelper);

    // Grid points (instanced spheres) - will be regenerated when density changes
    //This was changed from a 3D grid to a 2D grid to simplify the code. Originally the grid was fully rendered into the scene in 3D and then sliced vertically.
    //Now, a single plane of points is rendered into the scene and moved vertically to create the illusion of a 3D grid.
    function createGridPoints(density: number) {
      // Remove old mesh if it exists (but preserve other objects like imported models)
      if (pointsMeshRef.current) {
        worldGroup.remove(pointsMeshRef.current);
        pointsMeshRef.current.geometry.dispose();
        (pointsMeshRef.current.material as THREE.Material).dispose();
      }

      const GRID = density;
      const total = GRID * GRID; // Only 2D grid now (X and Y)
      const geom = new THREE.SphereGeometry(0.08, 12, 12);
      const mat = new THREE.MeshStandardMaterial({ color: defaultColor });
      const mesh = new THREE.InstancedMesh(geom, mat, total);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

      mesh.name = 'gridPoints';
      pointsMeshRef.current = mesh;

      const tmpM = new THREE.Matrix4();
      const tmpQ = new THREE.Quaternion();
      const tmpS = new THREE.Vector3(1, 1, 1);
      const positions: THREE.Vector3[] = []; // Base 2D positions (X, Y only)

      const start = MIN_PLANE;
      const span = MAX_PLANE - MIN_PLANE;
      const step = GRID > 1 ? span / (GRID - 1) : 0;

      // Generate 2D grid (only X and Z)
      let k = 0;
      for (let ix = 0; ix < GRID; ix++) {
        const xv = start + ix * step;
        for (let iz = 0; iz < GRID; iz++) {
          const zv = start + iz * step;
          // All points start at Y = 0, will be moved by planeIndex
          const p = new THREE.Vector3(xv, 0, zv);
          positions.push(p);
          tmpM.compose(p, tmpQ, tmpS);
          mesh.setMatrixAt(k, tmpM);
          mesh.setColorAt(k, defaultColor);
          k++;
        }
      }
      mesh.instanceMatrix.needsUpdate = true;

      mesh.updateMatrixWorld(true);
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      basePositionsRef.current = positions;
      gridYRef.current = null; // No longer needed
      worldGroup.add(mesh);
      
      return mesh;
    }

    const mesh = createGridPoints(gridDensity);

    const raycaster = new THREE.Raycaster();
    // @ts-ignore improve line raycast threshold
    raycaster.params.Line = { ...raycaster.params.Line, threshold: 0.1 };
    // @ts-ignore improve point raycast threshold for smaller spheres
    raycaster.params.Points = { ...raycaster.params.Points, threshold: 0.2 };
    const ndc = new THREE.Vector2();
    let hovered: number | null = null;

    function setColor(id: number, color: THREE.Color) {
      mesh.setColorAt(id, color);
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }

    function createCurvedLineGeometryWithParams(start: THREE.Vector3, end: THREE.Vector3, radius: number, t: number) {
      const direction = new THREE.Vector3().subVectors(end, start);
      const pointOnLine = new THREE.Vector3().copy(start).addScaledVector(direction, Math.max(0, Math.min(1, t)));
      const up = new THREE.Vector3(0, 1, 0);
      let normal = new THREE.Vector3().crossVectors(direction, up);
      if (normal.lengthSq() < 1e-6) {
        normal = new THREE.Vector3().crossVectors(direction, new THREE.Vector3(1, 0, 0));
      }
      normal.normalize().multiplyScalar(radius);
      const control = new THREE.Vector3().copy(pointOnLine).add(normal);
      const curve = new THREE.QuadraticBezierCurve3(start, control, end);
      const points = curve.getPoints(64);
      return new THREE.BufferGeometry().setFromPoints(points);
    }

    function getPos(id: number) {
      const m = new THREE.Matrix4();
      const p = new THREE.Vector3();
      const q = new THREE.Quaternion();
      const s = new THREE.Vector3();
      mesh.getMatrixAt(id, m);
      m.decompose(p, q, s);
      return p;
    }

    //function to handle the movement of the pointer
    function onMove(e: PointerEvent) {
      const rect = renderer.domElement.getBoundingClientRect();
      ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(ndc, camera);
      const hits = raycaster.intersectObject(mesh, false);

      const lastHovered = hovered;
      let currentHoveredId: number | null = null;

      if (hits.length && typeof hits[0].instanceId === "number") {
        const id = hits[0].instanceId;
        // All points are on the same plane now, so no need to check plane
        currentHoveredId = id;
      }

      // Reset previous hover color (but don't override replaced points)
      if (lastHovered !== null && lastHovered !== currentHoveredId) {
        if (!replacedPointsRef.current.has(lastHovered)) {
          setColor(lastHovered, defaultColor);
        }
      }

      // Set new hover color (but don't override replaced points)
      if (currentHoveredId !== null && currentHoveredId !== lastHovered) {
        if (!replacedPointsRef.current.has(currentHoveredId)) {
          setColor(currentHoveredId, hoverColor);
        }
      }

      hovered = currentHoveredId;
    }

    function onDown(e: PointerEvent) {
      const rect = renderer.domElement.getBoundingClientRect();
      ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(ndc, camera);

      // First check for hits on existing lines and toggle selection
      let clickedLineIndex: number | null = null;
      for (let i = 0; i < createdLinesRef.current.length; i++) {
        const hit = raycaster.intersectObject(createdLinesRef.current[i].line, false);
        if (hit.length > 0) { clickedLineIndex = i; break; }
      }
      if (clickedLineIndex !== null) {
        const newSelected = selectedLineIndexRef.current === clickedLineIndex ? null : clickedLineIndex;
        selectedLineIndexRef.current = newSelected;
        setSelectedLineIndex(newSelected);
        return;
      }

      // First check for hits on replacement points (red points)
      let clickedReplacementId: number | null = null;
      for (const [originalId, replacementData] of replacedPointsRef.current) {
        const replacementHits = raycaster.intersectObject(replacementData.mesh, false);
        if (replacementHits.length > 0) {
          clickedReplacementId = originalId;
          break;
        }
      }

      // Check for hits on the main instanced mesh
      const hits = raycaster.intersectObject(mesh, false);
      let clickedPointId: number | null = null;

      if (hits.length > 0) {
        // Raycast hit detected
      }

      if (clickedReplacementId !== null) {
        clickedPointId = clickedReplacementId;
      } else if (hits.length && typeof hits[0].instanceId === "number") {
        clickedPointId = hits[0].instanceId;
      }

      if (clickedPointId === null) return;

      // If there's a currently red point, restore it to original color
      if (currentRedPointRef.current !== null && currentRedPointRef.current !== clickedPointId) {
        const prevRedId = currentRedPointRef.current;
        if (replacedPointsRef.current.has(prevRedId)) {
          const replacementData = replacedPointsRef.current.get(prevRedId)!;
          worldGroup.remove(replacementData.mesh);
          replacementData.mesh.geometry.dispose();
          (replacementData.mesh.material as THREE.Material).dispose();
          replacedPointsRef.current.delete(prevRedId);
        }
      }

      // Make the clicked point red at the current plane using base XZ
      // Use getPos to get the actual position from the instance matrix
      const instancePos = getPos(clickedPointId);
      const replacementGeom = new THREE.SphereGeometry(0.08, 12, 12);
      const replacementMat = new THREE.MeshStandardMaterial({ color: clickedColor });
      const replacementMesh = new THREE.Mesh(replacementGeom, replacementMat);
      // The instance position is in local space, add mesh's Y position for world space
      replacementMesh.position.set(instancePos.x, instancePos.y + planeIndexRef.current, instancePos.z);
      replacementMesh.updateMatrixWorld(true);
      worldGroup.add(replacementMesh);
      replacedPointsRef.current.set(clickedPointId, {mesh: replacementMesh, plane: planeIndexRef.current});

      // Hide the original point in the instanced mesh by scaling it to 0
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const hideScale = new THREE.Vector3(0, 0, 0);
      m.compose(instancePos, q, hideScale);
      mesh.setMatrixAt(clickedPointId, m);
      mesh.instanceMatrix.needsUpdate = true;
      
      setReplacementChangeTrigger(prev => prev + 1);

      // Draw line if this is the second point
      if (previousPointRef.current !== null && previousPointRef.current !== clickedPointId) {
        // Get positions from instance matrices and apply current plane Y
        const aPosLocal = getPos(previousPointRef.current);
        const bPosLocal = getPos(clickedPointId);
        const a = new THREE.Vector3(aPosLocal.x, aPosLocal.y + planeIndexRef.current, aPosLocal.z);
        const b = new THREE.Vector3(bPosLocal.x, bPosLocal.y + planeIndexRef.current, bPosLocal.z);
        const lineGeom = new THREE.BufferGeometry().setFromPoints([a, b]);
        const lineMat = new THREE.LineBasicMaterial({ color: clickedColor });
        const line = new THREE.Line(lineGeom, lineMat);
        worldGroup.add(line);
        createdLinesRef.current.push({ 
          line, 
          startPointId: previousPointRef.current, 
          endPointId: clickedPointId, 
          isCurved: false, 
          radius: 1, 
          t: 0.5,
          timeAtLocation: 0,
          taskType: "none",
          taskIntensity: 0
        });
        setLinesCount(createdLinesRef.current.length);
      }

      // Update references
      previousPointRef.current = clickedPointId;
      currentRedPointRef.current = clickedPointId;
    }

    function onResize() {
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    }

    function animate() {
      controls.update();
      renderer.render(scene, camera);
      requestAnimationFrame(animate);
    }

    container.addEventListener("pointermove", onMove);
    container.addEventListener("pointerdown", onDown);
    window.addEventListener("resize", onResize);
    animate();

    return () => {
      container.removeEventListener("pointermove", onMove);
      container.removeEventListener("pointerdown", onDown);
      window.removeEventListener("resize", onResize);
      createdLinesRef.current.forEach((ld) => {
        ld.line.geometry.dispose();
        (ld.line.material as THREE.Material).dispose();
      });
      // Clean up replacement points
      replacedPointsRef.current.forEach((replacementData) => {
        replacementData.mesh.geometry.dispose();
        (replacementData.mesh.material as THREE.Material).dispose();
      });
      // Clean up imported model
      if (importedModel) {
        worldGroupRef.current?.remove(importedModel);
        importedModel.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.geometry.dispose();
            if (Array.isArray(child.material)) {
              child.material.forEach(material => material.dispose());
            } else {
              child.material.dispose();
            }
          }
        });
      }
      if (renderer.domElement.parentElement === container) container.removeChild(renderer.domElement);
      renderer.dispose();
    };
  }, [defaultColor, hoverColor, clickedColor]);

  useEffect(() => { planeIndexRef.current = planeIndex; }, [planeIndex]);
  useEffect(() => { routeTypeRef.current = routeType; }, [routeType]);
  useEffect(() => { selectedLineIndexRef.current = selectedLineIndex; }, [selectedLineIndex]);

  // Calculate path quality score based on NASA TLX and path metrics
  useEffect(() => {
    const lines = createdLinesRef.current;
    if (lines.length === 0) {
      setPathQualityScore(100);
      return;
    }

    let totalScore = 100;
    let totalLength = 0;
    let sharpTurnPenalty = 0;
    let complexityPenalty = 0;
    let workloadScore = 0;

    // Calculate metrics for each segment
    lines.forEach((lineData, index) => {
      const positions = basePositionsRef.current;
      if (!positions) return;

      const startBase = positions[lineData.startPointId];
      const endBase = positions[lineData.endPointId];
      if (!startBase || !endBase) return;

      // Calculate segment length
      const start = new THREE.Vector3(startBase.x, planeIndex, startBase.z);
      const end = new THREE.Vector3(endBase.x, planeIndex, endBase.z);
      const segmentLength = start.distanceTo(end);
      totalLength += segmentLength;

      // Penalty for curved paths (complexity)
      if (lineData.isCurved) {
        complexityPenalty += Math.abs(lineData.radius) * 2; // Higher radius = more complex
      }

      // Calculate sharp turns (angle between consecutive segments)
      if (index > 0) {
        const prevLine = lines[index - 1];
        const prevStartBase = positions[prevLine.startPointId];
        const prevEndBase = positions[prevLine.endPointId];
        if (prevStartBase && prevEndBase) {
          const prevStart = new THREE.Vector3(prevStartBase.x, planeIndex, prevStartBase.z);
          const prevEnd = new THREE.Vector3(prevEndBase.x, planeIndex, prevEndBase.z);
          
          const dir1 = new THREE.Vector3().subVectors(prevEnd, prevStart).normalize();
          const dir2 = new THREE.Vector3().subVectors(end, start).normalize();
          const angle = Math.acos(Math.max(-1, Math.min(1, dir1.dot(dir2))));
          const angleDegrees = (angle * 180) / Math.PI;

          // Sharp turn penalty (angles > 90 degrees are problematic)
          if (angleDegrees > 90) {
            sharpTurnPenalty += (angleDegrees - 90) / 9; // Scale to 0-10
          }
        }
      }

      // NASA TLX-inspired workload calculation
      // Mental Demand: Task complexity
      const mentalDemand = lineData.taskType !== "none" ? 5 : 0;
      
      // Physical Demand: Based on task intensity
      const physicalDemand = lineData.taskIntensity;
      
      // Temporal Demand: Based on time at location
      const temporalDemand = Math.min(10, lineData.timeAtLocation / 60); // Normalize to 0-10
      
      // Effort: Combination of physical and mental
      const effort = (physicalDemand + mentalDemand) / 2;
      
      // Frustration: Sharp turns and complex paths increase frustration
      const frustration = Math.min(10, (lineData.isCurved ? 3 : 0) + (sharpTurnPenalty / lines.length));

      // Average TLX score for this segment (scale 0-10)
      const segmentWorkload = (mentalDemand + physicalDemand + temporalDemand + effort + frustration) / 5;
      workloadScore += segmentWorkload;
    });

    // Calculate penalties
    const lengthPenalty = Math.min(30, totalLength * 2); // Longer paths reduce score
    const avgWorkload = workloadScore / lines.length;
    const workloadPenalty = avgWorkload * 3; // Scale workload to penalty

    // Calculate final score (0-100)
    totalScore = Math.max(0, Math.min(100, 
      totalScore 
      - lengthPenalty 
      - sharpTurnPenalty 
      - complexityPenalty 
      - workloadPenalty
    ));

    setPathQualityScore(Math.round(totalScore));
  }, [linesCount, lineParamsTrigger, planeIndex]);

  // Regenerate grid when density changes
  useEffect(() => {
    const worldGroup = worldGroupRef.current;
    if (!worldGroup) return;
    
    // Remove old mesh if it exists
    if (pointsMeshRef.current) {
      worldGroup.remove(pointsMeshRef.current);
      pointsMeshRef.current.geometry.dispose();
      (pointsMeshRef.current.material as THREE.Material).dispose();
    }

    const GRID = gridDensity;
    const total = GRID * GRID; // Only 2D grid now (X and Y)
    const geom = new THREE.SphereGeometry(0.08, 12, 12);
    const mat = new THREE.MeshStandardMaterial({ color: defaultColor });
    const mesh = new THREE.InstancedMesh(geom, mat, total);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.name = 'gridPoints';
    pointsMeshRef.current = mesh;

    const tmpM = new THREE.Matrix4();
    const tmpQ = new THREE.Quaternion();
    const tmpS = new THREE.Vector3(1, 1, 1);
    const positions: THREE.Vector3[] = [];

    const start = MIN_PLANE;
    const span = MAX_PLANE - MIN_PLANE;
    const step = GRID > 1 ? span / (GRID - 1) : 0;

    let k = 0;
    // Generate 2D grid (only X and Z)
    for (let ix = 0; ix < GRID; ix++) {
      const xv = start + ix * step;
      for (let iz = 0; iz < GRID; iz++) {
        const zv = start + iz * step;
        // All points start at Y = 0, will be moved by planeIndex
        const p = new THREE.Vector3(xv, 0, zv);
        positions.push(p);
        tmpM.compose(p, tmpQ, tmpS);
        mesh.setMatrixAt(k, tmpM);
        mesh.setColorAt(k, defaultColor);
        k++;
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    basePositionsRef.current = positions;
    gridYRef.current = null;
    // Clear any existing replacement points when regenerating grid
    replacedPointsRef.current.forEach((replacementData) => {
      worldGroup.remove(replacementData.mesh);
      replacementData.mesh.geometry.dispose();
      (replacementData.mesh.material as THREE.Material).dispose();
    });
    replacedPointsRef.current.clear();
    // Clear any existing lines since instance IDs will change
    createdLinesRef.current.forEach((ld) => {
      worldGroup.remove(ld.line);
      ld.line.geometry.dispose();
      (ld.line.material as THREE.Material).dispose();
    });
    createdLinesRef.current = [];
    setLinesCount(0);
    // Reset point selection
    previousPointRef.current = null;
    currentRedPointRef.current = null;
    worldGroup.add(mesh);
  }, [gridDensity, defaultColor]);

  // Handle hiding replaced points in instance matrices
  useEffect(() => {
    const mesh = pointsMeshRef.current;
    if (!mesh) return;

    const totalInstances = mesh.count;
    const tmpM = new THREE.Matrix4();
    const tmpQ = new THREE.Quaternion();
    const normalScale = new THREE.Vector3(1, 1, 1);
    const hideScale = new THREE.Vector3(0, 0, 0);

    // Keep points at base XZ positions
    const positions = basePositionsRef.current;
    if (!positions) return;

    for (let i = 0; i < totalInstances; i++) {
      const p = positions[i];
      const isReplaced = replacedPointsRef.current.has(i);
      const scaleVec = isReplaced ? hideScale : normalScale;
      tmpM.compose(p, tmpQ, scaleVec);
      mesh.setMatrixAt(i, tmpM);
    }

    mesh.instanceMatrix.needsUpdate = true;
    mesh.updateMatrixWorld(true);
  }, [replacementChangeTrigger, gridDensity]);

  // Handle vertical plane positioning
  useEffect(() => {
    const mesh = pointsMeshRef.current;
    if (!mesh) return;

    // Move the entire grid vertically
    mesh.position.y = planeIndex;
    mesh.updateMatrixWorld(true);
  }, [planeIndex]);

  // Handle replacement points positioning
  useEffect(() => {
    const positions = basePositionsRef.current;
    if (!positions) return;

    // Move replacement points to match current plane Y position
    replacedPointsRef.current.forEach((replacementData, pointId) => {
      if (positions[pointId]) {
        const basePos = positions[pointId];
        replacementData.mesh.position.set(basePos.x, planeIndex, basePos.z);
        // Update the plane value stored in the data
        replacementData.plane = planeIndex;
        // Force matrix update for raycasting to work correctly
        replacementData.mesh.updateMatrixWorld(true);
      }
    });
  }, [planeIndex, replacementChangeTrigger]);

  // Apply model transformations and clipping
  useEffect(() => {
    const model = importedModelRef.current;
    if (!model) return;
    
    // Apply scale
    const baseScale = model.userData.baseScale || 1;
    model.scale.setScalar(baseScale * modelScale);
    
    // Apply rotation (in radians)
    model.rotation.set(
      (modelRotation.x * Math.PI) / 180,
      (modelRotation.y * Math.PI) / 180,
      (modelRotation.z * Math.PI) / 180
    );
    
    // Apply position
    model.position.set(
      modelPosition.x,
      modelPosition.y,
      modelPosition.z
    );

    // Apply clipping plane
    const clippingPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), clippingHeight);
    
    model.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        if (Array.isArray(child.material)) {
          child.material.forEach((mat) => {
            mat.clippingPlanes = [clippingPlane];
            mat.clipShadows = true;
            mat.needsUpdate = true;
          });
        } else {
          child.material.clippingPlanes = [clippingPlane];
          child.material.clipShadows = true;
          child.material.needsUpdate = true;
        }
      }
    });
  }, [modelScale, modelRotation, modelPosition, clippingHeight]);

  // Local save/load and evaluation (simplified)
  function saveCurrentPlanePoints() {
    const mesh = pointsMeshRef.current;
    const positions = basePositionsRef.current;
    const yIndex = gridYRef.current;
    if (!mesh || !positions || !yIndex) return;
    const points: SavedPoint[] = [];
    for (let i = 0; i < positions.length; i++) {
      if (yIndex[i] !== planeIndex) continue;
      const p = positions[i];
      points.push({ instanceId: i, position: { x: p.x, y: p.y, z: p.z } });
    }
    setSavedPoints(points);
    try {
      localStorage.setItem("sm_points_plane_" + planeIndex, JSON.stringify(points));
    } catch {}
  }

  function loadPoints() {
    try {
      const raw = localStorage.getItem("sm_points_plane_" + planeIndex);
      if (!raw) return;
      const pts = JSON.parse(raw) as SavedPoint[];
      setSavedPoints(pts);
    } catch {}
  }

  function simpleEvaluate() {
    // Placeholder: flag segments longer than a threshold as "bad movement"
    const threshold = 5;
    const bad = createdLinesRef.current.filter((ld) => {
      const arr = (ld.line.geometry.getAttribute("position") as THREE.BufferAttribute).array as Float32Array;
      const ax = arr[0], ay = arr[1], az = arr[2];
      const bx = arr[arr.length - 3], by = arr[arr.length - 2], bz = arr[arr.length - 1];
      const dx = ax - bx, dy = ay - by, dz = az - bz;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      return d > threshold;
    });
    alert(`Evaluation complete: ${bad.length} potential violations (distance > ${threshold}).`);
  }

  function defineUnitFromTwoPoints() {
    // Simplified UI: use last drawn segment as unit reference
    const last = createdLinesRef.current[createdLinesRef.current.length - 1]?.line;
    if (!last) return;
    const arr = (last.geometry.getAttribute("position") as THREE.BufferAttribute).array as Float32Array;
    const ax = arr[0], ay = arr[1], az = arr[2];
    const bx = arr[arr.length - 3], by = arr[arr.length - 2], bz = arr[arr.length - 1];
    const d = Math.hypot(ax - bx, ay - by, az - bz);
    setUnitDistance(d);
  }

  function importModel() {
    if (!fileInputRef.current) {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.gltf,.glb';
      input.style.display = 'none';
      document.body.appendChild(input);
      fileInputRef.current = input;
    }

    const input = fileInputRef.current;
    input.value = ''; // Reset to allow re-importing same file
    
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      setIsLoadingModel(true);
      const loader = new GLTFLoader();
      const fileURL = URL.createObjectURL(file);

      loader.load(
        fileURL,
        (gltf) => {
          // Remove previous imported model if any
          if (importedModelRef.current && worldGroupRef.current) {
            worldGroupRef.current.remove(importedModelRef.current);
            // Dispose previous model resources
            importedModelRef.current.traverse((child) => {
              if (child instanceof THREE.Mesh) {
                child.geometry.dispose();
                if (Array.isArray(child.material)) {
                  child.material.forEach(material => material.dispose());
                } else {
                  child.material.dispose();
                }
              }
            });
          }

          const model = gltf.scene;
          
          // Center the model at origin
          const box = new THREE.Box3().setFromObject(model);
          const center = box.getCenter(new THREE.Vector3());
          const size = box.getSize(new THREE.Vector3());
          
          // Center model
          model.position.sub(center);
          
          // Scale model to larger size (max dimension = 10 units)
          const maxDim = Math.max(size.x, size.y, size.z);
          if (maxDim > 0) {
            const targetSize = 10;
            const scaleFactor = targetSize / maxDim;
            model.scale.setScalar(scaleFactor);
            // Store base scale for later adjustments
            model.userData.baseScale = scaleFactor;
          }

          // Position at center of viewport (origin)
          model.position.set(0, 0, 0);

          // Add to scene
          model.name = 'importedModel'; // Add name for identification
          worldGroupRef.current?.add(model);
          setImportedModel(model);
          importedModelRef.current = model;
          setIsLoadingModel(false);
          setShowModelPanel(true);

          // Reset model controls to default
          setModelScale(1);
          setModelRotation({x: 0, y: 0, z: 0});
          setModelPosition({x: 0, y: 0, z: 0});
          setClippingHeight(10); // Default to show full model

          // Clean up blob URL
          URL.revokeObjectURL(fileURL);

          console.log('Model loaded successfully:', file.name);
        },
        (progress) => {
          if (progress.total > 0) {
            console.log('Loading progress:', Math.round((progress.loaded / progress.total) * 100) + '%');
          }
        },
        (error) => {
          console.error('Error loading model:', error);
          alert('Error loading model. Please ensure it is a valid GLTF/GLB file.');
          setIsLoadingModel(false);
          URL.revokeObjectURL(fileURL);
        }
      );
    };
    
    input.click();
  }


  //Return the scene designer component
  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
      {/* Top-left UI (collapsible) */}
      {showScenePanel ? (
        <div
          style={{
            position: "absolute",
            top: 12,
            left: 8,
            background: "#000",
            color: "#fff",
            border: "1px solid #fff",
            padding: "12px 14px",
            display: "flex",
            flexDirection: "column",
            gap: 10,
            minWidth: 300
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontSize: 16, fontWeight: 'bold', opacity: 0.9 }}>Scene Controls</div>
            <button onClick={() => setShowScenePanel(false)} aria-label="Collapse scene controls" style={{ width: 28, height: 28, padding: 0 }}>–</button>
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 90 }}>Route type</span>
            <select value={routeType} onChange={(e) => setRouteType(e.target.value as RouteType)}>
              <option value="handrail">Handrail</option>
              <option value="free_drift">Free drift</option>
              <option value="tethered">Tethered</option>
            </select>
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input type="checkbox" checked={colorBlindMode} onChange={(e) => setColorBlindMode(e.target.checked)} />
            <span>Color blind mode</span>
          </label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={() => {
              const g = worldGroupRef.current; if (!g) return;
              createdLinesRef.current.forEach((ld) => { g.remove(ld.line); ld.line.geometry.dispose(); (ld.line.material as THREE.Material).dispose(); });
              createdLinesRef.current = []; setLinesCount(0);
            }}>Clear Lines</button>
            <button onClick={defineUnitFromTwoPoints}>Define Unit (last segment)</button>
            <button onClick={simpleEvaluate}>Evaluate</button>
          </div>
          <div style={{ fontSize: 12, opacity: 0.85 }}>Lines: {linesCount} {unitDistance ? `• Unit: ${unitDistance.toFixed(2)}` : ""}</div>
          {selectedLineIndex !== null && (
            <div style={{ fontSize: 12, opacity: 0.9, background: "rgba(255,255,255,0.08)", padding: 8, borderRadius: 4 }}>
              <div style={{ marginBottom: 6 }}>Edit Line #{selectedLineIndex + 1}</div>
              <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <input
                  type="checkbox"
                  checked={createdLinesRef.current[selectedLineIndex]?.isCurved || false}
                  onChange={(e) => {
                    const ld = createdLinesRef.current[selectedLineIndex!];
                    if (!ld) return;
                    ld.isCurved = e.target.checked;
                    // Rebuild geometry
                    const positions = basePositionsRef.current;
                    if (!positions) return;
                    const sBase = positions[ld.startPointId];
                    const eBase = positions[ld.endPointId];
                    if (!sBase || !eBase) return;
                    const start = new THREE.Vector3(sBase.x, planeIndex, sBase.z);
                    const end = new THREE.Vector3(eBase.x, planeIndex, eBase.z);
                    const newGeom = ld.isCurved
                      ? createCurvedLineGeometryWithParams(start, end, ld.radius, ld.t)
                      : new THREE.BufferGeometry().setFromPoints([start, end]);
                    ld.line.geometry.dispose();
                    ld.line.geometry = newGeom;
                    setLineParamsTrigger(prev => prev + 1);
                  }}
                />
                <span>Curved</span>
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span style={{ width: 80 }}>Radius</span>
                <input
                  type="range"
                  min={-5}
                  max={5}
                  step={0.1}
                  value={createdLinesRef.current[selectedLineIndex]?.radius ?? 1}
                  onChange={(e) => {
                    const ld = createdLinesRef.current[selectedLineIndex!];
                    if (!ld) return;
                    ld.radius = parseFloat(e.target.value);
                    setLineParamsTrigger(prev => prev + 1);
                    if (!ld.isCurved) return;
                    const positions = basePositionsRef.current; if (!positions) return;
                    const sBase = positions[ld.startPointId]; const eBase = positions[ld.endPointId]; if (!sBase || !eBase) return;
                    const start = new THREE.Vector3(sBase.x, planeIndex, sBase.z);
                    const end = new THREE.Vector3(eBase.x, planeIndex, eBase.z);
                    const newGeom = createCurvedLineGeometryWithParams(start, end, ld.radius, ld.t);
                    ld.line.geometry.dispose();
                    ld.line.geometry = newGeom;
                  }}
                />
                <span style={{ width: 36, textAlign: "right" }}>{(createdLinesRef.current[selectedLineIndex]?.radius ?? 1).toFixed(1)}</span>
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 80 }}>Curve pos</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={createdLinesRef.current[selectedLineIndex]?.t ?? 0.5}
                  onChange={(e) => {
                    const ld = createdLinesRef.current[selectedLineIndex!];
                    if (!ld) return;
                    ld.t = parseFloat(e.target.value);
                    setLineParamsTrigger(prev => prev + 1);
                    if (!ld.isCurved) return;
                    const positions = basePositionsRef.current; if (!positions) return;
                    const sBase = positions[ld.startPointId]; const eBase = positions[ld.endPointId]; if (!sBase || !eBase) return;
                    const start = new THREE.Vector3(sBase.x, planeIndex, sBase.z);
                    const end = new THREE.Vector3(eBase.x, planeIndex, eBase.z);
                    const newGeom = createCurvedLineGeometryWithParams(start, end, ld.radius, ld.t);
                    ld.line.geometry.dispose();
                    ld.line.geometry = newGeom;
                  }}
                />
                <span style={{ width: 36, textAlign: "right" }}>{(createdLinesRef.current[selectedLineIndex]?.t ?? 0.5).toFixed(2)}</span>
              </label>
              
              <div style={{ borderTop: "1px solid rgba(255,255,255,0.2)", marginTop: 8, paddingTop: 8 }}>
                <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 6 }}>Task Properties</div>
                
                <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <span style={{ width: 80 }}>Time (sec)</span>
                  <input
                    type="number"
                    min={0}
                    max={3600}
                    step={1}
                    value={createdLinesRef.current[selectedLineIndex]?.timeAtLocation ?? 0}
                    onChange={(e) => {
                      const ld = createdLinesRef.current[selectedLineIndex!];
                      if (!ld) return;
                      ld.timeAtLocation = parseFloat(e.target.value) || 0;
                      setLineParamsTrigger(prev => prev + 1);
                    }}
                    style={{ width: 80, padding: 4, background: "#222", color: "#fff", border: "1px solid #555" }}
                  />
                </label>

                <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <span style={{ width: 80 }}>Task type</span>
                  <select
                    value={createdLinesRef.current[selectedLineIndex]?.taskType ?? "none"}
                    onChange={(e) => {
                      const ld = createdLinesRef.current[selectedLineIndex!];
                      if (!ld) return;
                      ld.taskType = e.target.value as LineData["taskType"];
                      setLineParamsTrigger(prev => prev + 1);
                    }}
                    style={{ flex: 1, padding: 4, background: "#222", color: "#fff", border: "1px solid #555" }}
                  >
                    <option value="none">None</option>
                    <option value="push">Push</option>
                    <option value="pull">Pull</option>
                    <option value="reach">Reach</option>
                    <option value="translate">Translate</option>
                    <option value="rotate">Rotate</option>
                  </select>
                </label>

                <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 80 }}>Intensity</span>
                  <input
                    type="range"
                    min={0}
                    max={10}
                    step={0.5}
                    value={createdLinesRef.current[selectedLineIndex]?.taskIntensity ?? 0}
                    onChange={(e) => {
                      const ld = createdLinesRef.current[selectedLineIndex!];
                      if (!ld) return;
                      ld.taskIntensity = parseFloat(e.target.value);
                      setLineParamsTrigger(prev => prev + 1);
                    }}
                  />
                  <span style={{ width: 36, textAlign: "right" }}>{(createdLinesRef.current[selectedLineIndex]?.taskIntensity ?? 0).toFixed(1)}</span>
                </label>
              </div>
            </div>
          )}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={saveCurrentPlanePoints}>Save plane points</button>
            <button onClick={loadPoints}>Load plane points</button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowScenePanel(true)}
          aria-label="Expand scene controls"
          style={{ position: "absolute", top: 12, left: 8, background: "#000", border: "1px solid #fff", padding: "6px 10px" }}
        >
          Controls
        </button>
      )}
      {/* Left vertical Y-plane selector (collapsible) */}
      {showPlanePanel ? (
        <div
          style={{
            position: "absolute",
            bottom: 12,
            left: 8,
            background: "#000",
            border: "1px solid #fff",
            padding: "12px 10px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 10,
            color: "#fff",
            userSelect: "none"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: 80 }}>
            <div style={{ fontSize: 12, opacity: 0.85 }}>Y plane</div>
            <button onClick={() => setShowPlanePanel(false)} aria-label="Collapse plane selector" style={{ width: 24, height: 24, padding: 0 }}>–</button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, padding: 6 }}>
            <button
              aria-label="Decrease plane"
              onClick={() => setPlaneIndex((p) => Math.max(MIN_PLANE, p - 1))}
              style={{ width: 36, height: 36, padding: 0 }}
            >
              −
            </button>
            <div className="vslider-wrap">
              <input
                className="vslider"
                type="range"
                min={MIN_PLANE}
                max={MAX_PLANE}
                step={1}
                value={planeIndex}
                onChange={(e) => setPlaneIndex(parseInt(e.target.value, 10))}
                aria-label="Y plane selector"
              />
            </div>
            <button
              aria-label="Increase plane"
              onClick={() => setPlaneIndex((p) => Math.min(MAX_PLANE, p + 1))}
              style={{ width: 36, height: 36, padding: 0 }}
            >
              +
            </button>
          </div>
          <div style={{ fontSize: 12, opacity: 0.85 }}>Layer: {planeIndex}</div>
        </div>
      ) : (
        <button
          onClick={() => setShowPlanePanel(true)}
          aria-label="Expand plane selector"
          style={{ position: "absolute", bottom: 12, left: 8, background: "#000", border: "1px solid #fff", padding: "6px 10px" }}
        >
          Planes
        </button>
      )}

      {/* Path Quality Score (top-right) */}
      <div
        style={{
          position: "absolute",
          top: 12,
          right: showModelPanel && importedModel ? 320 : 12,
          background: "#000",
          border: "2px solid #fff",
          color: "#fff",
          padding: "12px 16px",
          minWidth: 180,
          transition: "right 0.3s ease"
        }}
      >
        <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 4 }}>Path Quality Score</div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ 
            fontSize: 32, 
            fontWeight: "bold",
            color: pathQualityScore >= 80 ? "#4ade80" : pathQualityScore >= 60 ? "#fbbf24" : pathQualityScore >= 40 ? "#fb923c" : "#ef4444"
          }}>
            {pathQualityScore}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, opacity: 0.6 }}>
              {pathQualityScore >= 80 ? "Excellent" : pathQualityScore >= 60 ? "Good" : pathQualityScore >= 40 ? "Fair" : "Poor"}
            </div>
            <div style={{ 
              width: "100%", 
              height: 6, 
              background: "#333", 
              borderRadius: 3, 
              overflow: "hidden",
              marginTop: 4
            }}>
              <div style={{ 
                width: `${pathQualityScore}%`, 
                height: "100%", 
                background: pathQualityScore >= 80 ? "#4ade80" : pathQualityScore >= 60 ? "#fbbf24" : pathQualityScore >= 40 ? "#fb923c" : "#ef4444",
                transition: "width 0.3s ease"
              }} />
            </div>
          </div>
        </div>
        <div style={{ fontSize: 9, opacity: 0.5, marginTop: 6 }}>
          Based on NASA TLX factors
        </div>
      </div>

      {/* Import Model Button (bottom-right) */}
      <button
        onClick={importModel}
        disabled={isLoadingModel}
        aria-label="Import model"
        style={{
          position: "absolute",
          bottom: 12,
          right: 12,
          background: "#000",
          border: "1px solid #fff",
          color: "#fff",
          padding: "6px 10px",
          cursor: isLoadingModel ? "not-allowed" : "pointer",
          opacity: isLoadingModel ? 0.6 : 1
        }}
      >
        {isLoadingModel ? 'Loading...' : 'Import Model'}
      </button>

      {/* Model Controls Panel (right side) */}
      {showModelPanel && importedModel && (
        <div
          style={{
            position: "absolute",
            top: 12,
            right: 12,
            background: "#000",
            color: "#fff",
            border: "1px solid #fff",
            padding: "12px 14px",
            display: "flex",
            flexDirection: "column",
            gap: 10,
            minWidth: 280
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontSize: 16, fontWeight: 'bold', opacity: 0.9 }}>Model Controls</div>
            <button onClick={() => setShowModelPanel(false)} aria-label="Collapse model controls" style={{ width: 28, height: 28, padding: 0 }}>–</button>
          </div>

          {/* Scale Control */}
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 60 }}>Scale</span>
            <input
              type="range"
              min={0.1}
              max={3}
              step={0.1}
              value={modelScale}
              onChange={(e) => setModelScale(parseFloat(e.target.value))}
            />
            <span style={{ width: 36, textAlign: "right" }}>{modelScale.toFixed(1)}x</span>
          </label>

          {/* Rotation Controls */}
          <div style={{ fontSize: 12, opacity: 0.85, marginTop: 8 }}>Rotation (degrees)</div>
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 20 }}>X</span>
            <input
              type="range"
              min={0}
              max={360}
              step={1}
              value={modelRotation.x}
              onChange={(e) => setModelRotation({...modelRotation, x: parseInt(e.target.value)})}
            />
            <span style={{ width: 36, textAlign: "right" }}>{modelRotation.x}°</span>
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 20 }}>Y</span>
            <input
              type="range"
              min={0}
              max={360}
              step={1}
              value={modelRotation.y}
              onChange={(e) => setModelRotation({...modelRotation, y: parseInt(e.target.value)})}
            />
            <span style={{ width: 36, textAlign: "right" }}>{modelRotation.y}°</span>
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 20 }}>Z</span>
            <input
              type="range"
              min={0}
              max={360}
              step={1}
              value={modelRotation.z}
              onChange={(e) => setModelRotation({...modelRotation, z: parseInt(e.target.value)})}
            />
            <span style={{ width: 36, textAlign: "right" }}>{modelRotation.z}°</span>
          </label>

          {/* Position Controls */}
          <div style={{ fontSize: 12, opacity: 0.85, marginTop: 8 }}>Position</div>
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 20 }}>X</span>
            <input
              type="range"
              min={-10}
              max={10}
              step={0.5}
              value={modelPosition.x}
              onChange={(e) => setModelPosition({...modelPosition, x: parseFloat(e.target.value)})}
            />
            <span style={{ width: 36, textAlign: "right" }}>{modelPosition.x.toFixed(1)}</span>
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 20 }}>Y</span>
            <input
              type="range"
              min={-10}
              max={10}
              step={0.5}
              value={modelPosition.y}
              onChange={(e) => setModelPosition({...modelPosition, y: parseFloat(e.target.value)})}
            />
            <span style={{ width: 36, textAlign: "right" }}>{modelPosition.y.toFixed(1)}</span>
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 20 }}>Z</span>
            <input
              type="range"
              min={-10}
              max={10}
              step={0.5}
              value={modelPosition.z}
              onChange={(e) => setModelPosition({...modelPosition, z: parseFloat(e.target.value)})}
            />
            <span style={{ width: 36, textAlign: "right" }}>{modelPosition.z.toFixed(1)}</span>
          </label>

          {/* Clipping Plane Control */}
          <div style={{ fontSize: 12, opacity: 0.85, marginTop: 8 }}>Slice Height</div>
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 60 }}>Clip</span>
            <input
              type="range"
              min={-10}
              max={10}
              step={0.1}
              value={clippingHeight}
              onChange={(e) => setClippingHeight(parseFloat(e.target.value))}
            />
            <span style={{ width: 36, textAlign: "right" }}>{clippingHeight.toFixed(1)}</span>
          </label>
          <div style={{ fontSize: 10, opacity: 0.6, marginTop: 4 }}>
            Hides model above this height
          </div>

          {/* Reset Button */}
          <button 
            onClick={() => {
              setModelScale(1);
              setModelRotation({x: 0, y: 0, z: 0});
              setModelPosition({x: 0, y: 0, z: 0});
              setClippingHeight(10);
            }}
            style={{ marginTop: 8 }}
          >
            Reset Transform
          </button>
        </div>
      )}

      {!showModelPanel && importedModel && (
        <button
          onClick={() => setShowModelPanel(true)}
          aria-label="Expand model controls"
          style={{ position: "absolute", top: 12, right: 12, background: "#000", border: "1px solid #fff", padding: "6px 10px" }}
        >
          Model
        </button>
      )}
    </div>
  );
}


