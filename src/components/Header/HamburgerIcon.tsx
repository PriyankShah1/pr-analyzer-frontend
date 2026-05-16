// src/components/Header/HamburgerIcon.tsx
export function HamburgerIcon({ open }: { open: boolean }) {
  return (
    <div style={{
      width: 18, height: 14,
      display: 'flex', flexDirection: 'column',
      justifyContent: 'space-between', position: 'relative',
    }}>
      <span style={{
        display: 'block', height: 2, borderRadius: 2,
        backgroundColor: 'currentColor',
        transform: open ? 'translateY(6px) rotate(45deg)' : 'none',
        transition: 'transform 0.2s',
      }} />
      <span style={{
        display: 'block', height: 2, borderRadius: 2,
        backgroundColor: 'currentColor',
        opacity: open ? 0 : 1,
        transition: 'opacity 0.2s',
      }} />
      <span style={{
        display: 'block', height: 2, borderRadius: 2,
        backgroundColor: 'currentColor',
        transform: open ? 'translateY(-6px) rotate(-45deg)' : 'none',
        transition: 'transform 0.2s',
      }} />
    </div>
  );
}