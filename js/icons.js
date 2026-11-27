// Inline SVG icons (constant markup, no user data).
const P = {
  explore: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z"/>',
  reels: '<rect x="4" y="3" width="16" height="18" rx="3"/><path d="m10 9 5 3-5 3z"/>',
  podcast: '<path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="3" y="14" width="4" height="6" rx="1.5"/><rect x="17" y="14" width="4" height="6" rx="1.5"/>',
  library: '<path d="M6 3h12v18l-6-4-6 4z"/>',
  people: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><circle cx="17.5" cy="9" r="2.5"/><path d="M16 14.5a5 5 0 0 1 6 5"/>',
  studio: '<path d="m12 3 2.2 5.3L20 9l-4.4 3.8L17 19l-5-3-5 3 1.4-6.2L4 9l5.8-.7z"/>',
  profile: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  theme: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  filter: '<path d="M3 5h18l-7 8v6l-4 2v-8z"/>',
  heart: '<path d="M12 20s-7-4.4-9-9a5 5 0 0 1 9-3 5 5 0 0 1 9 3c-2 4.6-9 9-9 9z"/>',
  bookmark: '<path d="M6 3h12v18l-6-4-6 4z"/>',
  share: '<circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="m8.2 10.8 7.6-3.6M8.2 13.2l7.6 3.6"/>',
  headphones: '<path d="M4 15v-3a8 8 0 0 1 16 0v3"/><rect x="3" y="14" width="4" height="7" rx="1.5"/><rect x="17" y="14" width="4" height="7" rx="1.5"/>',
  chat: '<path d="M4 5h16v11H9l-5 4z"/>',
  play: '<path d="M7 4v16l13-8z" fill="currentColor" stroke="none"/>',
  pause: '<rect x="6" y="4" width="4" height="16" rx="1" fill="currentColor" stroke="none"/><rect x="14" y="4" width="4" height="16" rx="1" fill="currentColor" stroke="none"/>',
  prev: '<path d="M6 5v14M19 5 9 12l10 7z"/>',
  next: '<path d="M18 5v14M5 5l10 7-10 7z"/>',
  back15: '<path d="M4 12a8 8 0 1 0 2.3-5.7M4 4v4h4"/><text x="12" y="15.5" font-size="7" text-anchor="middle" fill="currentColor" stroke="none" font-family="sans-serif">15</text>',
  fwd15: '<path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v4h-4"/><text x="12" y="15.5" font-size="7" text-anchor="middle" fill="currentColor" stroke="none" font-family="sans-serif">15</text>',
  queue: '<path d="M4 6h12M4 12h12M4 18h8M18 15v6l4-3z"/>',
  transcript: '<path d="M5 4h14v16H5zM8 8h8M8 12h8M8 16h5"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  external: '<path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6"/>',
  pdf: '<path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4"/>',
  check: '<path d="m5 12 4 4 10-10"/>',
  volume: '<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 9a4 4 0 0 1 0 6"/>',
  mute: '<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="m17 9 4 6M21 9l-4 6"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
};
export function icon(name, size = 20) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('width', size); s.setAttribute('height', size);
  s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', '1.8');
  s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round'); s.setAttribute('aria-hidden', 'true');
  s.innerHTML = P[name] || '';
  return s;
}
