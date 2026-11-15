import { Canvas, useFrame } from '@react-three/fiber'
import { ContactShadows, OrbitControls } from '@react-three/drei'
import { LabelLayer, Projector, useLabelRefs, type LabelItem } from './Labels'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { Field, Rotation } from '../types'
import { CROP_COLORS, cropAt, ndviColor, polygonBounds } from '../data'

export type Pin = { fx: number; fy: number; label: string; level: 'info' | 'warning' | 'critical' }

type Mode = 'ndvi' | 'zones' | 'plots' | 'parcels'
export type ParcelPaint = { poly: [number, number][]; color: string }

interface Props {
  field: Field
  mode: Mode
  monthIdx?: number
  rotation?: Rotation
  planMonth?: string
  pins?: Pin[]
  sweep?: boolean
  autoRotate?: boolean
  height?: number | string
  ariaLabel?: string
  parcels?: ParcelPaint[]
  clientPoly?: [number, number][]
  grow?: boolean
}

function insidePoly(pt: [number, number], poly: [number, number][]) {
  let c = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j]
    if (a[0] > pt[0] !== b[0] > pt[0] && pt[1] < ((b[1] - a[1]) * (pt[0] - a[0])) / (b[0] - a[0]) + a[1]) c = !c
  }
  return c
}

const ZONE_COLORS = ['#E07A3F', '#3FA66B', '#2E96F5']
const hex = (h: string) => new THREE.Color(h)

function dims(field: Field) {
  const b = polygonBounds(field.polygon)
  const lat = (b.north + b.south) / 2
  const wM = (b.east - b.west) * 111320 * Math.cos((lat * Math.PI) / 180)
  const hM = (b.north - b.south) * 111320
  const W = 10
  return { W, H: (W * hM) / wM, b }
}

function cellColors(field: Field, mode: Mode, monthIdx: number, rotation?: Rotation, planMonth?: string, parcels?: ParcelPaint[], clientPoly?: [number, number][]) {
  const { rows, cols } = field.elevationGrid
  const out = new Float32Array(rows * cols * 3)
  const fb = polygonBounds(field.polygon)
  const plotBoxes = rotation?.plots.map((p) => {
    const b = polygonBounds(p.polygon)
    return {
      x0: (b.west - fb.west) / (fb.east - fb.west), x1: (b.east - fb.west) / (fb.east - fb.west),
      y0: (b.south - fb.south) / (fb.north - fb.south), y1: (b.north - fb.south) / (fb.north - fb.south),
      seq: p.sequence,
    }
  })
  const m = field.monthly[Math.min(monthIdx, field.monthly.length - 1)]
  for (let iy = 0; iy < rows; iy++) {
    for (let ix = 0; ix < cols; ix++) {
      const gr = rows - 1 - iy // plane rows go north -> south
      const fx = ix / (cols - 1), fy = gr / (rows - 1)
      let c: THREE.Color
      if (mode === 'ndvi') {
        const [r, g, b] = ndviColor(m.ndvi[gr * cols + ix])
        c = new THREE.Color(r / 255, g / 255, b / 255)
      } else if (mode === 'zones') {
        const z = fy >= 0.72 ? 0 : fy >= 0.3 ? 1 : 2
        const [r, g, b] = ndviColor(m.ndvi[gr * cols + ix])
        c = hex(ZONE_COLORS[z]).lerp(new THREE.Color(r / 255, g / 255, b / 255), 0.35)
      } else if (mode === 'parcels') {
        let col = '#8B6B45' // unassigned land
        if (clientPoly && parcels) {
          const lats = clientPoly.map((p) => p[0]), lngs = clientPoly.map((p) => p[1])
          const s0 = Math.min(...lats), n0 = Math.max(...lats), w0 = Math.min(...lngs), e0 = Math.max(...lngs)
          const pt: [number, number] = [s0 + fy * (n0 - s0), w0 + fx * (e0 - w0)]
          if (!insidePoly(pt, clientPoly)) col = '#5b4a36'
          for (const pp of parcels) if (insidePoly(pt, pp.poly)) { col = pp.color; break }
        }
        c = hex(col)
      } else {
        const box = plotBoxes?.find((p) => fx >= p.x0 - 1e-6 && fx <= p.x1 + 1e-6 && fy >= p.y0 - 1e-6 && fy <= p.y1 + 1e-6)
        const crop = box && planMonth ? cropAt(box.seq, planMonth) : 'fallow'
        c = hex(CROP_COLORS[crop] ?? '#888888')
      }
      const o = (iy * cols + ix) * 3
      out[o] = c.r; out[o + 1] = c.g; out[o + 2] = c.b
    }
  }
  return out
}

function Terrain({ field, colors, grow = false }: { field: Field; colors: Float32Array; grow?: boolean }) {
  const { W, H } = dims(field)
  const geo = useMemo(() => {
    const { rows, cols, values } = field.elevationGrid
    const g = new THREE.PlaneGeometry(W, H, cols - 1, rows - 1)
    const min = Math.min(...values), max = Math.max(...values)
    const scale = 1.8 / Math.max(1, max - min)
    const pos = g.attributes.position as THREE.BufferAttribute
    for (let iy = 0; iy < rows; iy++)
      for (let ix = 0; ix < cols; ix++) {
        const gr = rows - 1 - iy
        pos.setZ(iy * cols + ix, (values[gr * cols + ix] - min) * scale)
      }
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(rows * cols * 3), 3))
    g.computeVertexNormals()
    return g
  }, [field, W, H])

  useEffect(() => {
    const attr = geo.attributes.color as THREE.BufferAttribute
    ;(attr.array as Float32Array).set(colors)
    attr.needsUpdate = true
  }, [geo, colors])

  // "growing" wave: crops ripple from soil colour to their own colour across the field
  useFrame(({ clock }) => {
    if (!grow) return
    const attr = geo.attributes.color as THREE.BufferAttribute
    const arr = attr.array as Float32Array
    const { rows, cols } = field.elevationGrid
    const t = clock.getElapsedTime()
    for (let iy = 0; iy < rows; iy++)
      for (let ix = 0; ix < cols; ix++) {
        const k = (iy * cols + ix) * 3
        const w = 0.78 + 0.22 * Math.sin(t * 1.6 - ix * 0.35 - iy * 0.12)
        arr[k] = colors[k] * w + 0.36 * (1 - w)
        arr[k + 1] = colors[k + 1] * w + 0.27 * (1 - w)
        arr[k + 2] = colors[k + 2] * w + 0.17 * (1 - w)
      }
    attr.needsUpdate = true
  })

  return (
    <group rotation={[-Math.PI / 2, 0, 0]}>
      <mesh geometry={geo} receiveShadow castShadow>
        <meshStandardMaterial vertexColors roughness={0.85} metalness={0.02} side={THREE.DoubleSide} />
      </mesh>
      {/* soil slab under the field */}
      <mesh position={[0, 0, -0.35]}>
        <boxGeometry args={[W, H, 0.7]} />
        <meshStandardMaterial color="#6B4A2B" roughness={1} />
      </mesh>
    </group>
  )
}


function Sweep({ W, H }: { W: number; H: number }) {
  const ref = useRef<THREE.Mesh>(null)
  useFrame(({ clock }) => {
    if (!ref.current) return
    const t = (clock.getElapsedTime() % 5) / 5
    ref.current.position.x = -W / 2 - 1 + t * (W + 2)
    ;(ref.current.material as THREE.MeshBasicMaterial).opacity = 0.28 * Math.sin(t * Math.PI)
  })
  return (
    <mesh ref={ref} position={[0, 1.8, 0]}>
      <boxGeometry args={[0.18, 3.6, H + 0.6]} />
      <meshBasicMaterial color="#2E96F5" transparent opacity={0.25} depthWrite={false} />
    </mesh>
  )
}

function Pins({ field, pins }: { field: Field; pins: Pin[] }) {
  const { W, H } = dims(field)
  const color = { info: '#2E96F5', warning: '#EAFE07', critical: '#E43700' }
  return (
    <>
      {pins.map((p, i) => {
        const x = -W / 2 + p.fx * W
        const z = H / 2 - p.fy * H
        return (
          <group key={i} position={[x, 2.4, z]}>
            <mesh>
              <sphereGeometry args={[0.16, 20, 20]} />
              <meshBasicMaterial color={color[p.level]} />
            </mesh>
            <mesh position={[0, -1, 0]}>
              <cylinderGeometry args={[0.02, 0.02, 2, 6]} />
              <meshBasicMaterial color={color[p.level]} />
            </mesh>
          </group>
        )
      })}
    </>
  )
}


// ---- Hero diorama: grass plate, flowing river, swaying trees and an orbiting satellite ----
function rng(seed: number) { return () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646 } }

function riverTexture() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 32
  const g = c.getContext('2d')!
  g.fillStyle = '#2F8FC4'; g.fillRect(0, 0, 128, 32)
  g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 2
  for (let i = 0; i < 6; i++) { g.beginPath(); const x = i * 22; g.moveTo(x, 6 + (i % 3) * 8); g.lineTo(x + 12, 6 + (i % 3) * 8); g.stroke() }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(10, 1)
  return t
}

function Tree({ x, z, s, phase, delay }: { x: number; z: number; s: number; phase: number; delay: number }) {
  const ref = useRef<THREE.Group>(null)
  useFrame(({ clock }) => {
    if (!ref.current) return
    const t = clock.getElapsedTime()
    const g = Math.min(1, Math.max(0, (t - delay) / 0.9))
    const e = 1 - Math.pow(1 - g, 3)
    ref.current.scale.setScalar(Math.max(0.001, e * s))
    ref.current.rotation.z = Math.sin(t * 1.3 + phase) * 0.06
    ref.current.rotation.x = Math.cos(t * 1.1 + phase) * 0.04
  })
  return (
    <group ref={ref} position={[x, -0.5, z]}>
      <mesh position={[0, 0.35, 0]} castShadow><cylinderGeometry args={[0.07, 0.1, 0.7, 6]} /><meshStandardMaterial color="#6B4A2B" /></mesh>
      <mesh position={[0, 0.95, 0]} castShadow><icosahedronGeometry args={[0.45, 0]} /><meshStandardMaterial color={phase > 3 ? '#2E7D4F' : '#3E8E57'} flatShading /></mesh>
      <mesh position={[0, 1.35, 0]} castShadow><icosahedronGeometry args={[0.3, 0]} /><meshStandardMaterial color="#5FA36A" flatShading /></mesh>
    </group>
  )
}

function Satellite({ R }: { R: number }) {
  const ref = useRef<THREE.Group>(null)
  useFrame(({ clock }) => {
    if (!ref.current) return
    const t = clock.getElapsedTime() * 0.35
    ref.current.position.set(Math.cos(t) * R, 4.2 + Math.sin(t * 2) * 0.25, Math.sin(t) * R * 0.6)
    ref.current.rotation.y = -t
  })
  return (
    <group ref={ref}>
      <mesh><boxGeometry args={[0.35, 0.35, 0.35]} /><meshStandardMaterial color="#1F4D36" /></mesh>
      <mesh position={[-0.55, 0, 0]} rotation={[0, 0, 0.3]}><boxGeometry args={[0.7, 0.04, 0.3]} /><meshStandardMaterial color="#8DB360" /></mesh>
      <mesh position={[0.55, 0, 0]} rotation={[0, 0, -0.3]}><boxGeometry args={[0.7, 0.04, 0.3]} /><meshStandardMaterial color="#CDE8C0" /></mesh>
      <mesh position={[0, -0.28, 0]}><sphereGeometry args={[0.06, 8, 8]} /><meshBasicMaterial color="#3BA7D9" /></mesh>
    </group>
  )
}

function Diorama({ W, H }: { W: number; H: number }) {
  const PW = W + 5, PH = H + 5
  const tex = useMemo(riverTexture, [])
  const river = useMemo(() => {
    const zR = H / 2 + 1.35
    const pts = [-PW / 2, -PW / 4, 0, PW / 4, PW / 2].map((x, i) => new THREE.Vector3(x, 0, zR + [0.3, -0.35, 0.25, -0.3, 0.2][i]))
    const curve = new THREE.CatmullRomCurve3(pts)
    const geo = new THREE.TubeGeometry(curve, 80, 0.55, 8, false)
    return geo
  }, [PW, H])
  useFrame((_, dt) => { tex.offset.x -= dt * 0.25 })
  const trees = useMemo(() => {
    const r = rng(7); const out: { x: number; z: number; s: number; phase: number; delay: number }[] = []
    let tries = 0
    while (out.length < 16 && tries++ < 400) {
      const x = (r() - 0.5) * (PW - 0.8), z = (r() - 0.5) * (PH - 0.8)
      const inField = Math.abs(x) < W / 2 + 0.5 && Math.abs(z) < H / 2 + 0.5
      const inRiver = Math.abs(z - (H / 2 + 1.35)) < 0.95
      if (inField || inRiver) continue
      out.push({ x, z, s: 0.8 + r() * 0.5, phase: r() * 6.28, delay: 0.4 + out.length * 0.08 })
    }
    return out
  }, [PW, PH, W, H])
  return (
    <group>
      <mesh position={[0, -0.78, 0]} receiveShadow>
        <boxGeometry args={[PW, 0.56, PH]} />
        <meshStandardMaterial color="#79AE62" roughness={1} />
      </mesh>
      <mesh position={[0, -1.12, 0]}>
        <boxGeometry args={[PW, 0.12, PH]} />
        <meshStandardMaterial color="#6B4A2B" roughness={1} />
      </mesh>
      <mesh geometry={river} position={[0, -0.5, 0]} scale={[1, 0.06, 1]}>
        <meshStandardMaterial map={tex} roughness={0.3} metalness={0.1} />
      </mesh>
      {trees.map((t, i) => <Tree key={i} {...t} />)}
      <Satellite R={Math.max(W, H) * 0.55} />
    </group>
  )
}

export default function Field3D({ field, mode, monthIdx = 0, rotation, planMonth, pins = [], sweep = false, autoRotate = true, height = 420, ariaLabel, parcels, clientPoly, grow = false, transparent = false }: Props & { transparent?: boolean }) {
  const colors = useMemo(() => cellColors(field, mode, monthIdx, rotation, planMonth, parcels, clientPoly), [field, mode, monthIdx, rotation, planMonth, parcels, clientPoly])
  const { W, H } = dims(field)
  const refs = useLabelRefs()
  const labels: LabelItem[] = pins.map((p, i) => ({
    key: `${i}-${p.label}`,
    pos: new THREE.Vector3(-W / 2 + p.fx * W, 3.05, H / 2 - p.fy * H),
    node: <div className="whitespace-nowrap rounded-full bg-[#07173F]/90 px-2 py-0.5 text-[11px] font-semibold text-white ring-1 ring-white/30">{p.label}</div>,
  }))
  return (
    <div style={{ height, filter: undefined }} className={`relative w-full overflow-hidden rounded-[12px] ${transparent ? "" : "bg-gradient-to-b from-[#E3ECEA] to-[#F1F4EE]"}`} role="img" aria-label={ariaLabel ?? `3D view of ${field.name}`}>
      <Canvas camera={{ position: transparent ? [0, 13.5, 21.5] : [0, 8.5, 10.5], fov: 40 }} dpr={[1, 2]} shadows>
        <ambientLight intensity={0.65} />
        <directionalLight position={[6, 10, 4]} intensity={1.4} castShadow />
        <directionalLight position={[-6, 4, -6]} intensity={0.35} color="#8EC8FF" />
        <Terrain field={field} colors={colors} grow={grow} />
        {transparent && <Diorama W={W} H={H} />}
        {transparent && <ContactShadows position={[0, -1.19, 0]} scale={Math.max(W, H) + 7} blur={2.2} far={5} opacity={0.95} color="#020A06" />}
        {sweep && <Sweep W={W} H={H} />}
        <Pins field={field} pins={pins} />
        <OrbitControls autoRotate={autoRotate} autoRotateSpeed={0.55} enablePan={false} enableZoom={!transparent} minDistance={7} maxDistance={transparent ? 40 : 20} minPolarAngle={transparent ? 0.55 : 0} maxPolarAngle={transparent ? 1.05 : Math.PI / 2.2} />
        <Projector items={labels} refs={refs} />
      </Canvas>
      <LabelLayer items={labels} refs={refs} />
    </div>
  )
}
