import { useEffect } from 'react';

/**
 * Registers a global hotkey listener.
 * Hotkey syntax (lightweight): `mod+k`, `ctrl+/`, `shift+enter` (any +-joined).
 * - `mod` resolves to Cmd on Mac and Ctrl elsewhere.
 * - Keys are matched case-insensitively against `event.key`.
 */
export function useHotkey(combo: false | string | undefined, handler: () => void): void {
  useEffect(() => {
    if (!combo) return;

    const isMac = typeof navigator !== 'undefined' && /mac|iphone|ipad/i.test(navigator.platform);
    const parts = combo.toLowerCase().split('+').map((p) => p.trim());
    const wantKey = parts[parts.length - 1];
    const wantMod = parts.includes('mod') ? (isMac ? 'meta' : 'ctrl') : null;
    const wantCtrl = parts.includes('ctrl');
    const wantMeta = parts.includes('meta') || parts.includes('cmd');
    const wantShift = parts.includes('shift');
    const wantAlt = parts.includes('alt') || parts.includes('option');

    function onKey(e: KeyboardEvent) {
      if (e.key.toLowerCase() !== wantKey) return;
      const needCtrl = wantCtrl || wantMod === 'ctrl';
      const needMeta = wantMeta || wantMod === 'meta';
      if (needCtrl !== e.ctrlKey) return;
      if (needMeta !== e.metaKey) return;
      if (wantShift !== e.shiftKey) return;
      if (wantAlt !== e.altKey) return;
      e.preventDefault();
      handler();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [combo, handler]);
}
