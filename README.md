# Cauã Henry | Musculação — Consultoria (MVP web)

- **Entrega 1:** o personal convida um aluno → publica um treino → o aluno registra o que fez → o personal compara o realizado com a prescrição.
- **Entrega 2:** editor por série completo, rascunho editável, **versões** (a publicada é imutável), duplicar, **modelos**, **volume por músculo** com peso configurável e **auditoria** das alterações.
- **Entrega 2 (autonomia):** **permissões individuais por aluno** (opção C, 9 permissões do protótipo), alternativas autorizadas por exercício e adaptações da sessão registradas à parte, sem alterar a prescrição.

Fora do escopo (conforme combinado): agenda profissional (etapa 4, tópico 7, **pendente**), pagamentos reais, IA, offline, mídias, chat, avaliações, cronômetro de descanso, evolução e check-ins (aparecem no protótipo, mas são de entregas seguintes). Todos os dados de exemplo são **fictícios**.

## Como rodar

Requer Node 20+ (testado com Node 26). Sem Docker e sem banco para instalar: o PostgreSQL embutido (PGlite) grava em `data/pglite`.

```powershell
npm install
npm run seed     # dados fictícios (opcional)
npm run dev      # http://localhost:3000
```

Contas do seed (senha `demo12345`):

| Quem | E-mail | Consultoria |
|---|---|---|
| Personal | personal.alfa@demo.test | Alfa |
| Aluno Um / Dois | aluno1@demo.test / aluno2@demo.test | Alfa |
| Personal | personal.beta@demo.test | Beta |
| Aluno Três | aluno3@demo.test | Beta |

Para recomeçar do zero: pare o servidor, apague a pasta `data` e rode `npm run seed`. Bancos criados na entrega 1 são migrados sozinhos ao abrir.

## Roteiro manual

**Entrega 1**
1. Como `personal.alfa@demo.test`, gere um convite (o link aparece uma única vez), abra-o em janela anônima e crie a conta do aluno.
2. Como personal, **Novo treino** → **Publicar para o aluno**.
3. Como aluno, abra o treino, registre cada série (**Salvar**) e **Concluir treino**.
4. Como personal, abra o treino: **Prescrito × realizado** mostra a diferença por série.

**Entrega 2**
1. **Editor:** em **Novo treino**, cada série tem tipo (trabalho / aquecimento / preparação), reps fixas ou faixa ("8–12"), carga em kg ou % de 1RM, RIR ou RPE, descanso, cadência e orientação. Reordene (↑ ↓), duplique exercício/série e veja o **volume da sessão** atualizar ao vivo.
2. **Rascunho:** **Salvar rascunho** e depois **Editar rascunho** na página do treino.
3. **Versões:** em um treino publicado, **Nova versão** cria um rascunho (v2) a partir dele. Ao publicar, o aluno passa a ver só a v2; a v1 continua intacta com seus registros (consulte pelos links "v1 · v2").
4. **Duplicar:** **Duplicar e editar** (abre o editor com uma cópia) ou **Duplicar como rascunho** (mesmo aluno ou outro da consultoria).
5. **Modelos:** **Salvar como modelo** (no editor ou no treino); depois **Modelos → Usar**, ou "Carregar modelo" no editor.
6. **Volume:** na página do treino, a tabela separa diretas, indiretas, ponderado, aquecimento e preparação. Em **Seus alunos → Configuração de volume**, altere o peso das indiretas (0 a 1, passos de 0,25) e veja a entrada em "Últimas alterações (auditoria)".

**Autonomia por aluno (opção C)**
1. Em **Seus alunos → Permissões** (perfil do aluno), ligue/desligue as 9 permissões. Cada mudança é salva na hora e vai para a auditoria. Padrão do protótipo: 5 de 9 habilitadas.
2. No editor, em cada exercício, defina as **alternativas autorizadas** (o aluno só as usa se "Substituir exercícios autorizados" estiver ligado).
3. Como aluno, a tela do treino mostra só o que foi liberado: ↑ ↓ para reordenar, "Substituir por…", "Adicionar exercício", "+ Série extra", "Desc. real (s)", volume e treinos anteriores. Registrar o realizado está sempre disponível.
4. Como personal, em **Prescrito × realizado**, o quadro "Adaptações do aluno" mostra a ordem usada, substituições, séries extras e exercícios extras; a prescrição original aparece intacta ao lado do realizado.

**Esqueci a senha**
1. Na tela de login, clique em **Esqueci a senha**, informe o e-mail e confirme. A resposta é a mesma para e-mail cadastrado ou não.
2. **Sem provedor de e-mail configurado**, em desenvolvimento (`npm run dev`) o link aparece na própria tela e no console do servidor. Em produção **nada é enviado** até um provedor ser escolhido e `APP_URL` ser definida (o link nunca é montado a partir do cabeçalho Host).
3. O link vale 60 minutos e uma única vez; só o hash fica no banco; máximo de 3 pedidos por hora por conta. Ao redefinir, todas as sessões da conta caem e os outros links pendentes são invalidados. Vale para personal e aluno.

## Testes

```powershell
npm test          # 83 testes, banco em memória
npm run typecheck
```

- `flow.test.ts`: convite → publicação → registro → comparação.
- `isolation.test.ts`: aluno × aluno, aluno × personal, consultoria × consultoria, sessão e convite, idempotência, imutabilidade da versão publicada (inclusive no banco).
- `delivery2.test.ts`: campos avançados e validações, rascunho, nova versão (aluno só vê a atual, histórico preservado), faixa de reps na comparação, duplicar, modelos, volume, configuração auditável e isolamento dessas operações.
- `permissions.test.ts`: as 9 permissões (padrão, configuração individual, auditoria, quem pode configurar), "sempre pode registrar", ordem, substituição autorizada/livre, exercício e série extra, descanso, volume, histórico, alternativas e comparação em três camadas.
- `password-reset.test.ts`: esqueci a senha (resposta igual para e-mail cadastrado ou não, uso único, expiração, limite por hora, sessões derrubadas, token só em hash).
- `volume.test.ts`: regra de volume (diretas, indiretas, peso, aquecimento e preparação fora do ponderado).

Os testes chamam os handlers da API (`Request` → `Response`), a mesma camada das rotas do Next. Não há teste automatizado de navegador; as telas foram verificadas manualmente.

## Identidade visual

Segue o brandbook v1.1 "Identidade Visual Instagram 2026" (resumo do brandbook consultado; o PDF não pôde ser renderizado diretamente neste ambiente):

- **Definido:** paleta de 4 cores (azul-marinho `#0E1B2B`, azul vivo `#1A73E9`, cinza claro `#E6EAED`, verde `#2AC38B`; tons de apoio são só transparências), Fonte A "Velocidade" (títulos Heros Condensed Bold Italic em caixa-alta, texto Inter), wordmark CAUÃ HENRY com etiqueta MUSCULAÇÃO.
- **Proposta, aplicada como padrão de trabalho:** faixa/selo inclinado de 12° (etiquetas e botões), assinatura de rodapé, regras de contraste (azul vivo só em títulos grandes; verde com texto azul-marinho).
- **Adaptações para o app:** não há vermelho na paleta, então erros usam uma barra azul com "ATENÇÃO" e diferenças positivas/negativas são indicadas pelo sinal, não por cor.
- **Fonte condensada:** Heros Condensed e TeX Gyre Heros Cn não estão no npm. A pilha de fontes tenta `Heros Cn`/`TeX Gyre Heros Cn` instaladas no sistema e cai em Inter itálico. Para o visual final, adicione os arquivos licenciados com `@font-face`.
- Peça gráfica do avatar, rabiscos e fotos do brandbook não fazem parte do app.

## Arquitetura (propostas)

- Next.js (App Router) + TypeScript; `src/app/api/**` são rotas finas que chamam `src/server/handlers.ts`.
- Autorização centralizada: `requireActor` (sessão e papel) e `loadVersion` (vínculo com a consultoria ou com o aluno). Acesso indevido responde **404**; papel errado **403**; sem sessão **401**.
- Prescrição publicada é imutável (código + gatilho no PostgreSQL). Mudanças geram nova versão; o realizado referencia a série e a versão exatas.
- Registro do realizado em `workout_logs`/`logged_sets`, com id gerado no cliente (reenviar não duplica). Só a versão atual aceita novos registros.
- Volume (`src/lib/volume.ts`, regra pura usada no servidor e no editor): ponderado = diretas + indiretas × peso; só séries de trabalho; aquecimento e preparação à parte.
- Configuração e publicações vão para `audit_log`, por consultoria.
- Escritas exigem `Content-Type: application/json` e cookie `SameSite=Lax` (mitigação básica de CSRF).

## Como as permissões foram interpretadas (confirmado pelo Henry)

A lista de 9 permissões e os padrões vêm do protótipo. O protótipo não descreve o comportamento de cada uma; estas leituras foram propostas e **confirmadas**:

- **Alterar a ordem:** a ordem escolhida fica no registro da sessão; a prescrita não muda.
- **Substituir autorizados / livremente:** autorizado = alternativas definidas pelo personal no exercício; livre = qualquer exercício da biblioteca acessível à consultoria (livre inclui as autorizadas). Voltar ao prescrito é sempre permitido. A substituição vale para a sessão, por exercício.
- **Adicionar exercícios:** exercício extra na sessão, com séries próprias e sem prescrição.
- **Alterar séries e repetições prescritas:** no app vira **registrar séries extras** em exercício prescrito. A meta prescrita em si nunca muda (registrar reps/carga diferentes da meta já é sempre permitido).
- **Alterar dias de treinamento:** guardada, mas **sem efeito**: depende da agenda (tópico 7, pendente).
- **Ajustar tempo de descanso:** o aluno registra o **descanso real** por série. Não há cronômetro nesta entrega.
- **Visualizar volume:** o aluno vê a tabela de volume do treino (mesma regra do personal).
- **Consultar treinos anteriores:** versões anteriores e seus registros. Sem a permissão, só a versão atual (e versões em que o aluno já tem registro).
- Revogar uma permissão vale para as próximas ações; o que já foi registrado permanece.

## Decisões em aberto (precisam de você)

1. **Taxonomia muscular e catálogo:** 16 exercícios oficiais fictícios com músculos primários/secundários **provisórios**. Exercício com mais de um músculo primário conta uma direta em cada; o documento deixa isso para validação.
2. **Peso das indiretas:** padrão 0,5 (proposta), por consultoria e não por exercício.
3. **Fonte condensada da marca:** instalar/licenciar Heros Condensed (ou aprovar TeX Gyre Heros Cn).

## Limitações conhecidas

- Convite só por link na tela (sem e-mail); o link não pode ser consultado de novo.
- Sem limite de tentativas de login nem verificação de e-mail no cadastro. A recuperação de senha existe, mas **não envia e-mail em produção** (sem provedor).
- Sem excluir rascunho, modelo ou treino.
- A substituição, a ordem e os exercícios extras valem só para a sessão em registro; ainda não há "lembrar para as próximas sessões".
- O volume do personal considera a prescrição, não as adaptações do aluno.
- Um registro do aluno por vez; sem modo offline (entrega 3).
- Com uma nova versão publicada, um registro em andamento na versão anterior pode ser concluído, mas não se abrem novos.
