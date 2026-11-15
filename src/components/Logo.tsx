// Smart2Plant brand: satellite with leaf-shaped solar panels pointing at a sprout.
type Tone = 'light' | 'dark'
const C = {
  light: { body: '#1F4D36', l1: '#2E7D4F', l2: '#8DB360', beam: '#3BA7D9', two: '#1F86C1', text: '#1F4D36', sub: '#5C6B63' },
  dark: { body: '#FFFFFF', l1: '#8DB360', l2: '#CDE8C0', beam: '#6CC4EE', two: '#6CC4EE', text: '#FFFFFF', sub: '#CFE3D6' },
}

export function LogoMark({ size = 32, tone = 'light', title }: { size?: number; tone?: Tone; title?: string }) {
  const c = C[tone]
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      <g transform="rotate(-18 50 30)">
        <path d="M43 30 C34 20 20 18 8 22 C14 34 30 38 43 30 Z" fill={c.l1} />
        <path d="M57 30 C66 20 80 18 92 22 C86 34 70 38 57 30 Z" fill={c.l2} />
        <rect x="43" y="23" width="14" height="14" rx="3" fill={c.body} />
        <path d="M50 37 V43" stroke={c.body} strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="50" cy="45" r="2.6" fill={c.beam} />
      </g>
      <path d="M50 52 L40 80 M54 51 L62 80" stroke={c.beam} strokeWidth="2" strokeDasharray="3 3.5" strokeLinecap="round" />
      <path d="M51 90 V78" stroke={c.body} strokeWidth="3" strokeLinecap="round" />
      <path d="M51 82 C46 82 42 79 41 74 C46 74 50 77 51 82 Z" fill={c.l1} />
      <path d="M51 80 C56 80 60 77 61 72 C56 72 52 75 51 80 Z" fill={c.l2} />
      <path d="M30 92 H72" stroke={c.body} strokeWidth="4" strokeLinecap="round" />
    </svg>
  )
}

export function Wordmark({ tone = 'light', className = '' }: { tone?: Tone; className?: string }) {
  const c = C[tone]
  return <span className={`font-title font-extrabold tracking-tight ${className}`} style={{ color: c.text }}>Smart<span style={{ color: c.two }}>2</span>Plant</span>
}

export function Logo({ tone = 'light', size = 32, slogan, x }: { tone?: Tone; size?: number; slogan?: boolean; x?: (es: string, en: string) => string }) {
  const c = C[tone]
  return (
    <span className="flex items-center gap-2">
      <LogoMark size={size} tone={tone} />
      <span className="flex flex-col items-start text-left leading-none">
        <Wordmark tone={tone} className="text-xl" />
        {slogan && x && <span className="mt-0.5 text-[11px] font-semibold" style={{ color: c.sub }}>{x('Tu campo, conectado al espacio', 'Your field, connected to space')}</span>}
      </span>
    </span>
  )
}
