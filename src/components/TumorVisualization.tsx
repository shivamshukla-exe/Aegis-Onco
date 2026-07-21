import { useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Environment, Float, MeshDistortMaterial, Points, PointMaterial } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import * as THREE from 'three';

// ────────────────────────────────────────────────────────────────────────────
// Props
// ────────────────────────────────────────────────────────────────────────────

interface Props {
  tumorSize: number;   // 1-180mm
  stage: string;       // 'Stage 0' through 'Stage IV'
  lymphNodes: number;  // 0-45
}

// ────────────────────────────────────────────────────────────────────────────
// Stage → color mapping (kept consistent with POPULATION_STATS.byStage in engine.ts
// and the ACCENT palette in ui.tsx so the 3D scene matches the rest of the app).
// ────────────────────────────────────────────────────────────────────────────

const STAGE_COLORS: Record<string, string> = {
  'Stage 0': '#10b981',   // emerald  — benign / in-situ
  'Stage I': '#3b82f6',   // blue     — early
  'Stage II': '#8b5cf6',  // violet   — regional
  'Stage III': '#f59e0b', // amber    — advanced
  'Stage IV': '#f43f5e',  // rose     — metastatic
};

function stageColor(stage: string): THREE.Color {
  return new THREE.Color(STAGE_COLORS[stage] ?? '#8b5cf6');
}

// Bloom intensity grows with stage severity (0..4)
function stageSeverity(stage: string): number {
  const order = ['Stage 0', 'Stage I', 'Stage II', 'Stage III', 'Stage IV'];
  const idx = order.indexOf(stage);
  return idx < 0 ? 2 : idx; // 0..4
}

// Map tumorSize (1..180mm) → radius (0.3..2.0)
function tumorRadius(tumorSize: number): number {
  const t = Math.min(Math.max((tumorSize - 1) / (180 - 1), 0), 1);
  return 0.3 + t * (2.0 - 0.3);
}

// ────────────────────────────────────────────────────────────────────────────
// TumorMesh — distorted icosahedron with a slow breathing pulse + wireframe overlay
// ────────────────────────────────────────────────────────────────────────────

function TumorMesh({ tumorSize, stage }: { tumorSize: number; stage: string }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const wireRef = useRef<THREE.Mesh>(null);
  const baseRadius = useMemo(() => tumorRadius(tumorSize), [tumorSize]);
  const color = useMemo(() => stageColor(stage), [stage]);

  // Pre-build the distorted icosahedron geometry (detail 4 → smooth-ish irregular sphere)
  const geometry = useMemo(() => {
    const geo = new THREE.IcosahedronGeometry(baseRadius, 4);
    // Jitter vertices slightly for organic irregularity (deterministic per radius)
    const seed = baseRadius * 1000;
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      // cheap deterministic pseudo-noise
      const n = Math.sin(x * 3.1 + seed) * Math.cos(y * 2.7 + seed) * Math.sin(z * 3.3 + seed);
      const f = 1 + n * 0.08;
      pos.setXYZ(i, x * f, y * f, z * f);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    return geo;
  }, [baseRadius]);

  // Wireframe overlay geometry (slightly larger)
  const wireGeometry = useMemo(() => {
    return new THREE.IcosahedronGeometry(baseRadius * 1.04, 2);
  }, [baseRadius]);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    // Slow breathing: ±5% scale, ~4s period
    const pulse = 1 + Math.sin(t * (Math.PI * 2) / 4) * 0.05;
    if (meshRef.current) {
      meshRef.current.scale.setScalar(pulse);
      meshRef.current.rotation.y = t * 0.08;
      meshRef.current.rotation.x = Math.sin(t * 0.15) * 0.1;
    }
    if (wireRef.current) {
      wireRef.current.scale.setScalar(pulse);
      wireRef.current.rotation.y = -t * 0.05;
      wireRef.current.rotation.z = t * 0.03;
    }
  });

  return (
    <group>
      <mesh ref={meshRef} geometry={geometry} castShadow>
        <MeshDistortMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.35}
          roughness={0.35}
          metalness={0.15}
          distort={0.28}
          speed={1.4}
        />
      </mesh>

      {/* Subtle wireframe overlay */}
      <mesh ref={wireRef} geometry={wireGeometry}>
        <meshBasicMaterial
          color={color}
          wireframe
          transparent
          opacity={0.12}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// TissueShell — semi-transparent outer boundary (breast tissue)
// ────────────────────────────────────────────────────────────────────────────

function TissueShell() {
  const ref = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (ref.current) {
      ref.current.rotation.y = t * 0.04;
      ref.current.rotation.x = Math.sin(t * 0.1) * 0.05;
    }
  });

  return (
    <mesh ref={ref}>
      <sphereGeometry args={[2.5, 64, 64]} />
      <meshPhysicalMaterial
        color="#f8c8d0"
        transparent
        opacity={0.06}
        roughness={0.4}
        metalness={0}
        transmission={0.9}
        thickness={0.5}
        ior={1.2}
        side={THREE.BackSide}
        depthWrite={false}
      />
    </mesh>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// MetastaticParticles — N = lymphNodes * 3 glowing points that orbit + drift out
// ────────────────────────────────────────────────────────────────────────────

interface Particle {
  orbitRadius: number;
  angle: number;
  angularVel: number;
  inclination: number;   // latitude offset
  drift: number;         // outward drift speed
  driftPhase: number;    // phase offset for the breathing reset
  size: number;
}

function MetastaticParticles({ lymphNodes }: { lymphNodes: number }) {
  const count = Math.min(Math.max(lymphNodes * 3, 0), 135);
  const pointsRef = useRef<THREE.Points>(null);

  // Build particle state + the BufferGeometry positions
  const { particles, positions, colors } = useMemo(() => {
    const particles: Particle[] = [];
    const positions = new Float32Array(Math.max(count, 1) * 3);
    const colors = new Float32Array(Math.max(count, 1) * 3);

    for (let i = 0; i < count; i++) {
      const orbitRadius = 0.9 + Math.random() * 1.4;
      const angle = Math.random() * Math.PI * 2;
      const angularVel = (0.15 + Math.random() * 0.35) * (Math.random() > 0.5 ? 1 : -1);
      const inclination = (Math.random() - 0.5) * Math.PI * 0.6;
      const drift = 0.05 + Math.random() * 0.12;
      const driftPhase = Math.random() * Math.PI * 2;
      const size = 0.6 + Math.random() * 0.8;

      particles.push({ orbitRadius, angle, angularVel, inclination, drift, driftPhase, size });

      // initial position (will be overwritten in useFrame anyway)
      positions[i * 3] = 0;
      positions[i * 3 + 1] = 0;
      positions[i * 3 + 2] = 0;

      // close = red, far = fading orange (set per-frame, but seed a sane default)
      const c = new THREE.Color('#f43f5e');
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    return { particles, positions, colors };
  }, [count]);

  // Reusable color objects to avoid per-frame allocation
  const colClose = useMemo(() => new THREE.Color('#f43f5e'), []); // red
  const colFar = useMemo(() => new THREE.Color('#f59e0b'), []);   // fading orange
  const tmpColor = useMemo(() => new THREE.Color(), []);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (!pointsRef.current) return;
    const posAttr = pointsRef.current.geometry.attributes.position as THREE.BufferAttribute;
    const colAttr = pointsRef.current.geometry.attributes.color as THREE.BufferAttribute;

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      p.angle += p.angularVel * 0.016; // ~frame delta

      // Breathing outward drift with a slow reset cycle so particles don't escape forever
      const cycle = (t * p.drift + p.driftPhase) % (Math.PI * 2);
      const driftFactor = (1 - Math.cos(cycle)) * 0.5; // 0..1..0
      const r = p.orbitRadius + driftFactor * 0.9;

      const x = Math.cos(p.angle) * Math.cos(p.inclination) * r;
      const y = Math.sin(p.inclination) * r;
      const z = Math.sin(p.angle) * Math.cos(p.inclination) * r;

      posAttr.setXYZ(i, x, y, z);

      // Color by distance from center: close → red, far → fading orange
      const dist = Math.sqrt(x * x + y * y + z * z);
      const dn = Math.min(Math.max((dist - 0.9) / 1.6, 0), 1);
      tmpColor.copy(colClose).lerp(colFar, dn);
      colAttr.setXYZ(i, tmpColor.r, tmpColor.g, tmpColor.b);
    }
    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
  });

  if (count === 0) return null;

  return (
    <Points ref={pointsRef as any} positions={positions} colors={colors} stride={3}>
      <PointMaterial
        vertexColors
        transparent
        size={0.08}
        sizeAttenuation
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </Points>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// SceneLighting — ambient + stage-colored point light at tumor + top directional
// ────────────────────────────────────────────────────────────────────────────

function SceneLighting({ stage }: { stage: string }) {
  const color = useMemo(() => stageColor(stage), [stage]);
  return (
    <>
      <ambientLight intensity={0.25} />
      <pointLight position={[0, 0, 0]} color={color} intensity={2.2} distance={6} decay={2} />
      <directionalLight position={[3, 6, 4]} intensity={0.7} color="#ffffff" castShadow />
      <directionalLight position={[-4, 2, -3]} intensity={0.25} color="#a5b4fc" />
    </>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Scene — everything inside the Canvas (so we can use useFrame via drei <Float>)
// ────────────────────────────────────────────────────────────────────────────

function Scene({ tumorSize, stage, lymphNodes }: Props) {
  const bloomIntensity = useMemo(() => 0.4 + stageSeverity(stage) * 0.28, [stage]);

  return (
    <>
      <SceneLighting stage={stage} />

      <Float speed={1.1} rotationIntensity={0.25} floatIntensity={0.35} floatingRange={[-0.08, 0.08]}>
        <TumorMesh tumorSize={tumorSize} stage={stage} />
        <TissueShell />
        <MetastaticParticles lymphNodes={lymphNodes} />
      </Float>

      <Environment preset="city" />

      <OrbitControls
        autoRotate
        autoRotateSpeed={0.5}
        enableZoom
        minDistance={3.5}
        maxDistance={9}
        enablePan={false}
        minPolarAngle={Math.PI * 0.15}
        maxPolarAngle={Math.PI * 0.75}
        dampingFactor={0.08}
      />

      <EffectComposer>
        <Bloom
          intensity={bloomIntensity}
          luminanceThreshold={0.15}
          luminanceSmoothing={0.5}
          mipmapBlur
        />
        <Vignette eskil={false} offset={0.25} darkness={0.65} />
      </EffectComposer>
    </>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// TumorVisualization — default export. Dark transparent canvas to blend with the
// glassmorphism theme.
// ────────────────────────────────────────────────────────────────────────────

export default function TumorVisualization({ tumorSize, stage, lymphNodes }: Props) {
  return (
    <Canvas
      camera={{ position: [0, 0.5, 6], fov: 45, near: 0.1, far: 100 }}
      gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
      style={{ background: 'transparent' }}
      dpr={[1, 2]}
    >
      <Scene tumorSize={tumorSize} stage={stage} lymphNodes={lymphNodes} />
    </Canvas>
  );
}
