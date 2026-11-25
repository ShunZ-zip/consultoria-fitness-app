"use client";
import Fx from "./Fx";

/** Faixas inclinadas (12°, assinatura da marca) ao fundo, com paralaxe: andam mais devagar que a página. */
export default function Backdrop() {
  return (
    <div className="backdrop" aria-hidden="true">
      <Fx fx="parallax" speed={0.1} className="band" style={{ top: "14%" }} />
      <Fx fx="parallax" speed={0.2} className="band b2" style={{ top: "58%" }} />
    </div>
  );
}
