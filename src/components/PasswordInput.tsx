"use client";
import { useState } from "react";
import Icon from "./Icon";
import SmoothInput from "./SmoothInput";

/** Campo de senha com cursor suave e botão de olho (mostra/oculta). */
export default function PasswordInput(props: {
  id: string; value: string; onChange: (v: string) => void; autoComplete?: string; minLength?: number;
}) {
  const [show, setShow] = useState(false);
  return (
    <div style={{ position: "relative" }}>
      <SmoothInput id={props.id} type={show ? "text" : "password"} required value={props.value} minLength={props.minLength}
        autoComplete={props.autoComplete} style={{ paddingRight: 56 }} onChange={(e) => props.onChange(e.target.value)} />
      <button type="button" className="btn ghost small eye" aria-pressed={show}
        aria-label={show ? "Ocultar senha" : "Mostrar senha"} onClick={() => setShow((v) => !v)}>
        <Icon name={show ? "eye" : "eye-off"} />
      </button>
    </div>
  );
}
