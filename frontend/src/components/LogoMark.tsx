/** Shield emblem with a road running through it. */
export default function LogoMark({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size * 1.12} viewBox="0 0 36 40" aria-hidden="true" style={{ flexShrink: 0, display: 'block' }}>
      <path d="M18 1.5 33.5 7v13.2c0 9.4-6.6 16.4-15.5 19.3C9.1 36.6 2.5 29.6 2.5 20.2V7L18 1.5Z" fill="#1f5fd1" />
      <path d="M18 5 30 9.2v11c0 7.6-5.2 13.4-12 16-6.8-2.6-12-8.4-12-16v-11L18 5Z" fill="#0d1b36" />
      <path d="M13.4 34.2c.4-6.2 7.6-8 6.6-13.4-.6-3.1-3.6-4.8-3.6-8.6h3.4c0 3 2.4 4.6 3 8 1 5.8-5.4 8.4-5.6 14Z" fill="#ffffff" />
      <path d="M18.3 33.5v-3.2m.3-4v-3m.4-4v-2.6" stroke="#0d1b36" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  )
}
