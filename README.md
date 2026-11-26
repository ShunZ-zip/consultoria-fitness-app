# Cauã Henry | Musculação — Consultoria (MVP web)

- **Entrega 1:** o personal convida um aluno → publica um treino → o aluno registra o que fez → o personal compara o realizado com a prescrição.
- **Entrega 2:** editor por série completo, rascunho editável, **versões** (a publicada é imutável), duplicar, **modelos**, **volume por músculo** com peso configurável e **auditoria** das alterações.
- **Entrega 2 (autonomia):** **permissões individuais por aluno** (opção C, 9 permissões do protótipo), alternativas autorizadas por exercício e adaptações da sessão registradas à parte, sem alterar a prescrição.

- **Entrega 3:** registro robusto: **modo offline com fila de sincronização**, histórico, **evolução** (carga, 1RM estimado por Epley, recordes, aderência), cronômetro de descanso e **último treino** exibido durante o registro.
- **Entrega 4:** acompanhamento: **mídia oficial ou própria** por exercício (regra geral e por aluno), **biblioteca privada** de exercícios, **avaliações** configuráveis, **check-ins** com painel e **chat** individual (texto).
- **Entrega 5:** operação comercial: **cobrança dos alunos** (contratos mensais, cobranças avulsas, recebimento manual, cancelamento), **assinatura da plataforma** (planos propostos), **webhook assinado e idempotente**, **painel financeiro básico** e despesas. Tudo em **ambiente simulado**: nenhum valor real é cobrado.

- **Entrega 6 (IA assistiva, opção B, por regras):** o personal pede **Analisar registros** no perfil do aluno e recebe sugestões com **evidências em tabela e justificativa**, ou "dados insuficientes" quando faltam sessões. **A prescrição só muda se o personal aprovar, e aprovar cria apenas um rascunho** de nova versão; o aluno não vê sugestões. **Sem IA externa.**
- **Organização do personal:** quadro de tarefas (A fazer / Em andamento / Concluído) com cartões arrastáveis, etiquetas, aluno e prazo opcional, e **sugestões automáticas** a partir de dados reais. **Não é agenda** (sem horários nem reservas).

Telas novas das entregas 3 a 5: Financeiro e Assinatura (personal), Pagamentos (aluno), Avaliações, Mensagens, Evolução e check-in.

Os vídeos próprios do personal continuam valendo (links https) e podem ser exibidos junto da animação 3D oficial.

Fora do escopo (conforme combinado): agenda profissional (etapa 4, tópico 7, **pendente**), **pagamentos reais** (provedor não escolhido), integração com **IA externa**, fotos corporais (exigem armazenamento privado e LGPD), upload de arquivos no chat e nutrição. Fluxo de caixa, DRE, margem, pró-labore, churn, CAC, LTV e projeções ficam para evolução futura. Todos os dados de exemplo são **fictícios**.

## Como rodar

Requer Node 20+ (testado com Node 26). Sem Docker e sem banco para instalar: o PostgreSQL embutido (PGlite) grava em `data/pglite`.

```powershell
npm install
npm run seed     # dados fictícios (opcional)
npm run dev      # http://localhost:3000
```

**Testar no celular (mesma rede Wi-Fi):** com `npm run dev` rodando, abra no celular `http://<IP do computador>:3000` (ex.: `http://192.168.0.100:3000`; veja o IP com `ipconfig`, linha "IPv4"). O `next.config.mjs` já libera as faixas de rede local em desenvolvimento (`allowedDevOrigins`). Se o celular não abrir nem a tela inicial, é o **firewall do Windows**: permita o Node na rede privada com um PowerShell **como administrador**: `New-NetFirewallRule -DisplayName "Node dev 3000" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow -Profile Private`. Celular e computador precisam estar na mesma rede (não use dados móveis). O 3D e o tema funcionam igual no celular.

Contas do seed (senha `demo12345`):

| Quem | E-mail | Consultoria |
|---|---|---|
| Personal | personal.alfa@demo.test | Alfa |
| Aluno Um / Dois | aluno1@demo.test / aluno2@demo.test | Alfa |
| Personal | personal.beta@demo.test | Beta |
| Aluno Três | aluno3@demo.test | Beta |
| Personal de **teste** | `admin` (senha `admin`) | Modelo (6 alunos `modelo1@demo.test` a `modelo6@demo.test`, senha `admin`, com cobranças de 4 meses e despesas, para ver as telas com números) |

A conta `admin` existe **só no seed**, para testes locais. Nunca rode o seed em produção.

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

**Entrega 3**
1. Como aluno, abra um treino e registre séries com a conexão desligada (DevTools → Network → Offline): o banner mostra a fila; ao voltar online, sincroniza sem duplicar. O cronômetro de descanso e o "último treino" aparecem durante o registro.
2. Com a permissão "Consultar treinos anteriores", o aluno vê **Evolução** (carga, 1RM, recordes, aderência). O personal vê a mesma tela no perfil do aluno. A aderência só existe se o treino tiver frequência semanal.

**Entrega 4**
00. **Catálogo e vídeos de animação 3D:** o catálogo oficial passou de 16 para **81 exercícios**, a partir dos nomes da lista "Vídeos dos Exercícios" (as variações de pegada e aparelho viram um exercício por movimento; **nomes e músculos são provisórios**, a validar). **52 exercícios** trazem um **vídeo de animação 3D do YouTube** (boneco 3D com o músculo em destaque; principalmente do canal **Muscle & Motion**), incorporado no app com crédito ao canal e link "Abrir no YouTube"; nada foi copiado para o servidor. Cada vídeo foi conferido (existe e permite incorporação) e a lista fica em `src/lib/referenceVideos.ts` (seleção e critérios em `docs/PLANO-VIDEOS-ANIMACAO-3D.md`). Os 16 exercícios com animação 3D própria mostram o 3D e, se houver, o vídeo. Exercícios sem correspondência segura ficam sem vídeo (29 de 81 não têm vídeo nem 3D próprio). Ficaram de fora do catálogo as técnicas avançadas e os alongamentos da lista. **Antes de divulgar o app, confirme com os canais (principalmente Muscle & Motion) que aceitam a exibição dos vídeos num produto comercial.**
0. **Animações 3D dos exercícios:** os 16 exercícios oficiais têm uma animação **3D original** (boneco articulado em Three.js, sem material de terceiros). Em "Ver demonstração" o aluno pode **girar o boneco arrastando**, ver de **lado, de frente ou em 3/4**, pausar e usar câmera lenta; o músculo principal fica em **verde** e o equipamento em azul, com uma dica de execução. Código em `src/lib/exercise3d.ts` (poses e equipamento) e `src/components/Exercise3D.tsx` (desenho). Para adicionar um exercício, crie sua pose em `SPECS`. Se o aparelho não suportar WebGL, aparece um aviso. Com movimento reduzido ativado, começa pausado.
1. **Mídia:** na biblioteca, adicione um vídeo próprio (só https) a um exercício e escolha "oficial", "própria" ou "ambas", para todos os alunos ou para um aluno. O aluno vê só o resultado.
2. **Avaliações:** crie um modelo (medidas, anamnese, triagem, testes ou personalizado), registre ou envie ao aluno; o aluno responde uma vez. Leituras pelo personal vão para a auditoria, sem as respostas.
3. **Check-ins:** o aluno responde o questionário (sono, fadiga, estresse, motivação, dor); o painel do personal mostra alertas primeiro. Frequência e perguntas se configuram por aluno ou como padrão. Sem finalidade diagnóstica.
4. **Chat:** conversa individual, com não lidas, vínculo opcional com exercício e limite de mensagens por minuto.

**Entrega 6 (sugestões por regras)**
1. Entre como `admin` / `admin`, abra o perfil de **Aluno Modelo 1** (treino publicado e 3 sessões no topo da faixa de repetições) e, em **Sugestões**, clique em **Analisar registros**.
2. Regras (propostas, determinísticas, sobre a **versão atual** do treino; mínimo de 3 sessões concluídas, senão responde "dados insuficientes" e não infere nada):
   - **Revisar carga:** 3 sessões seguidas com todas as séries de trabalho do exercício no topo da faixa de reps, com RIR registrado e igual ou acima da meta. Proposta: +2,5 kg nas séries de trabalho com carga em kg (carga em % vira só aviso, sem proposta).
   - **Revisar volume:** 1RM estimada (Epley) caindo em 2 sessões seguidas e check-in recente (14 dias) com fadiga alta ou dor. Proposta: retirar a última série de trabalho (nunca zera o exercício).
   - **Inconsistências** (sem proposta, só "Marcar como vista"): exercício prescrito nunca registrado; repetições abaixo de 70% da meta por 3 sessões; volume por músculo com razão de 4× ou mais entre o maior e o menor (3 ou mais músculos).
3. **Aprovar** cria um **rascunho** da próxima versão com a mudança (a versão publicada e o que o aluno vê não mudam); revise e publique no editor. Recusar não cria nada. Gerar de novo não repete sugestões, nem as já decididas na mesma versão. Se o treino mudou ou já existe um rascunho, aprovar é recusado com explicação.
4. Decisões ficam na auditoria. Aviso fixo na tela: "Sugestão automática por regras: você decide", e que evolução de carga isolada não representa necessariamente hipertrofia.

**Organização (quadro)**
1. Em **Organização**, adicione tarefas (título, etiqueta, aluno, prazo opcional). Mova os cartões **arrastando** entre as colunas ou pelos botões **←** e **→** (teclado e celular). **Editar** e **Excluir** em cada cartão; a exclusão pede confirmação e fica na auditoria.
2. **Sugestões:** check-in com sinal de atenção (últimos 14 dias), aluno sem treino publicado, mensagem do aluno sem resposta há mais de 24 h, avaliação enviada e pendente e cobrança em atraso. **Criar tarefa** transforma a sugestão em cartão; ela não volta enquanto a tarefa existir (mesmo concluída). Se a tarefa for excluída e a condição ainda valer, a sugestão reaparece.
3. No celular, as colunas rolam na horizontal com encaixe. A animação de reordenação respeita "reduzir movimento".

**Entrega 5** (ambiente simulado)
1. Como `personal.alfa@demo.test` (ou `admin`), abra **Financeiro**: cartões do mês, **gráfico dos últimos 6 meses** (abas Recebido, Despesas, Resultado e Faturado; o ponto fixo é o mês selecionado; passe o mouse ou toque nos pontos para ver os valores em R$), cobranças por status, **Gerar cobranças do mês**, **Marcar paga** (com o método), **Cancelar**, contratos, cobrança avulsa, despesas e eventos de conciliação.
2. Em **Assinatura**: planos Gratuito / Starter R$ 9,90 / Professional R$ 39,90 / Premium R$ 69,90, **marcados como proposta**; teste de 30 dias uma vez; o limite de alunos **não bloqueia** o uso.
3. Como `aluno1@demo.test`, abra **Pagamentos**: contratação e cobranças com status em texto e **Simular pagamento** (só fora de produção).
4. O webhook (`POST /api/webhooks/payments`) exige assinatura HMAC-SHA256 no cabeçalho `x-signature`. Fora de produção o segredo padrão é `dev-webhook-secret`; em produção é obrigatório definir `PAYMENT_WEBHOOK_SECRET` (sem ele o webhook responde 503). O mesmo evento repetido não repete o efeito.

## Testes

```powershell
npm test          # 268 testes em 19 arquivos, banco em memória
npm run typecheck
npm run validate  # validação HTTP ponta a ponta (entregas 1 a 5): exige o servidor rodando (npm run dev)
```

- `flow.test.ts`: convite → publicação → registro → comparação.
- `isolation.test.ts`: aluno × aluno, aluno × personal, consultoria × consultoria, sessão e convite, idempotência, imutabilidade da versão publicada (inclusive no banco).
- `delivery2.test.ts`: campos avançados e validações, rascunho, nova versão (aluno só vê a atual, histórico preservado), faixa de reps na comparação, duplicar, modelos, volume, configuração auditável e isolamento dessas operações.
- `permissions.test.ts`: as 9 permissões (padrão, configuração individual, auditoria, quem pode configurar), "sempre pode registrar", ordem, substituição autorizada/livre, exercício e série extra, descanso, volume, histórico, alternativas e comparação em três camadas.
- `password-reset.test.ts`: esqueci a senha (resposta igual para e-mail cadastrado ou não, uso único, expiração, limite por hora, sessões derrubadas, token só em hash).
- `volume.test.ts`: regra de volume (diretas, indiretas, peso, aquecimento e preparação fora do ponderado).
- `delivery3.test.ts`, `evolution.test.ts`, `syncQueue.test.ts`: evolução e aderência, último treino, frequência semanal, fila de sincronização offline.
- `delivery4.test.ts`, `followup-libs.test.ts`: biblioteca e mídia por escopo, avaliações, check-ins, chat e as regras puras de apoio.
- `suggestions.test.ts`: cada regra com dados que disparam e que não disparam, dados insuficientes, evidências iguais aos registros, **sem aprovação nada muda**, aprovar cria só rascunho (v1 intacta), recusar, sem duplicar, treino alterado depois da sugestão (409), isolamento (outra consultoria 404, aluno 403, sem sessão 401).
- `tasks.test.ts`: quadro de tarefas (criar, editar, mover, reordenar, excluir), sugestões corretas e sem duplicar, isolamento por consultoria (inclusive reordenar com cartão alheio), aluno 403 e sem sessão 401.
- `delivery5.test.ts`, `billing-libs.test.ts`: webhook assinado, eventos idempotentes e fora de ordem, separação entre assinatura da plataforma e cobrança do aluno, ciclo de cobrança, recebimento manual, painel, despesas, simulador (404 em produção) e isolamento.

`npm run validate` cria contas novas a cada execução e confere por HTTP o que os testes cobrem por chamada direta de handlers: 97 verificações nas entregas 1 a 5 e na recuperação de senha.

Os testes chamam os handlers da API (`Request` → `Response`), a mesma camada das rotas do Next. Não há teste automatizado de navegador; as telas foram verificadas manualmente (as telas financeiras em desktop; a verificação em 375 px cobriu só o Financeiro).

## Identidade visual

- **Temas:** o padrão é o **tema claro** (fundo cinza `#E6EAED`, texto azul-marinho, como as peças do Instagram); há uma opção de **tema escuro** (o visual anterior, fundo azul-marinho) no botão "Escuro/Claro" do cabeçalho e das telas públicas. A escolha fica salva no aparelho e é aplicada antes da primeira pintura. A troca é **animada**: uma onda circular cresce a partir do botão (View Transitions); em navegadores sem suporte as cores mudam suavemente; com "reduzir movimento" a troca é imediata. Regras de marca nos dois: só as 4 cores; **verde nunca é texto no tema claro** (o texto fica azul-marinho e o verde marca a função, com sublinhado ou borda); botões e etiquetas secundários no claro são azul-marinho com texto claro. Contraste medido (4,5:1 texto / 3:1 títulos grandes) em Painel, Financeiro, Organização e Biblioteca nos dois temas.

Segue o brandbook v1.1 "Identidade Visual Instagram 2026" (resumo do brandbook consultado; o PDF não pôde ser renderizado diretamente neste ambiente):

- **Definido:** paleta de 4 cores (azul-marinho `#0E1B2B`, azul vivo `#1A73E9`, cinza claro `#E6EAED`, verde `#2AC38B`; tons de apoio são só transparências), Fonte A "Velocidade" (títulos Heros Condensed Bold Italic em caixa-alta, texto Inter), wordmark CAUÃ HENRY com etiqueta MUSCULAÇÃO.
- **Proposta, aplicada como padrão de trabalho:** faixa/selo inclinado de 12° (etiquetas e botões), assinatura de rodapé, regras de contraste (azul vivo só em títulos grandes; verde com texto azul-marinho).
- **Adaptações para o app:** não há vermelho na paleta, então erros usam uma barra azul com "ATENÇÃO" e diferenças positivas/negativas são indicadas pelo sinal, não por cor.
- **Fonte condensada:** Heros Condensed e TeX Gyre Heros Cn não estão no npm. A pilha de fontes tenta `Heros Cn`/`TeX Gyre Heros Cn` instaladas no sistema e cai em Inter itálico. Para o visual final, adicione os arquivos licenciados com `@font-face`.
- Peça gráfica do avatar, rabiscos e fotos do brandbook não fazem parte do app.
- **Tela inicial e animações:** (na tela inicial, os textos e cartões que aparecem ao descer **desaparecem de novo ao subir**, e a frase final se revela e se apaga conforme a rolagem) a página `/` tem herói, cartões que aparecem ao rolar e um painel de acesso que expande para tela cheia (abre como diálogo modal, fecha com Esc ou "Fechar" devolvendo o foco). Os efeitos de rolagem (entrada em cascata, paralaxe das faixas inclinadas, barra de progresso) estão em `public/scrollfx.js` e `src/app/scrollfx.css`, sem dependências externas; os ícones têm microanimações e o cursor dos campos de texto usa uma mola. Os efeitos `sticky` e `horizontal` não foram incluídos (o app não os usa). Verificado no navegador em desktop; a tela inicial em 375 px e com `prefers-reduced-motion` ainda não foi conferida.

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

1. **Taxonomia muscular e catálogo:** 81 exercícios oficiais com músculos primários/secundários **provisórios** (16 do protótipo + 65 da lista de vídeos). Exercício com mais de um músculo primário conta uma direta em cada; o documento deixa isso para validação.
2. **Peso das indiretas:** padrão 0,5 (proposta), por consultoria e não por exercício.
3. **Fonte condensada da marca:** instalar/licenciar Heros Condensed (ou aprovar TeX Gyre Heros Cn).
4. **Provedor de pagamentos e de e-mail:** nenhum foi escolhido; sem eles não há cobrança real nem envio de e-mail.
5. **Provedor de IA:** a entrega 6 é por regras, sem LLM externo; integrar um provedor é decisão futura. **Ponto de extensão:** `analyze()` em `src/lib/suggestions.ts` recebe só dados agregados (por exercício: reps, carga, RIR e metas por sessão; sinais do check-in dos últimos 14 dias; volume por músculo) e devolve rascunhos de sugestão. **Minimização de dados (LGPD):** nome, e-mail, mensagens do chat, avaliações e textos livres do aluno não entram nessa análise; um provedor externo só deveria receber esse mesmo pacote agregado, com consentimento do aluno, e a decisão continuaria sendo do personal. Hoje nada sai do servidor.
6. **Planos da plataforma:** preços, limites e o teste de 30 dias são **propostas** e não bloqueiam o uso.
7. **Agenda profissional (tópico 7):** pendente; nada foi implementado.

## Limitações conhecidas

- Convite só por link na tela (sem e-mail); o link não pode ser consultado de novo.
- Sem limite de tentativas de login nem verificação de e-mail no cadastro. A recuperação de senha existe, mas **não envia e-mail em produção** (sem provedor).
- Sem excluir rascunho, modelo ou treino.
- A substituição, a ordem e os exercícios extras valem só para a sessão em registro; ainda não há "lembrar para as próximas sessões".
- O volume do personal considera a prescrição, não as adaptações do aluno.
- Um registro do aluno por vez. O modo offline guarda a fila no navegador do aluno; limpar os dados do site antes de sincronizar perde o que estava na fila.
- **Sem provedor de pagamentos:** só o provedor simulado, que existe fora de produção. Em produção, sem provedor, a tela mostra "Pagamento online indisponível" e o webhook exige segredo. O app não guarda dado de cartão nem de Pix.
- **E-mail só em desenvolvimento** (o link de recuperação aparece na tela); em produção nada é enviado.
- Os limites dos planos da plataforma não bloqueiam o uso (propostas).
- O botão "Simular pagamento" da assinatura só aparece quando há fatura da plataforma (após o fim do teste); não foi exercitado na interface, apenas nos testes.
- O service worker (abrir telas já visitadas sem conexão) só é registrado em produção e **não foi verificado num navegador real**: no painel de navegador usado nos testes o registro falhou por limitação do próprio painel. O modo offline do registro de treino (fila no aparelho) foi verificado em desenvolvimento.
- Com uma nova versão publicada, um registro em andamento na versão anterior pode ser concluído, mas não se abrem novos.
