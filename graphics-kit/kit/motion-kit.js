/* Motion kit: seek-safe GSAP recipes for animating images and text in a HyperFrames composition.
   Every helper ADDS tweens to the timeline you pass, at an absolute time `at` (seconds), and returns that timeline.
   Nothing here uses Math.random, Date.now or repeat:-1, so any frame can be rendered on its own.

     const K = window.MotionKit, tl = gsap.timeline({ paused: true });
     K.kenBurns(tl, "#hero", { at: 0, dur: 4, from: { scale: 1.18, x: -40 }, to: { scale: 1, x: 30 } });
     K.reveal(tl, "#hero", { at: 0, dur: 0.9, style: "wipe-up" });
     K.words(tl, "#headline", { at: 0.4 });

   Image recipes: kenBurns, reveal, parallax, float, tilt, shine, tiles, slideshow, zoomThrough, focusPull, popIn, exit.
   Text recipes:  words, countUp, typeOn.  Ethiopic (Amharic) text is split on spaces, never inside a word. */
(function () {
  "use strict";
  const one = (el) => (typeof el === "string" ? document.querySelector(el) : el);
  // A selector, a NodeList, or an array of selectors and/or elements.
  const all = (els) => (typeof els === "string" ? Array.from(document.querySelectorAll(els)) : Array.from(els).map(one));

  // Slow push-in / pan over a still image. Put the image in a wrapper with overflow:hidden.
  function kenBurns(tl, el, { at = 0, dur = 4, from = { scale: 1.15 }, to = { scale: 1 }, ease = "none" } = {}) {
    return tl.fromTo(one(el), { transformOrigin: "50% 50%", ...from }, { ...to, duration: dur, ease }, at);
  }

  // Clip-path reveal. style: wipe-left|wipe-right|wipe-up|wipe-down|circle|diamond|blinds|center.
  const SHAPES = {
    "wipe-left": ["inset(0 0 0 100%)", "inset(0 0 0 0%)"],
    "wipe-right": ["inset(0 100% 0 0)", "inset(0 0% 0 0)"],
    "wipe-up": ["inset(100% 0 0 0)", "inset(0% 0 0 0)"],
    "wipe-down": ["inset(0 0 100% 0)", "inset(0 0 0% 0)"],
    center: ["inset(50% 0 50% 0)", "inset(0% 0 0% 0)"],
    circle: ["circle(0% at 50% 50%)", "circle(75% at 50% 50%)"],
    diamond: ["polygon(50% 50%, 50% 50%, 50% 50%, 50% 50%)", "polygon(50% -50%, 150% 50%, 50% 150%, -50% 50%)"],
  };
  function reveal(tl, el, { at = 0, dur = 0.9, style = "wipe-up", ease = "power3.inOut", out = false } = {}) {
    if (style === "blinds") return blinds(tl, el, { at, dur, ease, out });
    const [a, b] = SHAPES[style] || SHAPES["wipe-up"];
    return tl.fromTo(one(el), { clipPath: out ? b : a }, { clipPath: out ? a : b, duration: dur, ease }, at);
  }
  // Venetian blinds: the content is cut into horizontal strips that open one after another.
  // One clip-path holds one shape, so each strip is a copy of the element's content, layered inside the element itself.
  function blinds(tl, el, { at, dur, ease, out, count = 6 }) {
    const host = one(el), kids = Array.from(host.childNodes);
    if (getComputedStyle(host).position === "static") host.style.position = "relative";
    for (let i = 0; i < count; i++) {
      const top = (100 / count) * i, bottom = 100 - (100 / count) * (i + 1);
      const a = `inset(${top}% 0 ${bottom}% 100%)`, b = `inset(${top}% 0 ${bottom}% 0%)`, strip = document.createElement("div");
      strip.className = "mk-blind";
      Object.assign(strip.style, { position: "absolute", inset: "0", overflow: "hidden" });
      kids.forEach((k) => strip.appendChild(k.cloneNode(true)));
      host.appendChild(strip);
      tl.fromTo(strip, { clipPath: out ? b : a }, { clipPath: out ? a : b, duration: dur * 0.6, ease, immediateRender: !out }, at + (dur * 0.4 * i) / count);
    }
    kids.forEach((k) => k.nodeType === 1 && (k.style.visibility = "hidden"));
    return tl;
  }

  // Layers drift at different speeds (background slow, foreground fast) for depth from flat images.
  function parallax(tl, layers, { at = 0, dur = 4, dx = 0, dy = -80, depths, ease = "none" } = {}) {
    const els = all(layers), d = depths || els.map((_, i) => (i + 1) / els.length);
    els.forEach((el, i) => tl.fromTo(el, { x: -dx * d[i] * 0.5, y: -dy * d[i] * 0.5 }, { x: dx * d[i] * 0.5, y: dy * d[i] * 0.5, duration: dur, ease }, at));
    return tl;
  }

  // Product "hover": gentle bob and sway. cycles is a whole number of up-down swings (finite, so it seeks).
  function float(tl, el, { at = 0, dur = 4, amp = 18, rotate = 2, cycles = 2 } = {}) {
    const half = dur / (cycles * 2);
    return tl.fromTo(one(el), { y: -amp / 2, rotation: -rotate / 2 }, { y: amp / 2, rotation: rotate / 2, duration: half, ease: "sine.inOut", repeat: cycles * 2 - 1, yoyo: true }, at);
  }

  // 3D swing, like a card or phone turning towards the viewer.
  function tilt(tl, el, { at = 0, dur = 1.6, from = { rotationY: -28, rotationX: 8 }, to = { rotationY: 0, rotationX: 0 }, perspective = 1200, ease = "power3.out" } = {}) {
    return tl.fromTo(one(el), { transformPerspective: perspective, ...from }, { ...to, duration: dur, ease }, at);
  }

  // URL of the image inside a frame. A data-var-src image may not be substituted yet, so read the variable itself.
  function imageUrl(host) {
    const img = host.querySelector("img"), bound = img && img.getAttribute("data-var-src");
    const vars = bound && window.__hyperframes ? window.__hyperframes.getVariables() : {};
    return host.getAttribute("data-src") || (bound && vars[bound]) || (img || {}).src;
  }

  // A light streak sweeps across an image (adds a .mk-shine child; the element must be position:relative or absolute).
  // cutout: true (default when the frame has class "cutout") limits the streak to the image's own shape.
  function shine(tl, el, { at = 0, dur = 0.9, color = "rgba(255,255,255,.55)", width = 28, cutout } = {}) {
    const host = one(el), s = document.createElement("div");
    s.className = "mk-shine";
    Object.assign(s.style, { position: "absolute", inset: "0", pointerEvents: "none", mixBlendMode: "screen",
      background: `linear-gradient(105deg, transparent ${50 - width / 2}%, ${color} 50%, transparent ${50 + width / 2}%)`, backgroundSize: "300% 100%" });
    if (cutout ?? host.classList.contains("cutout")) {
      const mask = `url("${imageUrl(host)}") center / contain no-repeat`;
      s.style.webkitMask = mask; s.style.mask = mask;
    }
    host.appendChild(s);
    return tl.fromTo(s, { backgroundPosition: "100% 0" }, { backgroundPosition: "0% 0", duration: dur, ease: "power2.inOut" }, at);
  }

  // The image assembles from a grid of tiles that fly in. The element gets tile children; its own background is hidden.
  function tiles(tl, el, { src, at = 0, dur = 1.2, rows = 4, cols = 3, spread = 140, ease = "power3.out" } = {}) {
    const host = one(el), url = src || imageUrl(host);
    host.querySelectorAll("img").forEach((i) => (i.style.visibility = "hidden"));
    const parts = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const t = document.createElement("div");
      Object.assign(t.style, { position: "absolute", left: `${(100 / cols) * c}%`, top: `${(100 / rows) * r}%`, width: `${100 / cols + 0.2}%`, height: `${100 / rows + 0.2}%`,
        backgroundImage: `url("${url}")`, backgroundSize: `${cols * 100}% ${rows * 100}%`, backgroundPosition: `${cols > 1 ? (c / (cols - 1)) * 100 : 0}% ${rows > 1 ? (r / (rows - 1)) * 100 : 0}%` });
      host.appendChild(t); parts.push([t, r, c]);
    }
    parts.forEach(([t, r, c], i) => {
      // Deterministic scatter: direction comes from the tile's position, not randomness.
      const dx = (c - (cols - 1) / 2) * spread, dy = (r - (rows - 1) / 2) * spread;
      tl.fromTo(t, { x: dx, y: dy, opacity: 0, scale: 0.6, rotation: ((r + c) % 2 ? 8 : -8) }, { x: 0, y: 0, opacity: 1, scale: 1, rotation: 0, duration: dur * 0.7, ease }, at + (dur * 0.3 * i) / parts.length);
    });
    return tl;
  }

  // Several images in one frame, one after another; later ones stack on top. transition: crossfade|push|zoom|wipe.
  // Put the slides in one overflow:hidden frame (all the same size), or a pushed slide shows outside it.
  function slideshow(tl, els, { at = 0, each = 1.6, overlap = 0.45, transition = "push", kenburns = true } = {}) {
    const list = all(els), later = { immediateRender: false };  // no slide shows its start state before its turn
    gsap.set(list, { opacity: 0 });
    list.forEach((el, i) => {
      const start = at + i * each, d = i ? overlap : 0.01;
      if (transition === "push") tl.fromTo(el, { opacity: 1, xPercent: i ? 100 : 0 }, { opacity: 1, xPercent: 0, duration: d, ease: "power3.inOut", ...later }, start);
      else if (transition === "zoom") tl.fromTo(el, { opacity: 0, scale: 1.25 }, { opacity: 1, scale: 1, duration: d, ease: "power2.out", ...later }, start);
      else if (transition === "wipe") tl.fromTo(el, { opacity: 1, clipPath: "inset(0 100% 0 0)" }, { opacity: 1, clipPath: "inset(0 0% 0 0)", duration: d, ease: "power3.inOut", ...later }, start);
      else tl.fromTo(el, { opacity: 0 }, { opacity: 1, duration: d, ease: "none", ...later }, start);
      if (kenburns) { const img = el.querySelector("img") || el; tl.fromTo(img, { scale: 1.08 }, { scale: 1, duration: each + overlap, ease: "none", ...later }, start); }
      if (transition === "push" && i < list.length - 1) tl.to(el, { xPercent: -30, duration: overlap, ease: "power3.inOut" }, start + each);
    });
    return tl;
  }

  // Camera flies into the image until it fills past the frame: a transition out of a scene.
  function zoomThrough(tl, el, { at = 0, dur = 0.7, scale = 4, origin = "50% 50%" } = {}) {
    return tl.to(one(el), { scale, opacity: 0, transformOrigin: origin, duration: dur, ease: "power3.in" }, at);
  }

  // Blurry to sharp, like a lens finding focus.
  function focusPull(tl, el, { at = 0, dur = 1, blur = 18 } = {}) {
    return tl.fromTo(one(el), { filter: `blur(${blur}px)`, scale: 1.04 }, { filter: "blur(0px)", scale: 1, duration: dur, ease: "power2.out" }, at);
  }

  // Bouncy entrance for stickers, badges, product cutouts.
  function popIn(tl, el, { at = 0, dur = 0.6, from = 0.4, rotate = -6 } = {}) {
    return tl.fromTo(one(el), { scale: from, opacity: 0, rotation: rotate }, { scale: 1, opacity: 1, rotation: 0, duration: dur, ease: "back.out(2.2)" }, at);
  }

  // Leave the frame. style: fade|down|up|left|right|shrink.
  function exit(tl, el, { at = 0, dur = 0.45, style = "fade" } = {}) {
    const to = { fade: {}, down: { y: 120 }, up: { y: -120 }, left: { x: -200 }, right: { x: 200 }, shrink: { scale: 0.7 } }[style] || {};
    return tl.to(one(el), { opacity: 0, ...to, duration: dur, ease: "power2.in" }, at);
  }

  // Splits text into words (keeps spaces; works for Amharic/Ethiopic) and lets them rise in one by one.
  function words(tl, el, { at = 0, stagger = 0.08, dur = 0.55, ease = "power3.out" } = {}) {
    const node = one(el), text = node.textContent;
    node.textContent = "";
    const spans = text.split(/(\s+)/).map((w) => {
      if (/^\s+$/.test(w)) { node.appendChild(document.createTextNode(w)); return null; }
      const outer = document.createElement("span"), inner = document.createElement("span");
      outer.style.cssText = "display:inline-block;overflow:hidden;vertical-align:bottom;padding-bottom:.08em";
      inner.style.display = "inline-block"; inner.textContent = w; inner.className = "mk-word";
      outer.appendChild(inner); node.appendChild(outer); return inner;
    }).filter(Boolean);
    spans.forEach((s, i) => tl.fromTo(s, { yPercent: 110, opacity: 0 }, { yPercent: 0, opacity: 1, duration: dur, ease }, at + i * stagger));
    return tl;
  }

  // Number rolls from `from` to `to` (prices, stats). Text is set by an onUpdate that reads the tween's progress, so seeking works.
  function countUp(tl, el, { at = 0, dur = 1.2, from = 0, to, prefix = "", suffix = "", decimals = 0, ease = "power2.out" } = {}) {
    const node = one(el), raw = node.textContent.trim(), m = raw.match(/-?[\d,]*\.?\d+/);
    const target = to != null ? to : m ? parseFloat(m[0].replace(/,/g, "")) : 0;
    const pre = prefix || (m ? raw.slice(0, m.index) : ""), post = suffix || (m ? raw.slice(m.index + m[0].length) : "");
    const dec = decimals || (m && m[0].includes(".") ? m[0].split(".")[1].length : 0), box = { v: from };
    const draw = () => (node.textContent = pre + box.v.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec }) + post);
    draw();
    return tl.fromTo(box, { v: from }, { v: target, duration: dur, ease, onUpdate: draw, onComplete: draw }, at);
  }

  // Typewriter: characters appear one by one (grapheme-safe for Ethiopic syllables).
  function typeOn(tl, el, { at = 0, cps = 22 } = {}) {
    const node = one(el), chars = Array.from(node.textContent), box = { n: 0 };
    const draw = () => (node.textContent = chars.slice(0, Math.round(box.n)).join(""));
    draw();
    return tl.fromTo(box, { n: 0 }, { n: chars.length, duration: chars.length / cps, ease: "none", onUpdate: draw, onComplete: draw }, at);
  }

  window.MotionKit = { kenBurns, reveal, parallax, float, tilt, shine, tiles, slideshow, zoomThrough, focusPull, popIn, exit, words, countUp, typeOn };
})();
