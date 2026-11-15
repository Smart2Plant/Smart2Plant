import { useFrame, useThree } from '@react-three/fiber'
import { useRef, type MutableRefObject, type ReactNode } from 'react'
import * as THREE from 'three'

// DOM labels positioned over a three.js canvas (replaces drei <Html>, which
// misbehaves on unmount with React 19).
export type LabelItem = { key: string; pos: THREE.Vector3; node: ReactNode; hideBehindGlobe?: boolean; offset?: [number, number] }

export function useLabelRefs() {
  return useRef<(HTMLDivElement | null)[]>([])
}

export function Projector({ items, refs }: { items: LabelItem[]; refs: MutableRefObject<(HTMLDivElement | null)[]> }) {
  const { camera, size } = useThree()
  const v = new THREE.Vector3()
  useFrame(() => {
    items.forEach((it, i) => {
      const el = refs.current[i]
      if (!el) return
      v.copy(it.pos).project(camera)
      const x = ((v.x + 1) / 2) * size.width
      const y = ((1 - v.y) / 2) * size.height
      let hidden = v.z > 1
      if (it.hideBehindGlobe) hidden = hidden || it.pos.dot(camera.position) < 0.15
      const [dx, dy] = it.offset ?? [0, 0]
      el.style.transform = `translate(${x + dx}px, ${y + dy}px) translate(-50%, -50%)`
      el.style.opacity = hidden ? '0' : '1'
      el.style.pointerEvents = hidden ? 'none' : 'auto'
    })
  })
  return null
}

export function LabelLayer({ items, refs }: { items: LabelItem[]; refs: MutableRefObject<(HTMLDivElement | null)[]> }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {items.map((it, i) => (
        <div key={it.key} ref={(el) => { refs.current[i] = el }} className="absolute left-0 top-0 transition-opacity duration-200" style={{ opacity: 0 }}>
          {it.node}
        </div>
      ))}
    </div>
  )
}
