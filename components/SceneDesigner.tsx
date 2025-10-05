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
import ISSPositionDisplay from "./ISSPositionDisplay";

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
    routeType: RouteType; // type of route for this segment
  };

// Hide the non-selected plane instances
const HIDDEN_SCALE = 0.001; 
const MIN_PLANE = -10;
const MAX_PLANE = 10;

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

interface SceneDesignerProps {
  onShowTutorial?: () => void;
}

export default function SceneDesigner({ onShowTutorial }: SceneDesignerProps = {}) {
  const containerRef = useRef<HTMLDivElement | null>(null);


  //React state variable implemmentations
  //where the plane is
  const [planeIndex, setPlaneIndex] = useState<number>(0);
  //number of lines
  const [linesCount, setLinesCount] = useState<number>(0);

  //set the disstance between the two points to derive the unit
  const [unitDistance, setUnitDistance] = useState<number | null>(null);

  //saved points for the route
  const [savedPoints, setSavedPoints] = useState<SavedPoint[]>([]);

  //show the scene panel
  const [showScenePanel, setShowScenePanel] = useState<boolean>(true);

  //show the plane panel
  const [showPlanePanel, setShowPlanePanel] = useState<boolean>(false);

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

  //space station builder controls
  const [showStationBuilder, setShowStationBuilder] = useState<boolean>(false);

  //path quality score info popup
  const [showScoreInfo, setShowScoreInfo] = useState<boolean>(false);

  const presetModels = [
    { name: "Gateway", path: "/models/gateway.glb" },
    // Add more models by placing .glb or .gltf files in public/models/
  ];

  //memoized colors
  const defaultColor = useMemo(
    () => new THREE.Color(0xffffff), // White default points
    []
  );
  const hoverColor = useMemo(
    () => new THREE.Color(0xffffff), // White on hover (brighter effect can be added)
    []
  );
  const clickedColor = useMemo(
    () => new THREE.Color(0xff3333), // Red when clicked/toggled
    []
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

    const gridHelper = new THREE.GridHelper(100, 100, 0x666666, 0x444444);
    gridHelper.position.y = -11;
    worldGroup.add(gridHelper);

    // Grid points (instanced spheres) - will be regenerated when density changes
    // This was changed from a 3D grid to a 2D grid to simplify the code. Originally the grid was fully rendered into the scene in 3D and then sliced vertically.
    // Now, a single plane of points is rendered into the scene and moved vertically to create the illusion of a 3D grid.
    
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

      //Calculate the start and span of the grid
      //This is essentially just the bounds of the points in the scene
      const start = MIN_PLANE;
      const span = MAX_PLANE - MIN_PLANE;

      //Step size is the distance between each point in the grid
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
    raycaster.params.Line = { ...raycaster.params.Line, threshold: 0.1 };
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
          taskIntensity: 0,
          routeType: "handrail"
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
  useEffect(() => { selectedLineIndexRef.current = selectedLineIndex; }, [selectedLineIndex]);

  // Calculate path quality score based on NASA TLX and path metrics
  useEffect(() => {
    const lines = createdLinesRef.current;
    if (lines.length === 0) {
      setPathQualityScore(100);
      return;
    }

    //This is our starting value
    let totalScore = 100;

    //Starting length of all of the line segments
    let totalLength = 0;

    //Total time that has elapsed
    //In future iterations it would be good to handle the time component independently
    let totalTime = 0;

    //Different penalty to applied to the total score
    let sharpTurnPenalty = 0;
    let complexityPenalty = 0;
    let workloadScore = 0;
    let taskPenalty = 0;
    let fatiguePenalty = 0;

    // Task type difficulty multipliers
    const taskDifficulty: Record<string, number> = {
      "none": 0,
      "reach": 2,
      "push": 3,
      "pull": 3,
      "translate": 4,
      "rotate": 5
    };

    // Route type efficiency factors
    const routeEfficiency: Record<RouteType, number> = {
      "handrail": 1.0,      // Most stable and efficient
      "free_drift": 1.3,    // Requires more control
      "tethered": 1.2       // Some restriction but aided
    };

    // We need to determine the values at each lines segment
    lines.forEach((lineData, index) => {
      const positions = basePositionsRef.current;
      if (!positions) return;

      //Start point & end point
      const startBase = positions[lineData.startPointId];
      const endBase = positions[lineData.endPointId];
      if (!startBase || !endBase) return;

      // Determine the line segment length
      const start = new THREE.Vector3(startBase.x, planeIndex, startBase.z);
      const end = new THREE.Vector3(endBase.x, planeIndex, endBase.z);
      const segmentLength = start.distanceTo(end);

      //Add it onto the total length of the line
      totalLength += segmentLength;

      // Apply route type efficiency to length penalty
      const routeMultiplier = routeEfficiency[lineData.routeType] || 1.0;
      totalLength += segmentLength * (routeMultiplier - 1); // Add extra penalty for less efficient routes

      // Accumulate total time including task time
      const segmentTime = lineData.timeAtLocation;
      totalTime += segmentTime;

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

      // Enhanced Task Analysis
      const baseTaskDifficulty = taskDifficulty[lineData.taskType] || 0;
      const taskComplexity = baseTaskDifficulty * (lineData.taskIntensity / 10); // 0-5 scale
      
      // Time spent on task creates fatigue (longer tasks are harder)
      const timeFactor = Math.min(5, segmentTime / 120); // Every 2 minutes = 1 point, cap at 5
      
      // Combined task penalty: difficulty × intensity × time
      if (lineData.taskType !== "none") {
        taskPenalty += taskComplexity * (1 + timeFactor * 0.5); // Time amplifies task difficulty
      }

      // Mental Demand: Task complexity and route type
      const mentalDemand = Math.min(10, baseTaskDifficulty + (routeMultiplier - 1) * 5);
      
      // Physical Demand: Based on task intensity
      const physicalDemand = lineData.taskIntensity;
      
      // Temporal Demand: Based on time at location (pressure increases with duration)
      const temporalDemand = Math.min(10, (segmentTime / 180) * 10); // 3 minutes = max pressure
      
      // Effort: Combination of physical, mental, and route difficulty
      const effort = Math.min(10, (physicalDemand + mentalDemand) / 2 + taskComplexity);
      
      // Frustration: Sharp turns, complex paths, and difficult tasks
      const frustration = Math.min(10, 
        (lineData.isCurved ? 3 : 0) + 
        (sharpTurnPenalty / lines.length) +
        (taskComplexity * 0.5)
      );

      // Average TLX score for this segment (scale 0-10)
      const segmentWorkload = (mentalDemand + physicalDemand + temporalDemand + effort + frustration) / 5;
      workloadScore += segmentWorkload;
    });

    // Fatigue penalty: Total time on EVA (extended duration increases risk)
    // Assume 30 min optimal, penalty increases after that
    if (totalTime > 1800) { // 30 minutes
      fatiguePenalty = Math.min(15, (totalTime - 1800) / 120); // 1 point per 2 extra minutes, cap at 15
    }

    // Calculate penalties with enhanced weighting
    const lengthPenalty = Math.min(25, totalLength * 1.5); // Path length
    const avgWorkload = workloadScore / lines.length;
    const workloadPenalty = avgWorkload * 2.5; // NASA TLX workload
    const enhancedTaskPenalty = Math.min(20, taskPenalty); // Task difficulty cap

    // Calculate final score (0-100)
    totalScore = Math.max(0, Math.min(100, 
      totalScore 
      - lengthPenalty 
      - sharpTurnPenalty 
      - complexityPenalty 
      - workloadPenalty
      - enhancedTaskPenalty
      - fatiguePenalty
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

  // Apply the transformations to the model and the clipping funciton as well
  useEffect(() => {
    const model = importedModelRef.current;
    if (!model) return;
    
    // Apply scale
    const baseScale = model.userData.baseScale || 1;
    model.scale.setScalar(baseScale * modelScale);
    
    // Apply rotations, apply proper unit radian degree conversions
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

  function loadModelFromURL(url: string, modelName: string) {
    setIsLoadingModel(true);
    const loader = new GLTFLoader();

    loader.load(
      url,
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
        model.name = 'importedModel';
        worldGroupRef.current?.add(model);
        setImportedModel(model);
        importedModelRef.current = model;
        setIsLoadingModel(false);
        setShowModelPanel(true);

        // Check if this is the Gateway model and apply preset transformations
        if (modelName.toLowerCase().includes('gateway')) {
          setModelScale(3.0);
          setModelRotation({x: 195, y: 63, z: 79});
          setModelPosition({x: 0.5, y: 0.5, z: 1.5});
          setClippingHeight(0.4);
        } else {
          // Reset model controls to default for other models
          setModelScale(1);
          setModelRotation({x: 0, y: 0, z: 0});
          setModelPosition({x: 0, y: 0, z: 0});
          setClippingHeight(10);
        }

        console.log('Model loaded successfully:', modelName);
      },
      (progress) => {
        if (progress.total > 0) {
          console.log('Loading progress:', Math.round((progress.loaded / progress.total) * 100) + '%');
        }
      },
      (error) => {
        console.error('Error loading model:', error);
        alert(`Error loading ${modelName}. Please ensure the file exists in the /models folder.`);
        setIsLoadingModel(false);
      }
    );
  }

  //Simple function to import model and load the model into the viewport
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

      const fileURL = URL.createObjectURL(file);
      loadModelFromURL(fileURL, file.name);
      
      // Clean up blob URL after loading starts
      setTimeout(() => URL.revokeObjectURL(fileURL), 100);
    };
    
    input.click();
  }

  // Claude Sonnet aided in the development of the hollow cylinder functions to place items in the right location
  // As mentioned in the pitch, further versions of this function would allow for more different objects that could be placed
  function createHollowCylinder() {
    // Remove previous model if any
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

    // Create space station module
    const outerRadius = 2;
    const innerRadius = 1.85;
    const length = 10;
    const radialSegments = 32;

    const moduleGroup = new THREE.Group();
    moduleGroup.name = 'spaceStationModule';

    // Main hull - white/cream color like ISS (tube geometry for hollow shell)
    const hullGeometry = new THREE.CylinderGeometry(outerRadius, outerRadius, length, radialSegments, 1, true);
    const hullMaterial = new THREE.MeshStandardMaterial({ 
      color: 0xf0f0e8, 
      metalness: 0.3,
      roughness: 0.7,
      side: THREE.DoubleSide
    });
    const hull = new THREE.Mesh(hullGeometry, hullMaterial);
    moduleGroup.add(hull);

    // Add structural rings along the module (hollow tubes)
    const numRings = 5;
    const ringThickness = 0.15;
    const ringHeight = 0.3;
    for (let i = 0; i < numRings; i++) {
      const ringGeometry = new THREE.CylinderGeometry(
        outerRadius + ringThickness, 
        outerRadius + ringThickness, 
        ringHeight, 
        radialSegments,
        1,
        true // Open ended - hollow tube
      );
      const ringMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x4a4a4a,
        metalness: 0.8,
        roughness: 0.3,
        side: THREE.DoubleSide
      });
      const ring = new THREE.Mesh(ringGeometry, ringMaterial);
      const spacing = length / (numRings + 1);
      ring.position.y = -length / 2 + spacing * (i + 1);
      moduleGroup.add(ring);
    }

    // Add windows/portholes
    const numWindows = 8;
    const windowRadius = 0.25;
    for (let i = 0; i < numWindows; i++) {
      const angle = (i / numWindows) * Math.PI * 2;
      const windowGeometry = new THREE.CircleGeometry(windowRadius, 16);
      const windowMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x1a3a5a,
        metalness: 0.9,
        roughness: 0.1,
        emissive: 0x0a1a2a,
        emissiveIntensity: 0.3
      });
      const window = new THREE.Mesh(windowGeometry, windowMaterial);
      
      // Position windows around the cylinder
      window.position.x = Math.cos(angle) * (outerRadius + 0.01);
      window.position.z = Math.sin(angle) * (outerRadius + 0.01);
      window.position.y = 0;
      
      // Rotate to face outward
      window.lookAt(
        window.position.x * 2,
        window.position.y,
        window.position.z * 2
      );
      
      moduleGroup.add(window);
    }

    // Add solid flat end caps
    const capGeometry = new THREE.CircleGeometry(outerRadius, radialSegments);
    const capMaterial = new THREE.MeshStandardMaterial({ 
      color: 0xdddddd,
      metalness: 0.5,
      roughness: 0.5,
      side: THREE.DoubleSide
    });

    const topCap = new THREE.Mesh(capGeometry, capMaterial);
    topCap.rotation.x = Math.PI / 2;
    topCap.position.y = length / 2;
    moduleGroup.add(topCap);

    const bottomCap = new THREE.Mesh(capGeometry, capMaterial.clone());
    bottomCap.rotation.x = Math.PI / 2;
    bottomCap.position.y = -length / 2;
    moduleGroup.add(bottomCap);

    // Add beveled edges (torus) where caps meet the hull
    const bevelRadius = 0.15;
    const bevelGeometry = new THREE.TorusGeometry(outerRadius - bevelRadius, bevelRadius, 16, radialSegments);
    const bevelMaterial = new THREE.MeshStandardMaterial({ 
      color: 0xdddddd,
      metalness: 0.5,
      roughness: 0.5
    });

    const topBevel = new THREE.Mesh(bevelGeometry, bevelMaterial);
    topBevel.rotation.x = Math.PI / 2;
    topBevel.position.y = length / 2;
    moduleGroup.add(topBevel);

    const bottomBevel = new THREE.Mesh(bevelGeometry, bevelMaterial.clone());
    bottomBevel.rotation.x = Math.PI / 2;
    bottomBevel.position.y = -length / 2;
    moduleGroup.add(bottomBevel);

    
    for (let i = 0; i < 2; i++) {
      const angle = i * Math.PI;
      const mountGeometry = new THREE.BoxGeometry(0.4, 0.6, 0.3);
      const mountMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x555555,
        metalness: 0.6,
        roughness: 0.5
      });
      const mount = new THREE.Mesh(mountGeometry, mountMaterial);
      mount.position.x = Math.cos(angle) * (outerRadius + 0.3);
      mount.position.z = Math.sin(angle) * (outerRadius + 0.3);
      mount.position.y = length / 4;
      moduleGroup.add(mount);
    }

    // Rotate 90 degrees on X axis
    moduleGroup.rotation.x = Math.PI / 2;
    
    // Position at center
    moduleGroup.position.set(0, 0, 0);
    
    // Store base scale
    moduleGroup.userData.baseScale = 1;

    // Add to scene
    worldGroupRef.current?.add(moduleGroup);
    setImportedModel(moduleGroup);
    importedModelRef.current = moduleGroup;
    setShowModelPanel(true);

    // Reset model controls to match initial rotation
    setModelScale(1);
    setModelRotation({x: 90, y: 0, z: 0});
    setModelPosition({x: 0, y: 0, z: 0});
    setClippingHeight(10);

    console.log('Space station module created at center');
  }


  //Return the scene designer component
  // ChatGPT aided in the development of the different styles to increase efficiency
  // In a further iteration of the app it would be useful to separate the application into different components rather than
  // a monolithic 2000 line file and move the styles to a dedicated stylesheet.
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
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={() => {
              const g = worldGroupRef.current; if (!g) return;
              createdLinesRef.current.forEach((ld) => { g.remove(ld.line); ld.line.geometry.dispose(); (ld.line.material as THREE.Material).dispose(); });
              createdLinesRef.current = []; setLinesCount(0);
            }}>Clear Lines</button>
            <button onClick={defineUnitFromTwoPoints}>Define Unit (last segment)</button>
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
                <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 6 }}>Route & Task Properties</div>
                
                <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <span style={{ width: 80 }}>Route type</span>
                  <select
                    value={createdLinesRef.current[selectedLineIndex]?.routeType ?? "handrail"}
                    onChange={(e) => {
                      const ld = createdLinesRef.current[selectedLineIndex!];
                      if (!ld) return;
                      ld.routeType = e.target.value as RouteType;
                      setLineParamsTrigger(prev => prev + 1);
                    }}
                    style={{ flex: 1, padding: 4, background: "#222", color: "#fff", border: "1px solid #555" }}
                  >
                    <option value="handrail">Handrail</option>
                    <option value="free_drift">Free drift</option>
                    <option value="tethered">Tethered</option>
                  </select>
                </label>

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

      {/* path quality score */}
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
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
          <div style={{ fontSize: 11, opacity: 0.7 }}>Path Quality Score</div>
          <button
            onClick={() => setShowScoreInfo(true)}
            aria-label="Path quality score information"
            style={{
              width: 20,
              height: 20,
              borderRadius: "50%",
              background: "#333",
              border: "1px solid #666",
              color: "#fff",
              fontSize: 12,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 0
            }}
          >
            i
          </button>
        </div>
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

      {/* Path Quality Score Info Popup */}
      {showScoreInfo && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            background: "rgba(0, 0, 0, 0.8)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000
          }}
          onClick={() => setShowScoreInfo(false)}
        >
          <div
            style={{
              background: "#000",
              border: "2px solid #fff",
              color: "#fff",
              padding: "24px",
              maxWidth: 600,
              maxHeight: "80vh",
              overflowY: "auto",
              position: "relative"
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h2 style={{ margin: 0, fontSize: 20 }}>Path Quality Score Algorithm</h2>
              <button
                onClick={() => setShowScoreInfo(false)}
                aria-label="Close"
                style={{
                  width: 32,
                  height: 32,
                  background: "#333",
                  border: "1px solid #666",
                  color: "#fff",
                  fontSize: 18,
                  cursor: "pointer",
                  padding: 0
                }}
              >
                ×
              </button>
            </div>
            
            <div style={{ fontSize: 14, lineHeight: 1.6 }}>
              <p style={{ marginTop: 0 }}>
                The Path Quality Score evaluates astronaut movement paths based on NASA Task Load Index (TLX) 
                principles and biomechanical factors. The score starts at 100 and penalties are applied based on:
              </p>

              <h3 style={{ fontSize: 16, marginTop: 20, marginBottom: 8 }}>1. Path Length Penalty</h3>
              <p style={{ margin: "0 0 12px 0" }}>
                <strong>Formula:</strong> min(30, totalLength × 2)<br />
                Longer paths require more energy and time. Each unit of distance adds 2 points of penalty, capped at 30 points.
              </p>

              <h3 style={{ fontSize: 16, marginTop: 20, marginBottom: 8 }}>2. Sharp Turn Penalty</h3>
              <p style={{ margin: "0 0 12px 0" }}>
                <strong>Formula:</strong> (angle - 90°) / 9 for angles &gt; 90°<br />
                Sharp direction changes are difficult in microgravity. Turns over 90 degrees add difficulty, with 180-degree turns adding 10 points.
              </p>

              <h3 style={{ fontSize: 16, marginTop: 20, marginBottom: 8 }}>3. Complexity Penalty</h3>
              <p style={{ margin: "0 0 12px 0" }}>
                <strong>Formula:</strong> |radius| × 2<br />
                Curved paths require more spatial awareness and control. Larger curve radii increase complexity.
              </p>

              <h3 style={{ fontSize: 16, marginTop: 20, marginBottom: 8 }}>4. NASA TLX Workload Score</h3>
              <p style={{ margin: "0 0 8px 0" }}>Based on five factors (each 0-10 scale):</p>
              <ul style={{ marginTop: 0, paddingLeft: 20 }}>
                <li><strong>Mental Demand:</strong> Task complexity (5 if task assigned, 0 if none)</li>
                <li><strong>Physical Demand:</strong> Task intensity value (0-10)</li>
                <li><strong>Temporal Demand:</strong> Time pressure (time/60, capped at 10)</li>
                <li><strong>Effort:</strong> Average of mental and physical demands</li>
                <li><strong>Frustration:</strong> Curved paths (3) + turn difficulty</li>
              </ul>
              <p style={{ margin: "8px 0 12px 0" }}>
                <strong>Formula:</strong> (sum of factors / 5) × 3<br />
                The average workload score is scaled and applied as a penalty.
              </p>

              <h3 style={{ fontSize: 16, marginTop: 20, marginBottom: 8 }}>Final Score</h3>
              <p style={{ margin: "0 0 12px 0" }}>
                <strong>Score = 100 - length penalty - sharp turn penalty - complexity penalty - workload penalty</strong>
              </p>
              <p style={{ margin: "12px 0 0 0" }}>
                The final score is clamped between 0 and 100, with higher scores indicating more efficient, 
                safer paths for astronaut navigation.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Import Model Button - Primary Action (bottom-center) */}
      <div style={{
        position: "absolute",
        bottom: 24,
        left: "50%",
        transform: "translateX(-50%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 12
      }}>
        <button
          onClick={importModel}
          disabled={isLoadingModel}
          aria-label="Import model"
          style={{
            background: "#000",
            border: "3px solid #fff",
            color: "#fff",
            padding: "18px 48px",
            fontSize: 18,
            fontWeight: "bold",
            cursor: isLoadingModel ? "not-allowed" : "pointer",
            opacity: isLoadingModel ? 0.6 : 1,
            boxShadow: isLoadingModel ? "none" : "0 0 20px rgba(255, 255, 255, 0.3)",
            transition: "all 0.3s ease",
            display: "flex",
            alignItems: "center",
            gap: 12,
            letterSpacing: "0.5px"
          }}
          onMouseEnter={(e) => {
            if (!isLoadingModel) {
              e.currentTarget.style.background = "#fff";
              e.currentTarget.style.color = "#000";
              e.currentTarget.style.boxShadow = "0 0 30px rgba(255, 255, 255, 0.6)";
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "#000";
            e.currentTarget.style.color = "#fff";
            e.currentTarget.style.boxShadow = "0 0 20px rgba(255, 255, 255, 0.3)";
          }}
        >
          <span style={{ fontSize: 22 }}>📁</span>
          {isLoadingModel ? 'LOADING MODEL...' : 'IMPORT 3D MODEL'}
        </button>
        <div style={{
          fontSize: 11,
          color: "#888",
          textAlign: "center",
          opacity: 0.8
        }}>
          Upload GLTF or GLB here
        </div>
        
        {/* Preset Models Selector */}
        <div style={{
          marginTop: 8,
          display: "flex",
          alignItems: "center",
          gap: 10
        }}>
          <div style={{
            fontSize: 12,
            color: "#999",
            opacity: 0.9
          }}>
            or load preset:
          </div>
          <select
            disabled={isLoadingModel}
            onChange={(e) => {
              if (e.target.value) {
                const model = presetModels.find(m => m.path === e.target.value);
                if (model) {
                  loadModelFromURL(model.path, model.name);
                }
                e.target.value = ''; // Reset selection
              }
            }}
            style={{
              background: "#000",
              border: "1px solid #666",
              color: "#fff",
              padding: "6px 12px",
              fontSize: 12,
              cursor: isLoadingModel ? "not-allowed" : "pointer",
              opacity: isLoadingModel ? 0.5 : 1
            }}
          >
            <option value="">Choose Model...</option>
            {presetModels.map((model) => (
              <option key={model.path} value={model.path}>
                {model.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Station Builder Button (bottom-right) */}
      <button
        onClick={createHollowCylinder}
        aria-label="Create station module"
        style={{
          position: "absolute",
          bottom: 12,
          right: 12,
          background: "#1a1a1a",
          border: "1px solid #555",
          color: "#aaa",
          padding: "8px 14px",
          fontSize: 13,
          cursor: "pointer",
          borderRadius: 4,
          transition: "all 0.2s ease"
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "#2a2a2a";
          e.currentTarget.style.borderColor = "#777";
          e.currentTarget.style.color = "#fff";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "#1a1a1a";
          e.currentTarget.style.borderColor = "#555";
          e.currentTarget.style.color = "#aaa";
        }}
      >
        + Add Module
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
              style={{ flex: 1 }}
            />
            <input
              type="number"
              min={0}
              max={360}
              value={modelRotation.x}
              onChange={(e) => setModelRotation({...modelRotation, x: Math.max(0, Math.min(360, parseInt(e.target.value) || 0))})}
              style={{ width: 50, padding: 4, background: "#222", color: "#fff", border: "1px solid #555", textAlign: "right" }}
            />
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
              style={{ flex: 1 }}
            />
            <input
              type="number"
              min={0}
              max={360}
              value={modelRotation.y}
              onChange={(e) => setModelRotation({...modelRotation, y: Math.max(0, Math.min(360, parseInt(e.target.value) || 0))})}
              style={{ width: 50, padding: 4, background: "#222", color: "#fff", border: "1px solid #555", textAlign: "right" }}
            />
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
              style={{ flex: 1 }}
            />
            <input
              type="number"
              min={0}
              max={360}
              value={modelRotation.z}
              onChange={(e) => setModelRotation({...modelRotation, z: Math.max(0, Math.min(360, parseInt(e.target.value) || 0))})}
              style={{ width: 50, padding: 4, background: "#222", color: "#fff", border: "1px solid #555", textAlign: "right" }}
            />
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
              style={{ flex: 1 }}
            />
            <input
              type="number"
              min={-10}
              max={10}
              step={0.1}
              value={modelPosition.x}
              onChange={(e) => setModelPosition({...modelPosition, x: Math.max(-10, Math.min(10, parseFloat(e.target.value) || 0))})}
              style={{ width: 50, padding: 4, background: "#222", color: "#fff", border: "1px solid #555", textAlign: "right" }}
            />
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
              style={{ flex: 1 }}
            />
            <input
              type="number"
              min={-10}
              max={10}
              step={0.1}
              value={modelPosition.y}
              onChange={(e) => setModelPosition({...modelPosition, y: Math.max(-10, Math.min(10, parseFloat(e.target.value) || 0))})}
              style={{ width: 50, padding: 4, background: "#222", color: "#fff", border: "1px solid #555", textAlign: "right" }}
            />
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
              style={{ flex: 1 }}
            />
            <input
              type="number"
              min={-10}
              max={10}
              step={0.1}
              value={modelPosition.z}
              onChange={(e) => setModelPosition({...modelPosition, z: Math.max(-10, Math.min(10, parseFloat(e.target.value) || 0))})}
              style={{ width: 50, padding: 4, background: "#222", color: "#fff", border: "1px solid #555", textAlign: "right" }}
            />
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
              style={{ flex: 1 }}
            />
            <input
              type="number"
              min={-10}
              max={10}
              step={0.1}
              value={clippingHeight}
              onChange={(e) => setClippingHeight(Math.max(-10, Math.min(10, parseFloat(e.target.value) || 0)))}
              style={{ width: 50, padding: 4, background: "#222", color: "#fff", border: "1px solid #555", textAlign: "right" }}
            />
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

      {/* ISS Position Display (bottom-right) */}
      <ISSPositionDisplay />

      {/* Help Button (top-right corner) */}
      <button
        onClick={onShowTutorial}
        aria-label="Show tutorial"
        title="Press 'H' to show tutorial"
        style={{
          position: "absolute",
          top: 12,
          right: showModelPanel && importedModel ? (320 + 200 + 24) : (200 + 24),
          width: 36,
          height: 36,
          borderRadius: "50%",
          background: "linear-gradient(135deg, #4ade80 0%, #22c55e 100%)",
          border: "2px solid #fff",
          color: "#000",
          fontSize: 20,
          fontWeight: "bold",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 4px 12px rgba(74, 222, 128, 0.4)",
          transition: "all 0.2s ease",
          zIndex: 10
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = "scale(1.1)";
          e.currentTarget.style.boxShadow = "0 6px 16px rgba(74, 222, 128, 0.6)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = "scale(1)";
          e.currentTarget.style.boxShadow = "0 4px 12px rgba(74, 222, 128, 0.4)";
        }}
      >
        ?
      </button>
    </div>
  );
}


