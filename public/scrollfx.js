/*!
 * ScrollFX v1.0.0 — núcleo + módulos trigger, linked e parallax (JS puro, sem dependências).
 * Marque elementos com data-sfx="trigger|linked|parallax". Os módulos sticky e horizontal da
 * biblioteca original não foram incluídos porque o app não os usa.
 * Carregado no <head> (antes da primeira pintura) para nada "piscar" na abertura da página.
 */
(function (global) {
  'use strict';
  if (global.ScrollFX && global.ScrollFX.__core) return;

  var doc = global.document;
  var html = doc.documentElement;
  var registry = {}, tracked = [], warned = {};
  var ticking = false, listening = false, autoDone = false, resizeTimer = 0;
  var cfg = { respectReducedMotion: true };

  /* prefers-reduced-motion -> classe "sfx-reduced" no <html> (o CSS usa essa classe) */
  var mq = global.matchMedia ? global.matchMedia('(prefers-reduced-motion: reduce)') : null;
  function reducedMotion() { return cfg.respectReducedMotion && !!(mq && mq.matches); }
  function syncReducedClass() { html.classList.toggle('sfx-reduced', reducedMotion()); }
  function onMotionChange() { syncReducedClass(); refresh(); }
  if (mq) {
    if (mq.addEventListener) mq.addEventListener('change', onMotionChange);
    else if (mq.addListener) mq.addListener(onMotionChange);
  }
  html.classList.add('sfx-js');   // sem JS (ou se falhar) o conteúdo nunca fica escondido
  syncReducedClass();

  /* leitura de opções (data-sfx-*) */
  function attr(el, key) { return el.getAttribute('data-sfx-' + key); }
  function opt(el, key, fallback) { var v = attr(el, key); return (v === null || v === '') ? fallback : v; }
  function num(el, key, fallback) { var v = parseFloat(attr(el, key)); return isNaN(v) ? fallback : v; }
  function bool(el, key, fallback) {
    var v = attr(el, key);
    if (v === null) return fallback;
    return !(v === 'false' || v === '0' || v === 'no' || v === 'off');
  }
  function cssLength(v) { return /^-?\d+(\.\d+)?$/.test(String(v)) ? v + 'px' : v; }
  function clamp(v, min, max) { return v < min ? min : (v > max ? max : v); }

  /* âncoras de intervalo no estilo "top 85%" / "bottom center" */
  var WORDS = { top: 0, center: 0.5, bottom: 1 };
  function token(s, fallback) {
    s = String(s == null ? fallback : s).trim().toLowerCase();
    if (WORDS.hasOwnProperty(s)) return { rel: true, v: WORDS[s] };
    var n = parseFloat(s);
    if (isNaN(n)) return { rel: true, v: WORDS[fallback] || 0 };
    if (s.charAt(s.length - 1) === '%') return { rel: true, v: n / 100 };
    return { rel: false, v: n };
  }
  function anchor(str, defEdge, defView) {
    var p = String(str || '').trim().split(/\s+/);
    var e = token(p[0], defEdge), v = token(p[1], defView);
    return function (h, vh) { return { e: e.rel ? e.v * h : e.v, v: v.rel ? v.v * vh : v.v }; };
  }
  function rangeProgress(top, h, vh, a, b) {
    var s = a(h, vh), e = b(h, vh);
    var den = (e.e - s.e) + (s.v - e.v);
    if (Math.abs(den) < 0.001) return top <= (s.v - s.e) ? 1 : 0;
    return clamp((s.v - s.e - top) / den, 0, 1);
  }
  function emit(el, name, detail) { el.dispatchEvent(new CustomEvent('sfx:' + name, { bubbles: true, detail: detail || {} })); }

  /* agendador de scroll compartilhado: um listener e um requestAnimationFrame para todos os efeitos */
  function run(item) { item.update(global.innerHeight || html.clientHeight); }
  function frame() {
    ticking = false;
    var vh = global.innerHeight || html.clientHeight;
    for (var i = 0; i < tracked.length; i++) if (tracked[i].visible) tracked[i].update(vh);
  }
  function schedule() { if (ticking) return; ticking = true; global.requestAnimationFrame(frame); }
  function refresh() {
    tracked.forEach(function (it) { if (it.resize) it.resize(); });
    tracked.forEach(run);
  }
  function onResize() { global.clearTimeout(resizeTimer); resizeTimer = global.setTimeout(refresh, 80); }
  function listen() {
    if (listening) return;
    listening = true;
    global.addEventListener('scroll', schedule, { passive: true });
    global.addEventListener('resize', onResize);
    global.addEventListener('orientationchange', onResize);
    global.addEventListener('load', onResize);
  }
  function unlisten() {
    if (!listening || tracked.length) return;
    listening = false;
    global.removeEventListener('scroll', schedule);
    global.removeEventListener('resize', onResize);
    global.removeEventListener('orientationchange', onResize);
    global.removeEventListener('load', onResize);
  }

  function track(el, update, opts) {
    opts = opts || {};
    var margin = opts.margin == null ? 200 : opts.margin;
    var item = { el: opts.observe || el, update: update, resize: opts.resize || null, visible: true, io: null };
    if ('IntersectionObserver' in global) {
      item.visible = false;
      item.io = new IntersectionObserver(function (entries) {
        var was = item.visible;
        item.visible = entries[entries.length - 1].isIntersecting;
        if (item.visible !== was) run(item);   // última atualização ao entrar/sair: estado final exato
      }, { rootMargin: margin + 'px 0px ' + margin + 'px 0px' });
      item.io.observe(item.el);
    }
    tracked.push(item);
    listen();
    if (item.resize) item.resize();
    run(item);
    return {
      update: function () { run(item); },
      measure: function () { if (item.resize) item.resize(); run(item); },
      stop: function () {
        if (item.io) item.io.disconnect();
        var i = tracked.indexOf(item);
        if (i > -1) tracked.splice(i, 1);
        unlisten();
      }
    };
  }

  /* registro, init e API pública */
  function namesOf(el) { return (el.getAttribute('data-sfx') || '').split(/\s+/).filter(Boolean); }
  function collect(root) {
    root = root || doc;
    var nodes = Array.prototype.slice.call(root.querySelectorAll ? root.querySelectorAll('[data-sfx]') : []);
    if (root.nodeType === 1 && root.hasAttribute('data-sfx')) nodes.unshift(root);
    return nodes;
  }
  function init(root) {
    collect(root).forEach(function (el) {
      var store = el.__sfx || (el.__sfx = {});
      namesOf(el).forEach(function (name) {
        if (store[name] || !registry[name]) return;
        store[name] = registry[name](el, ScrollFX) || {};
      });
    });
  }
  function destroy(root) {
    collect(root).forEach(function (el) {
      var store = el.__sfx;
      if (!store) return;
      Object.keys(store).forEach(function (name) { if (store[name].destroy) store[name].destroy(); });
      delete el.__sfx;
    });
  }
  function register(name, factory) { registry[name] = factory; if (autoDone) init(doc); }
  function warnMissing() {
    collect(doc).forEach(function (el) {
      namesOf(el).forEach(function (n) {
        if (!registry[n] && !warned[n]) { warned[n] = true; console.warn('[ScrollFX] módulo "' + n + '" não encontrado.'); }
      });
    });
  }

  var ScrollFX = {
    version: '1.0.0', __core: true,
    register: register, init: init, destroy: destroy, refresh: refresh,
    config: function (o) {
      if (o && typeof o.respectReducedMotion === 'boolean') cfg.respectReducedMotion = o.respectReducedMotion;
      syncReducedClass(); refresh();
    },
    utils: { opt: opt, num: num, bool: bool, cssLength: cssLength, clamp: clamp, anchor: anchor, rangeProgress: rangeProgress, emit: emit, track: track, reducedMotion: reducedMotion }
  };
  global.ScrollFX = ScrollFX;

  function auto() {
    autoDone = true;
    init(doc);
    if (doc.readyState === 'complete') warnMissing(); else global.addEventListener('load', warnMissing);
  }
  /* Início MANUAL: em React o componente Fx chama init(el) depois da hidratação. O início automático no carregamento alterava o HTML do
     servidor antes do React hidratar (aviso de divergência de hidratação). Para uso fora do React, chame ScrollFX.init(document). */
  if (global.__SFX_AUTO === true) { if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', auto); else auto(); }
})(typeof window !== 'undefined' ? window : this);

/* ===================== módulo "trigger" (Scroll-trigger) =====================
 * O scroll chega num ponto e DISPARA uma animação que roda sozinha.
 * data-sfx-*: animation (fade|fade-up|fade-down|fade-left|fade-right|zoom-in|zoom-out|blur|mask-up),
 * duration, delay, stagger (ms entre filhos diretos), distance, easing, offset, threshold, once. */
(function (global) {
  'use strict';
  var fx = global.ScrollFX;
  if (!fx) { console.error('[ScrollFX] Carregue o core antes do trigger'); return; }
  var u = fx.utils;
  global.document.documentElement.classList.add('sfx-trigger');   // só então o CSS esconde os elementos antes do init

  fx.register('trigger', function (el) {
    var animation = u.opt(el, 'animation', 'fade-up');
    var duration = u.num(el, 'duration', 700);
    var delay = u.num(el, 'delay', 0);
    var stagger = u.num(el, 'stagger', 0);
    var easing = u.opt(el, 'easing', null);
    var distance = u.opt(el, 'distance', null);
    var offset = u.opt(el, 'offset', '-10%');
    var threshold = u.clamp(u.num(el, 'threshold', 0), 0, 1);
    var once = u.bool(el, 'once', true);
    if (threshold > 0 && el.offsetHeight * threshold > (global.innerHeight || 0)) threshold = 0;

    var targets = stagger ? Array.prototype.slice.call(el.children) : [el];
    targets.forEach(function (t, i) {
      t.classList.add('sfx-t', 'sfx-t--' + animation);
      t.style.setProperty('--sfx-duration', duration + 'ms');
      t.style.setProperty('--sfx-delay', (delay + i * stagger) + 'ms');
      if (easing) t.style.setProperty('--sfx-ease', easing);
      if (distance) t.style.setProperty('--sfx-dist', u.cssLength(distance));
    });

    // O estado inicial entra SEM transição (senão um elemento já visível "piscaria").
    var prevTransition = targets.map(function (t) { return t.style.transition; });
    targets.forEach(function (t) { t.style.transition = 'none'; });
    if (targets.length) void targets[0].offsetWidth;
    targets.forEach(function (t, i) { t.style.transition = prevTransition[i]; });
    el.classList.add('sfx-ready');

    var shown = false, io = null, cleanTimer = 0;
    function clean() {
      targets.forEach(function (t) {
        t.classList.remove('sfx-t', 'sfx-t--' + animation, 'sfx-in');
        ['--sfx-duration', '--sfx-delay', '--sfx-ease', '--sfx-dist'].forEach(function (p) { t.style.removeProperty(p); });
      });
    }
    function show() {
      if (shown) return;
      shown = true;
      targets.forEach(function (t) { t.classList.add('sfx-in'); });
      u.emit(el, 'enter');
      if (once) cleanTimer = global.setTimeout(clean, duration + delay + Math.max(0, targets.length - 1) * stagger + 150);
    }
    function hide() {
      if (!shown) return;
      shown = false;
      targets.forEach(function (t) { t.classList.remove('sfx-in'); });
      u.emit(el, 'leave');
    }
    function stop() { if (io) { io.disconnect(); io = null; } }

    if (!('IntersectionObserver' in global)) {
      show();
    } else {
      io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          var inView = e.isIntersecting && e.intersectionRatio >= threshold;
          var above = !e.isIntersecting && e.boundingClientRect.bottom <= 0;   // já ficou para trás
          if (inView || above) { show(); if (once) stop(); }
          else if (!once) hide();
        });
      }, { threshold: threshold, rootMargin: '0px 0px ' + offset + ' 0px' });
      io.observe(el);
    }
    return { destroy: function () { stop(); global.clearTimeout(cleanTimer); clean(); el.classList.remove('sfx-ready'); } };
  });
})(typeof window !== 'undefined' ? window : this);

/* ===================== módulo "linked" (Scroll-linked) =====================
 * A animação fica ATRELADA ao progresso do scroll; expõe --sfx-progress (0 a 1).
 * data-sfx-*: effect (none|fade|slide-up|slide-left|slide-right|scale|text-reveal|bar), start, end,
 * target, distance, min-opacity. */
(function (global) {
  'use strict';
  var fx = global.ScrollFX;
  if (!fx) { console.error('[ScrollFX] Carregue o core antes do linked'); return; }
  var u = fx.utils, doc = global.document;
  var PRESETS = {
    'none': { start: 'top bottom', end: 'bottom top' }, 'fade': { start: 'top 92%', end: 'top 58%' },
    'slide-up': { start: 'top 95%', end: 'top 55%' }, 'slide-left': { start: 'top 95%', end: 'top 55%' },
    'slide-right': { start: 'top 95%', end: 'top 55%' }, 'scale': { start: 'top 95%', end: 'top 50%' },
    'text-reveal': { start: 'top 85%', end: 'bottom 50%' }, 'bar': { start: 'top top', end: 'bottom bottom' }
  };
  var SOFT = 2.5;

  function splitWords(root) {
    var walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, null), nodes = [], words = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(function (node) {
      if (!/\S/.test(node.nodeValue)) return;
      var frag = doc.createDocumentFragment();
      node.nodeValue.split(/(\s+)/).forEach(function (part) {
        if (!part) return;
        if (/^\s+$/.test(part)) frag.appendChild(doc.createTextNode(part));
        else { var span = doc.createElement('span'); span.className = 'sfx-w'; span.textContent = part; frag.appendChild(span); words.push(span); }
      });
      node.parentNode.replaceChild(frag, node);
    });
    return words;
  }

  fx.register('linked', function (el) {
    var effect = u.opt(el, 'effect', 'none');
    if (!PRESETS[effect]) { console.warn('[ScrollFX] linked: efeito "' + effect + '" desconhecido. Usando "none".'); effect = 'none'; }
    var def = PRESETS[effect];
    var a = u.anchor(u.opt(el, 'start', def.start), 'top', 'bottom');
    var b = u.anchor(u.opt(el, 'end', def.end), 'bottom', 'top');
    var dist = u.num(el, 'distance', 60);
    var minOp = u.clamp(u.num(el, 'min-opacity', 0.18), 0, 1);
    var targetSel = u.opt(el, 'target', null);
    var ref = targetSel ? doc.querySelector(targetSel) : null;
    if (targetSel && !ref) console.warn('[ScrollFX] linked: target "' + targetSel + '" não encontrado.');
    var measuresSelf = !ref;
    if (!ref) ref = el;

    var original = null, words = null;
    if (effect === 'text-reveal') { original = el.innerHTML; words = splitWords(el); }
    var saved = { opacity: el.style.opacity, transform: el.style.transform };
    var ty = 0, sc = 1, last = -1;

    function apply(p) {
      switch (effect) {
        case 'fade': el.style.opacity = p; break;
        case 'slide-up': ty = (1 - p) * dist; el.style.opacity = p; el.style.transform = 'translate3d(0,' + ty.toFixed(2) + 'px,0)'; break;
        case 'slide-left': el.style.opacity = p; el.style.transform = 'translate3d(' + (-(1 - p) * dist).toFixed(2) + 'px,0,0)'; break;
        case 'slide-right': el.style.opacity = p; el.style.transform = 'translate3d(' + ((1 - p) * dist).toFixed(2) + 'px,0,0)'; break;
        case 'scale': sc = 0.85 + 0.15 * p; el.style.opacity = p; el.style.transform = 'scale(' + sc.toFixed(4) + ')'; break;
        case 'bar': el.style.transform = 'scaleX(' + p.toFixed(4) + ')'; break;
        case 'text-reveal':
          var n = words.length, t = p * (n + SOFT);
          for (var i = 0; i < n; i++) {
            var v = u.clamp((t - i) / SOFT, 0, 1);
            var o = Math.round((minOp + (1 - minOp) * v) * 100) / 100;
            if (words[i].__o !== o) { words[i].__o = o; words[i].style.opacity = o; }
          }
          break;
      }
    }
    function update(vh) {
      var r = ref.getBoundingClientRect();
      var h = ref.offsetHeight || r.height;
      var top = measuresSelf ? r.top - ty - h * (1 - sc) / 2 : r.top;
      var p = u.rangeProgress(top, h, vh, a, b);
      if (p === last) return;
      last = p;
      el.style.setProperty('--sfx-progress', p.toFixed(4));
      apply(p);
    }
    var tracker = u.track(el, update, { observe: measuresSelf ? el : ref });
    return {
      destroy: function () {
        tracker.stop();
        el.style.removeProperty('--sfx-progress');
        el.style.opacity = saved.opacity; el.style.transform = saved.transform;
        if (original !== null) el.innerHTML = original;
      }
    };
  });
})(typeof window !== 'undefined' ? window : this);

/* ===================== módulo "parallax" =====================
 * Camadas em velocidades diferentes. data-sfx-*: speed (0.2 = mais devagar que a página; negativo = mais rápido),
 * axis (y|x), min-width. Usa a propriedade CSS "translate" (não mexe no seu "transform"). */
(function (global) {
  'use strict';
  var fx = global.ScrollFX;
  if (!fx) { console.error('[ScrollFX] Carregue o core antes do parallax'); return; }
  var u = fx.utils;
  var supportsTranslate = !!(global.CSS && global.CSS.supports && global.CSS.supports('translate', '0px 0px'));

  fx.register('parallax', function (el) {
    var speed = u.num(el, 'speed', 0.2);
    var axis = u.opt(el, 'axis', 'y') === 'x' ? 'x' : 'y';
    var minWidth = u.num(el, 'min-width', 0);
    var saved = { translate: el.style.translate, transform: el.style.transform };
    var t = 0;
    function write(v) {
      t = v;
      var xy = axis === 'x' ? v + 'px 0' : '0 ' + v + 'px';
      if (supportsTranslate) el.style.translate = xy;
      else el.style.transform = 'translate3d(' + (axis === 'x' ? v + 'px,0' : '0,' + v + 'px') + ',0)';
    }
    function update(vh) {
      if (u.reducedMotion() || global.innerWidth < minWidth) { if (t !== 0) write(0); return; }
      var r = el.getBoundingClientRect();
      var h = el.offsetHeight || r.height;
      var layoutTop = axis === 'y' ? r.top - t : r.top;
      var offset = layoutTop + h / 2 - vh / 2;
      var next = Math.round(-speed * offset * 10) / 10;
      if (next !== t) write(next);
    }
    var tracker = u.track(el, update, { observe: el.parentElement || el, margin: 300 });
    return { destroy: function () { tracker.stop(); el.style.translate = saved.translate; el.style.transform = saved.transform; } };
  });
})(typeof window !== 'undefined' ? window : this);
