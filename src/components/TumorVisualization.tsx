import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Float, MeshDistortMaterial, OrbitControls } from '@react-three/drei';
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing';
import * as THREE from 'three';

interface Props {
  tumorSize: number;
  stage: string;
  lymphNodes: number;
}

interface RenderProfile {
  lowQuality: boolean;
  reducedMotion: boolean;
}

const STAGE_COLORS: Record<string, string> = {
  'Stage 0': '#10b981',
  'Stage I': '#3b82f6',
  'Stage II': '#8b5cf6',
  'Stage III': '#f59e0b',
  'Stage IV': '#f43f5e',
};

const MAX_PARTICLES = 135;

function stageColor(stage: string): THREE.Color {
  return new THREE.Color(STAGE_COLORS[stage] ?? '#8b5cf6');
}

function stageSeverity(stage: string): number {
  const order = ['Stage 0', 'Stage I', 'Stage II', 'Stage III', 'Stage IV'];
  const index = order.indexOf(stage);
  return index < 0 ? 2 : index;
}

function tumorRadius(tumorSize: number): number {
  const normalized = Math.min(Math.max((tumorSize - 1) / 179, 0), 1);
  return 0.3 + normalized * 1.7;
}
function useRenderProfile(): RenderProfile {
  const [reducedMotion, setReducedMotion] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  const lowQuality = useMemo(() => {
    if (typeof navigator === 'undefined') return false;
    const device = navigator as Navigator & { deviceMemory?: number };
    return (device.hardwareConcurrency > 0 && device.hardwareConcurrency <= 4)
      || (device.deviceMemory !== undefined && device.deviceMemory <= 4);
  }, []);

  return { lowQuality: lowQuality || reducedMotion, reducedMotion };
}

function useRenderActivity(containerRef: React.RefObject<HTMLDivElement>): boolean {
  const [intersecting, setIntersecting] = useState(true);
  const [pageVisible, setPageVisible] = useState(() =>
    typeof document === 'undefined' || document.visibilityState !== 'hidden',
  );

  useEffect(() => {
    const element = containerRef.current;
    if (!element || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      ([entry]) => setIntersecting(entry.isIntersecting),
      { rootMargin: '80px', threshold: 0.01 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [containerRef]);

  useEffect(() => {
    const update = () => setPageVisible(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);

  return intersecting && pageVisible;
}

function ContextLifecycle({
  onLost,
  onRestored,
}: {
  onLost: () => void;
  onRestored: () => void;
}) {
  const { gl } = useThree();

  useEffect(() => {
    const canvas = gl.domElement;
    const lost = (event: Event) => {
      event.preventDefault();
      onLost();
    };
    canvas.addEventListener('webglcontextlost', lost);
    canvas.addEventListener('webglcontextrestored', onRestored);
    return () => {
      canvas.removeEventListener('webglcontextlost', lost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
    };
  }, [gl, onLost, onRestored]);

  return null;
}

function TumorMesh({
  tumorSize,
  stage,
  profile,
}: {
  tumorSize: number;
  stage: string;
  profile: RenderProfile;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const wireRef = useRef<THREE.Mesh>(null);
  const phaseRef = useRef(0);
  const baseRadius = useMemo(() => tumorRadius(tumorSize), [tumorSize]);
  const color = useMemo(() => stageColor(stage), [stage]);

  const geometry = useMemo(() => {
    const detail = profile.lowQuality ? 2 : 4;
    const nextGeometry = new THREE.IcosahedronGeometry(baseRadius, detail);
    const seed = baseRadius * 1000;
    const positions = nextGeometry.attributes.position as THREE.BufferAttribute;
    for (let index = 0; index < positions.count; index++) {
      const x = positions.getX(index);
      const y = positions.getY(index);
      const z = positions.getZ(index);
      const noise = Math.sin(x * 3.1 + seed)
        * Math.cos(y * 2.7 + seed)
        * Math.sin(z * 3.3 + seed);
      const scale = 1 + noise * 0.08;
      positions.setXYZ(index, x * scale, y * scale, z * scale);
    }
    positions.needsUpdate = true;
    nextGeometry.computeVertexNormals();
    return nextGeometry;
  }, [baseRadius, profile.lowQuality]);

  const wireGeometry = useMemo(
    () => new THREE.IcosahedronGeometry(baseRadius * 1.04, profile.lowQuality ? 1 : 2),
    [baseRadius, profile.lowQuality],
  );

  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => wireGeometry.dispose(), [wireGeometry]);

  useFrame((_state, frameDelta) => {
    if (profile.reducedMotion) return;
    const delta = Math.min(frameDelta, 0.05);
    phaseRef.current += delta;
    const pulse = 1 + Math.sin(phaseRef.current * Math.PI * 0.5) * 0.05;
    if (meshRef.current) {
      meshRef.current.scale.setScalar(pulse);
      meshRef.current.rotation.y += delta * 0.08;
      meshRef.current.rotation.x = Math.sin(phaseRef.current * 0.15) * 0.1;
    }
    if (wireRef.current) {
      wireRef.current.scale.setScalar(pulse);
      wireRef.current.rotation.y -= delta * 0.05;
      wireRef.current.rotation.z += delta * 0.03;
    }
  });

  return (
    <group>
      <mesh ref={meshRef} geometry={geometry}>
        <MeshDistortMaterial
          color={color}
          emissive={color}
          emissiveIntensity={profile.lowQuality ? 0.2 : 0.35}
          roughness={0.35}
          metalness={0.15}
          distort={profile.reducedMotion ? 0 : profile.lowQuality ? 0.14 : 0.28}
          speed={profile.reducedMotion ? 0 : profile.lowQuality ? 0.7 : 1.4}
        />
      </mesh>
      <mesh ref={wireRef} geometry={wireGeometry}>
        <meshBasicMaterial color={color} wireframe transparent opacity={0.12} depthWrite={false} />
      </mesh>
    </group>
  );
}
function TissueShell({ profile }: { profile: RenderProfile }) {
  const ref = useRef<THREE.Mesh>(null);

  useFrame((_state, frameDelta) => {
    if (!ref.current || profile.reducedMotion) return;
    const delta = Math.min(frameDelta, 0.05);
    ref.current.rotation.y += delta * 0.04;
    ref.current.rotation.x = Math.sin(ref.current.rotation.y * 2.5) * 0.05;
  });

  return (
    <mesh ref={ref}>
      <sphereGeometry args={[2.5, profile.lowQuality ? 24 : 48, profile.lowQuality ? 16 : 32]} />
      <meshPhysicalMaterial
        color="#f8c8d0"
        transparent
        opacity={0.06}
        roughness={0.4}
        metalness={0}
        transmission={profile.lowQuality ? 0.3 : 0.9}
        thickness={0.5}
        ior={1.2}
        side={THREE.BackSide}
        depthWrite={false}
      />
    </mesh>
  );
}

interface Particle {
  orbitRadius: number;
  angle: number;
  angularVelocity: number;
  inclination: number;
  drift: number;
  driftPhase: number;
}

function seededUnit(index: number, channel: number): number {
  let value = Math.imul(index + 1, 0x9e3779b1) ^ Math.imul(channel + 11, 0x85ebca6b);
  value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
  value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
}

function DemoParticles({
  lymphNodes,
  reducedMotion,
}: {
  lymphNodes: number;
  reducedMotion: boolean;
}) {
  const visibleCount = Math.min(Math.max(Math.round(lymphNodes) * 3, 0), MAX_PARTICLES);
  const renderedCountRef = useRef(reducedMotion ? visibleCount : 0);
  const elapsedRef = useRef(0);
  const closeColor = useMemo(() => new THREE.Color('#f43f5e'), []);
  const farColor = useMemo(() => new THREE.Color('#f59e0b'), []);
  const mixedColor = useMemo(() => new THREE.Color(), []);

  const pool = useMemo(() => {
    const particles: Particle[] = [];
    const positions = new Float32Array(MAX_PARTICLES * 3);
    const colors = new Float32Array(MAX_PARTICLES * 3);

    for (let index = 0; index < MAX_PARTICLES; index++) {
      const particle: Particle = {
        orbitRadius: 0.9 + seededUnit(index, 0) * 1.4,
        angle: seededUnit(index, 1) * Math.PI * 2,
        angularVelocity: (0.15 + seededUnit(index, 2) * 0.35)
          * (seededUnit(index, 3) > 0.5 ? 1 : -1),
        inclination: (seededUnit(index, 4) - 0.5) * Math.PI * 0.6,
        drift: 0.05 + seededUnit(index, 5) * 0.12,
        driftPhase: seededUnit(index, 6) * Math.PI * 2,
      };
      particles.push(particle);

      const x = Math.cos(particle.angle) * Math.cos(particle.inclination) * particle.orbitRadius;
      const y = Math.sin(particle.inclination) * particle.orbitRadius;
      const z = Math.sin(particle.angle) * Math.cos(particle.inclination) * particle.orbitRadius;
      positions.set([x, y, z], index * 3);
      const initial = closeColor.clone().lerp(farColor, (particle.orbitRadius - 0.9) / 1.4);
      colors.set([initial.r, initial.g, initial.b], index * 3);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setDrawRange(0, renderedCountRef.current);
    return { particles, geometry };
    // The pool is intentionally created once: count changes only reveal stable identities.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (reducedMotion) {
      renderedCountRef.current = visibleCount;
      pool.geometry.setDrawRange(0, visibleCount);
    }
  }, [pool.geometry, reducedMotion, visibleCount]);

  useEffect(() => () => pool.geometry.dispose(), [pool.geometry]);

  useFrame((_state, frameDelta) => {
    const delta = Math.min(frameDelta, 0.05);
    const previousCount = renderedCountRef.current;
    if (!reducedMotion && previousCount !== visibleCount) {
      const difference = visibleCount - previousCount;
      const nextCount = previousCount
        + Math.sign(difference) * Math.min(Math.abs(difference), delta * 45);
      renderedCountRef.current = Math.abs(visibleCount - nextCount) < 0.01
        ? visibleCount
        : nextCount;
      const drawCount = difference > 0
        ? Math.floor(renderedCountRef.current)
        : Math.ceil(renderedCountRef.current);
      pool.geometry.setDrawRange(0, drawCount);
    }

    if (reducedMotion) return;
    elapsedRef.current += delta;
    const positions = pool.geometry.getAttribute('position') as THREE.BufferAttribute;
    const colors = pool.geometry.getAttribute('color') as THREE.BufferAttribute;

    const activeCount = Math.min(
      pool.particles.length,
      Math.max(visibleCount, Math.ceil(renderedCountRef.current)),
    );
    for (let index = 0; index < activeCount; index++) {
      const particle = pool.particles[index];
      particle.angle += particle.angularVelocity * delta;
      const cycle = (elapsedRef.current * particle.drift + particle.driftPhase) % (Math.PI * 2);
      const radius = particle.orbitRadius + (1 - Math.cos(cycle)) * 0.45;
      const x = Math.cos(particle.angle) * Math.cos(particle.inclination) * radius;
      const y = Math.sin(particle.inclination) * radius;
      const z = Math.sin(particle.angle) * Math.cos(particle.inclination) * radius;
      positions.setXYZ(index, x, y, z);

      const distanceRatio = Math.min(Math.max((radius - 0.9) / 1.6, 0), 1);
      mixedColor.copy(closeColor).lerp(farColor, distanceRatio);
      colors.setXYZ(index, mixedColor.r, mixedColor.g, mixedColor.b);
    }
    positions.needsUpdate = true;
    colors.needsUpdate = true;
  });

  return (
    <points geometry={pool.geometry} frustumCulled={false}>
      <pointsMaterial
        vertexColors
        transparent
        size={0.08}
        sizeAttenuation
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}
function SceneLighting({ stage, lowQuality }: { stage: string; lowQuality: boolean }) {
  const color = useMemo(() => stageColor(stage), [stage]);
  return (
    <>
      <ambientLight intensity={lowQuality ? 0.4 : 0.25} />
      <pointLight position={[0, 0, 0]} color={color} intensity={lowQuality ? 1.5 : 2.2} distance={6} decay={2} />
      <directionalLight position={[3, 6, 4]} intensity={0.7} color="#ffffff" />
      {!lowQuality && <directionalLight position={[-4, 2, -3]} intensity={0.25} color="#a5b4fc" />}
    </>
  );
}

function Scene({
  tumorSize,
  stage,
  lymphNodes,
  profile,
  onContextLost,
  onContextRestored,
}: Props & {
  profile: RenderProfile;
  onContextLost: () => void;
  onContextRestored: () => void;
}) {
  const bloomIntensity = useMemo(() => 0.4 + stageSeverity(stage) * 0.28, [stage]);
  const tumor = (
    <>
      <TumorMesh tumorSize={tumorSize} stage={stage} profile={profile} />
      <TissueShell profile={profile} />
      <DemoParticles lymphNodes={lymphNodes} reducedMotion={profile.reducedMotion} />
    </>
  );

  return (
    <>
      <ContextLifecycle onLost={onContextLost} onRestored={onContextRestored} />
      <SceneLighting stage={stage} lowQuality={profile.lowQuality} />

      {profile.reducedMotion ? (
        <group>{tumor}</group>
      ) : (
        <Float
          speed={profile.lowQuality ? 0.65 : 1.1}
          rotationIntensity={profile.lowQuality ? 0.1 : 0.25}
          floatIntensity={profile.lowQuality ? 0.15 : 0.35}
          floatingRange={[-0.08, 0.08]}
        >
          {tumor}
        </Float>
      )}

      <OrbitControls
        autoRotate={!profile.reducedMotion}
        autoRotateSpeed={0.5}
        enableZoom={false}
        enablePan={false}
        minPolarAngle={Math.PI * 0.15}
        maxPolarAngle={Math.PI * 0.75}
        dampingFactor={0.08}
      />

      {!profile.lowQuality && (
        <EffectComposer>
          <Bloom
            intensity={bloomIntensity}
            luminanceThreshold={0.15}
            luminanceSmoothing={0.5}
            mipmapBlur
          />
          <Vignette eskil={false} offset={0.25} darkness={0.65} />
        </EffectComposer>
      )}
    </>
  );
}

function VisualizationFallback({ contextLost = false }: { contextLost?: boolean }) {
  return (
    <div
      role="status"
      style={{
        alignItems: 'center',
        background: 'radial-gradient(circle, rgba(139,92,246,0.18), transparent 65%)',
        color: '#a5b4fc',
        display: 'flex',
        fontSize: '0.875rem',
        inset: 0,
        justifyContent: 'center',
        padding: '1rem',
        position: 'absolute',
        textAlign: 'center',
      }}
    >
      {contextLost
        ? '3D context was interrupted. Waiting for the browser to restore it…'
        : '3D visualization is unavailable on this device.'}
    </div>
  );
}

export default function TumorVisualization({ tumorSize, stage, lymphNodes }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const profile = useRenderProfile();
  const isVisible = useRenderActivity(containerRef);
  const [contextLost, setContextLost] = useState(false);
  const handleContextLost = useCallback(() => setContextLost(true), []);
  const handleContextRestored = useCallback(() => setContextLost(false), []);
  const webGLAvailable = typeof window !== 'undefined'
    && ('WebGLRenderingContext' in window || 'WebGL2RenderingContext' in window);
  const frameloop = !isVisible || contextLost
    ? 'never'
    : profile.reducedMotion
      ? 'demand'
      : 'always';

  return (
    <div ref={containerRef} style={{ height: '100%', position: 'relative', width: '100%' }}>
      {webGLAvailable ? (
        <Canvas
          camera={{ position: [0, 0.5, 6], fov: 45, near: 0.1, far: 100 }}
          dpr={profile.lowQuality ? [1, 1.25] : [1, 1.5]}
          fallback={<VisualizationFallback />}
          frameloop={frameloop}
          gl={{
            alpha: true,
            antialias: !profile.lowQuality,
            failIfMajorPerformanceCaveat: true,
            powerPreference: profile.lowQuality ? 'low-power' : 'high-performance',
          }}
          style={{ background: 'transparent' }}
        >
          <Scene
            tumorSize={tumorSize}
            stage={stage}
            lymphNodes={lymphNodes}
            profile={profile}
            onContextLost={handleContextLost}
            onContextRestored={handleContextRestored}
          />
        </Canvas>
      ) : (
        <VisualizationFallback />
      )}
      {contextLost && <VisualizationFallback contextLost />}
      <div className="pointer-events-none absolute bottom-3 left-3 right-3 rounded-lg border border-white/10 bg-slate-950/65 px-3 py-2 text-center font-mono-data text-[9px] uppercase tracking-wider text-slate-200">
        Stylized synthetic visualization · not scan-derived imaging or anatomical evidence
      </div>
    </div>
  );
}
