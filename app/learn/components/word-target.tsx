'use client';

import { useEffect } from 'react';

/**
 * Marks the word a `<Term>` popover sent the reader to (`/learn#word-<id>`).
 *
 * CSS `:target` alone is not enough: "More words in Learn" is a client-side
 * navigation, and `history.pushState` does not update `:target`, so the row
 * arrived unmarked. This sets `data-target` on the row named by the hash, on
 * arrival and on every hash change, and the row's `data-[target]:` fill does
 * the rest. Renders nothing.
 */
export function WordTarget() {
  useEffect(() => {
    let current: HTMLElement | null = null;
    const mark = () => {
      current?.removeAttribute('data-target');
      const id = decodeURIComponent(window.location.hash.slice(1));
      current = id.startsWith('word-') ? document.getElementById(id) : null;
      current?.setAttribute('data-target', '');
    };
    mark();
    window.addEventListener('hashchange', mark);
    return () => {
      window.removeEventListener('hashchange', mark);
      current?.removeAttribute('data-target');
    };
  }, []);
  return null;
}
