// Shared shell for the plain-HTML tools (Motion graphics, Audio cleaner): the same navigation rail
// and theme as the Shorts studio. Theme tokens mirror motion/studio/src/theme.ts; keep them in sync.
(() => {
  const THEMES = {
    graphite: { dark: true, name: 'Graphite + Yellow', bg: '#0F1012', panel: '#17181C', raised: '#222429', sunken: '#0B0C0E', border: '#2E3036', text: '#ECECEE', muted: '#8B8D94', accent: '#FFD60A', 'on-accent': '#141414', danger: '#F0625A', ok: '#3FCF8E' },
    black: { dark: true, name: 'Pure black', bg: '#000000', panel: '#0D0D0D', raised: '#181818', sunken: '#000000', border: '#1F1F1F', text: '#FFFFFF', muted: '#7A7A7A', accent: '#FFD60A', 'on-accent': '#000000', danger: '#FF5A52', ok: '#3FCF8E' },
    navy: { dark: true, name: 'Warm navy', bg: '#0A0D1A', panel: '#111528', raised: '#1A1F38', sunken: '#070914', border: '#232A45', text: '#EEF0F8', muted: '#8790B0', accent: '#FFD60A', 'on-accent': '#141414', danger: '#F0625A', ok: '#3FCF8E' },
    daylight: { dark: false, name: 'Daylight', bg: '#F4F4F6', panel: '#FFFFFF', raised: '#F0F0F3', sunken: '#E9E9EE', border: '#DEDFE4', text: '#16181F', muted: '#6F7380', accent: '#E0B400', 'on-accent': '#141414', danger: '#D64545', ok: '#1F9D55' },
  };
  const KEY = 'studio-theme';
  const saved = () => { try { return localStorage.getItem(KEY) || 'daylight'; } catch { return 'daylight'; } };
  function apply(id) {
    const t = THEMES[id] || THEMES.daylight, root = document.documentElement;
    for (const [k, v] of Object.entries(t)) if (k !== 'dark' && k !== 'name') root.style.setProperty('--' + k, v);
    root.style.colorScheme = t.dark ? 'dark' : 'light';
    root.dataset.theme = THEMES[id] ? id : 'daylight';
    try { localStorage.setItem(KEY, root.dataset.theme); } catch { /* private window: applies for this visit */ }
    document.querySelectorAll('.themes button').forEach(b => b.setAttribute('aria-checked', String(b.dataset.id === root.dataset.theme)));
  }
  apply(saved());

  const LINKS = [
    ['shorts', '/shorts', '▦', 'Videos'],
    ['clients', '/shorts?view=clients', '◉', 'Clients'],
  ];
  const TOOLS = [
    ['graphics', '/graphics', '✦', 'Motion graphics'],
    ['cleaner', '/cleaner', '♪', 'Audio cleaner'],
  ];
  function rail() {
    const el = document.getElementById('rail');
    if (!el) return;
    const here = el.dataset.active;
    const link = ([id, href, ico, label]) => `<a href="${href}" class="${id === here ? 'on' : ''}"${id === here ? ' aria-current="page"' : ''}><span class="ico">${ico}</span><span>${label}</span></a>`;
    el.innerHTML = `<a class="brand" href="/shorts"><i></i><span>Humed’s AI Studio</span></a>
      <a class="btn newbtn" href="/shorts?new">＋ New video</a>
      <nav class="railnav" aria-label="Shorts"><span class="raillabel">Shorts</span>${LINKS.map(link).join('')}</nav>
      <nav class="railnav tools" aria-label="Tools"><span class="raillabel">Tools</span>${TOOLS.map(link).join('')}</nav>
      <div class="railfoot"><span class="raillabel">Theme</span><div class="themes" role="radiogroup" aria-label="Theme">${Object.entries(THEMES).map(([id, t]) =>
        `<button type="button" role="radio" data-id="${id}" title="${t.name}" style="background:linear-gradient(135deg,${t.panel} 55%,${t.accent} 55%)"></button>`).join('')}</div></div>`;
    el.querySelectorAll('.themes button').forEach(b => b.onclick = () => apply(b.dataset.id));
    apply(document.documentElement.dataset.theme);
  }
  // Section tabs: <div class="segtabs" data-tabs="name"><button data-tab="x"> … and panels <section data-panel="x">.
  window.showTab = (group, name) => {
    document.querySelectorAll(`[data-tabs="${group}"] [data-tab]`).forEach(b => {
      const on = b.dataset.tab === name;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', String(on));
    });
    document.querySelectorAll(`[data-panels="${group}"] > [data-panel]`).forEach(p => p.hidden = p.dataset.panel !== name);
  };
  function tabs() {
    document.querySelectorAll('[data-tabs]').forEach(bar => bar.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => showTab(bar.dataset.tabs, b.dataset.tab)));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { rail(); tabs(); });
  else { rail(); tabs(); }
})();
