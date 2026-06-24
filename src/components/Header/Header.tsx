// src/components/Header/Header.tsx
import { HamburgerIcon } from './HamburgerIcon';
import type { Theme } from '../../types';

interface HeaderProps {
  sidebarOpen:    boolean;
  onToggleSidebar: () => void;
  theme:          Theme;
  onToggleTheme:  () => void;
}

export function Header({ sidebarOpen, onToggleSidebar, theme, onToggleTheme }: HeaderProps) {
  return (
    <header style={{
      height: 48, display: 'flex', alignItems: 'center', gap: 12,
      padding: '0 16px',
      backgroundColor: 'var(--sidebar-bg)',
      borderBottom: '1px solid var(--border)',
      flexShrink: 0, zIndex: 10,
    }}>
      <button
        onClick={onToggleSidebar}
        title={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
        style={{
          width: 32, height: 32,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'none', border: '1px solid var(--border)',
          borderRadius: 6, cursor: 'pointer',
          color: 'var(--text-secondary)', flexShrink: 0,
        }}
      >
        <HamburgerIcon open={sidebarOpen} />
      </button>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 18 }}>🔍</span>
        <span style={{ fontWeight: 700, fontSize: 14, letterSpacing: '-0.02em' }}>PR Analyzer</span>
        <span style={{
          fontSize: 9, fontWeight: 700, padding: '2px 5px',
          borderRadius: 4, backgroundColor: 'var(--accent)', color: '#fff',
        }}>
          v4
        </span>
      </div>

      <div style={{ flex: 1 }} />

      <button onClick={onToggleTheme} style={{
        background: 'none', border: '1px solid var(--border)',
        borderRadius: 6, padding: '4px 10px', cursor: 'pointer',
        color: 'var(--text-secondary)', fontSize: 12,
      }}>
        {theme === 'dark' ? '☀️ Light' : '🌙 Dark'}
      </button>
    </header>
  );
}