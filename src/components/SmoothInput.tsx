"use client";
import { useEffect, useRef, type ComponentPropsWithoutRef } from "react";

// Campo com cursor suave: o cursor nativo é escondido e um cursor próprio desliza até a nova posição com uma
// mola (rigidez 500, amortecimento 30, massa 0,5). Funciona com digitação, setas, seleção, rolagem do texto e senha.
// Sem dependências. Com "reduzir movimento" ativo o cursor salta direto. Se algo falhar, o campo segue usável
// (o cursor nativo só é escondido depois que o componente mede o texto com sucesso).
const STIFFNESS = 500, DAMPING = 30, MASS = 0.5;

type Props = Omit<ComponentPropsWithoutRef<"input">, "type"> & {
  /** Tipos com suporte a seleção. Para e-mail use type="text" com inputMode="email". */
  type?: "text" | "password" | "search" | "tel";
  wrapperClassName?: string;
};

export default function SmoothInput({ type = "text", className, wrapperClassName, onFocus, onBlur, onChange, ...props }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const caretRef = useRef<HTMLSpanElement>(null);
  const api = useRef<{ update: () => void } | null>(null);

  useEffect(() => {
    const input = inputRef.current, measure = measureRef.current, caret = caretRef.current;
    if (!input || !measure || !caret) return;
    const ua = navigator.userAgent;
    const bullet = /firefox|fxios/i.test(ua) ? "●" : "•";
    const isChrome = /chrome|chromium|crios/i.test(ua);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");

    let x = 0, v = 0, target = 0, raf = 0, last = 0, placed = false, idle = 0;

    const tick = (now: number) => {
      // Tempo real decorrido, integrado em subpassos fixos de 4 ms: estável e correto mesmo com quadros lentos.
      let left = Math.min(0.5, (now - last) / 1000 || 0.016); last = now;
      while (left > 0) {
        const dt = Math.min(0.004, left); left -= dt;
        v += ((-STIFFNESS * (x - target) - DAMPING * v) / MASS) * dt; x += v * dt;
      }
      caret.style.transform = `translateX(${x}px)`;
      if (Math.abs(x - target) < 0.05 && Math.abs(v) < 0.05) { x = target; caret.style.transform = `translateX(${x}px)`; raf = 0; return; }
      raf = requestAnimationFrame(tick);
    };
    const moveTo = (px: number) => {
      target = px;
      if (!placed || reduce.matches) { x = px; v = 0; placed = true; caret.style.transform = `translateX(${x}px)`; return; }
      if (!raf) { last = performance.now(); raf = requestAnimationFrame(tick); }
    };

    const syncFont = () => {
      const s = getComputedStyle(input);
      let size = s.fontSize;
      if (input.type === "password" && bullet === "•" && !isChrome) size = `${parseFloat(size) + 6.25}px`; // Safari desenha a bolinha maior
      measure.style.font = `${s.fontStyle} ${s.fontWeight} ${size} ${s.fontFamily}`;
      measure.style.letterSpacing = s.letterSpacing;
      measure.style.fontFeatureSettings = s.fontFeatureSettings;
    };

    const update = () => {
      if (document.activeElement !== input) { caret.style.opacity = "0"; return; }
      const s = getComputedStyle(input);
      const padL = parseFloat(s.paddingLeft) || 0, padR = parseFloat(s.paddingRight) || 0;
      const start = input.selectionStart ?? 0, end = input.selectionEnd ?? 0;
      const idx = start === end ? start : input.selectionDirection === "backward" ? start : end;
      const before = input.type === "password" ? bullet.repeat(idx) : input.value.slice(0, idx);
      syncFont(); measure.textContent = before;
      const abs = before.length ? measure.offsetWidth + padL : padL - 1;

      // mantém o cursor dentro da área visível do campo
      const maxScroll = Math.max(0, input.scrollWidth - input.clientWidth);
      if (abs > input.scrollLeft + input.clientWidth - padR) input.scrollLeft = Math.min(abs - input.clientWidth + padR, maxScroll);
      else if (abs < input.scrollLeft + padL) input.scrollLeft = Math.max(0, abs - padL);

      const pos = abs - input.scrollLeft;
      const minX = padL - 1, maxX = input.clientWidth - padR;
      moveTo(Math.min(pos, maxX));
      const visible = pos >= minX && pos <= maxX + 1;
      caret.style.opacity = !visible || start !== end ? "0" : "1";
      // enquanto digita o cursor fica fixo; volta a piscar quando para
      caret.classList.remove("sc-blink"); window.clearTimeout(idle);
      idle = window.setTimeout(() => caret.classList.add("sc-blink"), 450);
    };
    api.current = { update };

    const later = () => requestAnimationFrame(update);
    const onSel = () => { if (document.activeElement === input) later(); };
    document.addEventListener("selectionchange", onSel);
    input.addEventListener("scroll", update);
    input.addEventListener("keyup", later);
    input.addEventListener("click", later);
    const ro = new ResizeObserver(update); ro.observe(input);
    void document.fonts?.ready.then(update);
    input.classList.add("sc-on"); // só agora o cursor nativo é escondido
    update();
    return () => {
      document.removeEventListener("selectionchange", onSel);
      input.removeEventListener("scroll", update); input.removeEventListener("keyup", later); input.removeEventListener("click", later);
      ro.disconnect(); cancelAnimationFrame(raf); window.clearTimeout(idle); input.classList.remove("sc-on");
    };
  }, []);

  return (
    <div className={`sinput${wrapperClassName ? ` ${wrapperClassName}` : ""}`}>
      <input {...props} ref={inputRef} type={type} className={className}
        onFocus={(e) => { onFocus?.(e); requestAnimationFrame(() => api.current?.update()); }}
        onBlur={(e) => { onBlur?.(e); if (caretRef.current) caretRef.current.style.opacity = "0"; }}
        onChange={(e) => { onChange?.(e); requestAnimationFrame(() => api.current?.update()); }} />
      <span ref={measureRef} aria-hidden className="sinput-measure" />
      <span ref={caretRef} aria-hidden className="sinput-caret" />
    </div>
  );
}
