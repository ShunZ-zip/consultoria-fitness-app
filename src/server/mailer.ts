// Envio de e-mail. Nesta entrega NÃO há provedor configurado:
// - desenvolvimento/teste: a mensagem fica na caixa de saída em memória e no console do servidor;
// - produção: nada é enviado (avisa no log). Integrar um provedor é uma decisão pendente.
export interface Mail { to: string; subject: string; text: string }

type G = typeof globalThis & { __outbox?: Mail[] };

/** Caixa de saída em memória (apenas fora de produção). Usada nos testes. */
export function outbox(): Mail[] {
  const g = globalThis as G;
  return (g.__outbox ??= []);
}

export async function sendMail(mail: Mail): Promise<void> {
  if (process.env.NODE_ENV === "production") {
    console.warn("[mailer] nenhum provedor de e-mail configurado; mensagem não enviada.");
    return;
  }
  outbox().push(mail);
  console.log(`[mailer:dev] Para: ${mail.to} | ${mail.subject}\n${mail.text}\n`);
}
