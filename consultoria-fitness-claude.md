# Aplicativo de consultoria fitness

**Planejamento de produto · v1.0 · 25 de novembro de 2026**

## 01 · Visão e decisões

Plataforma privada para personal trainers que atendem on-line, presencialmente ou em formato híbrido. O personal gerencia a carteira e prescreve treinos. O aluno recebe a ficha, registra sua execução e acompanha a evolução. O diferencial pretendido combina prescrição detalhada, gestão empresarial e independência profissional.

| Status | Como interpretar |
|---|---|
| Confirmado | Escolha explícita do usuário ou requisito expresso no pedido atual |
| Proposto | Recurso, regra operacional ou solução técnica discutida ou detalhada neste documento para validação |
| Pendente | Escolha em aberto, dado ausente ou item fora deste recorte |

- **Confirmado.** Consultorias privadas, com entrada por convite ou link exclusivo, gestão administrativa e financeira restrita ao personal e chat interno individual. Cada profissional capta os próprios clientes. Não haverá vitrine, feed, grupos públicos ou descoberta de outras consultorias e preços.
- **Confirmado.** Autonomia configurável por aluno (opção C), com registro do realizado separado da prescrição original. IA assistiva (opção B), com decisão e publicação sob responsabilidade do personal. Biblioteca com animações anatômicas e possibilidade de vídeo próprio.
- **Confirmado para esta documentação.** Identidade preta e grafite, branco e verde-lima. Estética esportiva, tecnológica e minimalista. A capa usa um título descritivo, sem marca comercial definitiva.
- **Proposto.** Web, Android e iOS. Marca própria por consultoria como diferencial comercial, com nível de personalização e elegibilidade a validar.
- **Pendente.** Agenda profissional, etapa 4, tópico 7. Nutrição fica para desenvolvimento futuro.

## 02 · Assinaturas, pagamentos e gestão

| Plano proposto | Mensalidade | Limite ou diferencial |
|---|---|---|
| Gratuito | R$ 0,00 | 1 aluno |
| Starter | R$ 9,90 | Até 5 alunos ativos |
| Professional | R$ 39,90 | Alunos ilimitados |
| Premium | R$ 69,90 | Alunos ilimitados e marca própria |

**Proposta comercial.** Teste de 30 dias e acesso às três plataformas em todos os planos. O aluno paga pelo serviço contratado com o personal, sem assinatura própria do aplicativo. A proposta mais recente substitui a hipótese de R$ 79,90 para até 100 alunos. Definir aluno ativo, elegibilidade ao teste, benefícios e limites por plano. Validar custos de infraestrutura, armazenamento, suporte, taxas do intermediador e condições das lojas antes de fixar preços.

**Referência histórica do MFIT.** O levantamento citado na conversa registrou plano grátis para 1 aluno, R$ 10,90 para até 3, R$ 39,90/mês com alunos ilimitados e 10 dias de teste. Ilimitado trimestral por R$ 119,00 (R$ 39,67/mês), semestral por R$ 215,90 (R$ 35,98/mês) e anual por R$ 406,90 (R$ 33,91/mês). Também citou recorrência, IA, páginas de vendas, controle financeiro, acompanhamento e mais de 1.800 vídeos. Marca própria ficou sem confirmação. Usar como referência da conversa, sem tratar valores ou catálogo como vigentes.

| Meio | Taxa histórica MFIT | Recebimento citado |
|---|---|---|
| Pix | 2,59% | 1 dia útil |
| Boleto | R$ 3,90 | Até 3 dias úteis |
| Cartão | 4,99% + R$ 1,00 | Até 15 dias |
| Cartão | 3,99% + R$ 0,50 | Até 30 dias |

**Proposta de pagamentos.** Separar assinatura da plataforma e cobrança da consultoria. Avaliar Pix, boleto, cartão e recorrência conforme o intermediador. A proposta inicial é repassar a taxa do intermediador sem comissão adicional da plataforma. Provedor, taxas, prazos e fluxos de estorno ficam em aberto. Para o simulador Pix, comparar faturamento mensal × diferença entre taxas e multiplicar por 12 para projeção anual. A taxa própria é hipotética.

**Proposta de painel financeiro.** Recebimentos, inadimplência, despesas e cobrança automatizada. Evoluir para fluxo de caixa, DRE gerencial, margem de lucro, pró-labore, ticket médio, churn, CAC, LTV, metas e projeções. O aluno pode consultar suas próprias cobranças, pagamentos e contratação.

## 03 · Prescrição e periodização

**Fluxo proposto.** Selecionar aluno e revisar anamnese, objetivos, limitações, disponibilidade e histórico → criar programa → organizar sessões → adicionar exercícios → prescrever por série → revisar volume, frequência e distribuição → publicar → acompanhar e ajustar com histórico.

- **Estrutura.** Programa com objetivo, duração livre ou em aberto e organização semanal. Sessões A/B/C, Full Body, Upper/Lower, corrida ou divisão livre. Reordenar exercícios, duplicar treinos, semanas e programas, salvar modelos e programar progressões.
- **Séries.** Campos opcionais e editáveis por série. Classificação, repetições fixas, faixa, máximas ou por tempo, carga absoluta, percentual de 1RM ou livre, RIR, RPE ou falha, descanso, cadência, pausas, amplitude, lateralidade e orientações em texto ou vídeo. Prever progressão por carga, repetições ou regra própria e alternativas autorizadas.
- **Métodos avançados.** Representar blocos e registrar o desempenho de cada bloco. Drop-set é exemplo explícito. A lista completa e a regra de contagem de cada método ficam para validação.
- **Volume.** Exibir séries diretas e indiretas ponderadas por músculo e subdivisão. Diferenciar séries preparatórias, de aquecimento e de trabalho. A ponderação é configurável. O protótipo mostrou escala de 0 a 1, com passos de 0,25. Como convenção de monitoramento, volume ponderado = diretas + indiretas × peso. Validar critérios por exercício, variante e método.
- **Periodização.** Oferecer planos flexíveis. Exemplo ilustrativo de oito semanas: adaptação (1–2), progressão (3–5), intensificação (6–7) e deload (8). O personal controla as alterações e preserva as versões já publicadas.

## 04 · Aluno, avaliação e comunicação

- **Permissões confirmadas.** O personal configura autonomia por aluno. O aluno pode registrar o que executou mesmo quando não tem permissão para alterar a ficha. Manter prescrição, adaptações e execução como registros distinguíveis. Substituições autorizadas e outros controles individuais são regras propostas para validação.
- **Sessão proposta.** Exibir exercício, demonstração, alvos prescritos e desempenho anterior. Registrar séries, carga, repetições, esforço e observações. Iniciar descanso automaticamente ao concluir a série. Registrar sessões sem conexão e sincronizar posteriormente.
- **Evolução proposta.** Histórico de carga, repetições, 1RM estimada, recordes pessoais, aderência e sessões concluídas, com nível de detalhe adequado a cada perfil. Evolução de carga isolada não mede hipertrofia.
- **Avaliação proposta.** Anamnese configurável, PAR-Q+, peso, perimetria, dobras cutâneas, bioimpedância, fotos privadas, testes de força e cardiorrespiratórios e questionários próprios.
- **Check-ins propostos.** Definir frequência e perguntas por personal. Organizar respostas sobre treino, recuperação, dor ou desconforto no painel para orientar revisão profissional.
- **Chat confirmado.** Conversa privada entre personal e aluno. Escopo proposto de texto, áudio, fotos, vídeos de execução, documentos, notificações e vínculo com exercício da ficha. Definir limites de arquivo, armazenamento e retenção.

## 05 · Biblioteca anatômica e IA assistiva

**Biblioteca confirmada.** Animações anatômicas nos exercícios e opção de demonstração em vídeo inserida pelo personal. O desenho discutido prevê manter a animação, substituí-la ou exibir as duas mídias. A personalização pode valer para seus alunos quando o exercício é prescrito ou para um aluno específico. Exercícios próprios pertencem à biblioteca privada do profissional. O catálogo oficial é preservado.

**Padrão visual proposto.** Modelo humano com musculatura identificável, músculos principais em vermelho, equipamento realista, fundo neutro e movimento contínuo nas fases concêntrica e excêntrica. Prever reprodução automática, pausa e ângulo adequado ao movimento. A imagem anexada não estava disponível para reprodução nesta consolidação. Usar sua descrição como referência, com animações próprias ou devidamente licenciadas.

**Ficha e busca propostas.** Categoria, equipamento, músculos primários e secundários, subdivisões, articulações, padrão de movimento, lateralidade, modalidade e classificação monoarticular ou multiarticular. Filtrar por origem, favoritos e atributos técnicos. Buscar sinônimos e termos relacionados preservando diferenças entre variantes. No hack 45°, a conversa exemplifica quadríceps como primário, glúteo máximo como relevante e adutor magno como complementar, conforme execução, amplitude e equipamento.

**Produção proposta.** Priorizar exercícios mais usados, ampliar cobertura e revisar execução, anatomia, continuidade de quadros e licenças antes de publicar. IA pode ajudar na produção com revisão humana. A conversa menciona metas provisórias, mas os números não aparecem no histórico recuperado.

**IA confirmada · opção B.** Analisar registros e tendências, sugerir progressões, apoiar a montagem de treinos e sinalizar inconsistências. Mostrar dados, justificativa e insuficiência de informação quando aplicável. O personal revisa e aprova qualquer mudança. Exemplo ilustrativo: sugerir revisar a carga após sessões repetidas no topo da faixa com RIR registrado, considerando execução e recuperação. Qualquer automação futura depende de nova decisão.

## 06 · Arquitetura, privacidade e pagamentos técnicos

**Arquitetura proposta para validação.** Painel web responsivo e aplicativo multiplataforma iOS/Android com API compartilhada, banco relacional, armazenamento privado de objetos, notificações e tarefas assíncronas. Candidatos para avaliação: TypeScript, React/Next.js, React Native/Expo e PostgreSQL. Fornecedores e tecnologias permanecem em aberto.

- **Dados e acesso.** Modelar consultoria, associação de usuário e papel, convite, aluno, permissões, programa e suas versões, séries prescritas, sessões e séries realizadas, exercício e suas mídias, avaliação, check-in, chat, cobrança, evento de pagamento e sugestão de IA. A API valida vínculo e papel em cada operação. Catálogo oficial compartilhado e dados das consultorias isolados.
- **Offline.** Persistir registros de treino localmente, enfileirar alterações com identificadores estáveis, repetir sincronização sem duplicar séries e sinalizar conflitos. Preservar a versão de treino efetivamente usada na sessão.
- **Privacidade e LGPD.** Definir finalidade, bases legais, papéis de tratamento, retenção, descarte, exportação e fluxo de atendimento a titulares. Restringir acesso a dados de saúde e fotos, com criptografia, trilhas de auditoria e links privados de duração limitada para mídias. Minimizar dados enviados à IA e avaliar fornecedor, retenção e uso dos dados antes de integrar.
- **Pagamentos.** Usar checkout do intermediador. Separar assinatura SaaS de cobranças do aluno e reconciliar cada transação. Validar notificações do provedor, processá-las sem duplicidade e auditar mudanças de estado. Prever pendência, confirmação, falha, cancelamento e estorno. Validar regras comerciais, obrigações de privacidade e condições das lojas antes do lançamento.

## 07 · Roadmap proposto e pendências

| Frente | Sequência indicativa |
|---|---|
| Base | Identidade, acesso privado, convites, papéis, isolamento e cadastro de alunos |
| Núcleo | Editor por série, modelos, versões, catálogo inicial, volume e registro do treino com sincronização |
| Acompanhamento | Evolução, avaliações, check-ins, chat e conteúdo próprio do personal |
| Operação comercial | Assinaturas, pagamentos e conciliação. Evoluir do controle básico para indicadores e projeções |
| Expansão | Métodos avançados progressivos, biblioteca ampliada e IA assistiva após registros confiáveis |
| Futuro | Automação de periodização, análise de fadiga, relógios esportivos e nutrição |

**Agenda profissional · etapa 4, tópico 7 · pendente.** O histórico lista agenda básica, agenda completa e agenda completa com agendamento privado pelo aluno. A opção C foi sugerida, com possibilidade de desativar reservas pelo aluno. A modalidade ainda precisa de escolha.

**Validações prioritárias.** Provedor de pagamentos, custos e unit economics, regras dos planos, taxonomia muscular e métodos avançados, número de animações por versão e requisitos de privacidade, retenção e IA. Roadmap sem datas ou compromissos de entrega.

## 08 · Instruções para Claude

Use os itens confirmados como restrições de produto e transforme propostas em histórias, alternativas ou questões de validação. Conserve a numeração da agenda como tópico 7 da etapa 4. Mantenha a agenda fora da implementação até decisão. Utilize dados fictícios para protótipos. Registre escolhas técnicas novas como propostas, com sua motivação e dependências.

**Critérios de aceite prioritários.**

1. Um aluno convidado acessa somente sua área e seus dados autorizados. O acesso a outro aluno, consultoria ou mídia privada falha também pela API.
2. Um aluno registra o que realizou sem modificar a versão publicada. A sincronização repetida mantém uma única série por registro.
3. O personal visualiza o exercício com mídia oficial, própria ou ambas conforme a configuração e o escopo. Outra consultoria não recebe essa personalização.
4. A IA apresenta evidências e justificativa ou indica insuficiência de dados. A prescrição muda somente após revisão e aprovação do personal.
5. A cobrança do aluno e a assinatura SaaS têm registros separados. Repetir um evento do intermediador mantém uma única atualização financeira.
6. O personal consegue revisar volume por músculo, distinguindo diretas, indiretas, aquecimento e preparação. Alterações de configuração podem ser auditadas.

**Proveniência.** Conversa “Planejar aplicativo de consultoria”, até a etapa 4, tópico 6. O histórico recuperado contém cinco trocas. Arquitetura detalhada, critérios de aceite e ordenação do roadmap foram formulados nesta consolidação como propostas. A imagem anatômica e as quantidades das metas não estavam incluídas no histórico recuperado.
