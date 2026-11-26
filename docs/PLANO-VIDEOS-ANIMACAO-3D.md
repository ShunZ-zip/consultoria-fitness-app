# Plano: vídeos de animação 3D nos exercícios (estilo da imagem de referência)

> Pedido do usuário: **remover os vídeos do Leandro Twin**, **manter os exercícios da lista dele** e **mostrar vídeos de animações 3D** como a da imagem (boneco 3D cinza com o músculo trabalhado em destaque), **encontrados na internet**.

## Decisões e regras
- **Fonte dos vídeos:** YouTube, **incorporados por link** (`youtube-nocookie.com/embed`) com **crédito ao canal**; nada é baixado nem copiado para o servidor. O player já existe (`MediaViewer` + `youtubeId` em `src/lib/media.ts`).
- **Estilo da imagem de referência:** é o estilo do canal **Muscle & Motion** (@MuscleandMotion, 1,29 mi de inscritos), que publica animações 3D de exercícios com os músculos ativos em destaque. Outros canais com animação 3D (Planfit, Gym Animations, Anatomy Lab, TrainHive etc.) entram só quando não há do Muscle & Motion.
- **Sem correspondência real, o exercício fica sem vídeo** (ainda tem a animação 3D própria quando existe) em vez de receber um vídeo errado.
- **Direitos:** vídeos de terceiros, exibidos por incorporação oficial. Antes de divulgar o app, confirmar com os autores/canais (principalmente Muscle & Motion) que aceitam a exibição num produto comercial.
- **O que sai:** `src/lib/referenceVideos.ts` (links do Leandro Twin) e a nota correspondente no README/HANDOFF §5g. **O que fica:** os 81 exercícios do catálogo (lista do Leandro Twin) e as 16 animações 3D originais.

## Como a busca foi feita
Script local (`yt_search`), 3 consultas em inglês por exercício (`<nome> 3D muscle animation`, `<nome> Muscle and Motion`, `<nome> exercise 3D anatomy animation`), ranqueando por: relevância do nome do exercício no título (mínimo 66%), estilo (3D/animation/anatomy/muscles ou canal conhecido), canal Muscle & Motion e duração (até 2 min melhor). Cada id será conferido pelo oEmbed do YouTube (existe e permite incorporar) antes de entrar.

## Resultado da busca automática
**63 de 81 exercícios** com candidato; **18 sem** candidato aceitável. A coluna *confiança* é só do ranqueamento automático: **toda linha precisa de revisão visual** (vários títulos são de exercício parecido, não do mesmo: ex.: "Supino reto" caiu em "Close Grip Bench Press"; "Cadeira extensora" em um vídeo misto).

| Exercício | Vídeo | Canal | Título | Duração | Confiança |
|---|---|---|---|---|---|
| Supino reto | [1cFDN5aSKtw](https://www.youtube.com/watch?v=1cFDN5aSKtw) | Muscle & Motion | Barbell Close Grip Bench Press | 0:43 | alta |
| Supino declinado | [vYgFvAMJlPI](https://www.youtube.com/watch?v=vYgFvAMJlPI) | Muscle & Motion | Pectoralis Major, Bench Press | 0:20 | média |
| Crucifixo | [upJyIg6ip3k](https://www.youtube.com/watch?v=upJyIg6ip3k) | Muscle & Motion | Dumbbell Chest Press on Stability Ball / Anatomical Analysis | 1:41 | média |
| Crucifixo inclinado | [iqWKWjKt7fQ](https://www.youtube.com/watch?v=iqWKWjKt7fQ) | MUSCLE COACH PT  | How to Do an Incline Dumbbell Fly Correctly for Chest Growth / Muscle  | 0:11 | baixa |
| Flexão de braço | [qpcBos-EUug](https://www.youtube.com/watch?v=qpcBos-EUug) | Muscle & Motion | How to do a Proper Push Up: Watch the muscles in 3D & learn to avoid a | 1:33 | alta |
| Pull-over | [ZmijCSRBW5E](https://www.youtube.com/watch?v=ZmijCSRBW5E) | Muscle & Motion | Dumbbell Pullover | 1:22 | alta |
| Barra fixa | [swLoMW9WFZI](https://www.youtube.com/watch?v=swLoMW9WFZI) | Muscle & Motion | Pull Ups & Dips with Muscular Analysis | 1:05 | alta |
| Levantamento terra | [o5FvhPAZ_yw](https://www.youtube.com/watch?v=o5FvhPAZ_yw) | Muscle & Motion | How to Deadlift Properly: 3D Animation of Muscles in Motion | 1:24 | alta |
| Puxada frontal | [or-b1psncs4](https://www.youtube.com/watch?v=or-b1psncs4) | Muscle & Motion | Mastering the Lat Pulldown for a Stronger Back | 1:43 | alta |
| Remada curvada | [jOr03vOvMH0](https://www.youtube.com/watch?v=jOr03vOvMH0) | Muscle & Motion | Smith Machine Bent-Over Row: Strengthen Your Back with Control | 1:46 | média |
| Remada curvada com halteres | [jOr03vOvMH0](https://www.youtube.com/watch?v=jOr03vOvMH0) | Muscle & Motion | Smith Machine Bent-Over Row: Strengthen Your Back with Control | 1:46 | média |
| Remada na máquina | [Ly0TerDmMuI](https://www.youtube.com/watch?v=Ly0TerDmMuI) | Planfit | How to Seated Row Machine, 3D animation,gif | 0:06 | baixa |
| Remada no cross | [K-h-DFseHfk](https://www.youtube.com/watch?v=K-h-DFseHfk) | TrainHive | Seated Cable Row Male – What Muscles Actually Work 3D Anatomy – TrainH | 0:36 | baixa |
| Remada unilateral com halter | [xIjW4nmaIOo](https://www.youtube.com/watch?v=xIjW4nmaIOo) | Planfit | How to One Arm Dumbbell Row, 3d animation, gif | 0:07 | baixa |
| Elevação lateral | [WtP691z7Wz8](https://www.youtube.com/watch?v=WtP691z7Wz8) | Muscle & Motion | Dumbbell Side Lateral Raise | 1:43 | alta |
| Elevação lateral no cross | [a4lcU0WMiIY](https://www.youtube.com/watch?v=a4lcU0WMiIY) | Muscle & Motion | Lateral Raise Exercise | 0:56 | média |
| Elevação frontal | [WtP691z7Wz8](https://www.youtube.com/watch?v=WtP691z7Wz8) | Muscle & Motion | Dumbbell Side Lateral Raise | 1:43 | média |
| Elevação frontal no cross | [YpYHhw4Jhrs](https://www.youtube.com/watch?v=YpYHhw4Jhrs) | Gym Animations | Cable One Arm Front Raise | 0:11 | baixa |
| Crucifixo inverso | [bKu9Ys175VY](https://www.youtube.com/watch?v=bKu9Ys175VY) | Muscle & Motion | Maximize Posterior Deltoid Gains with the Machine Reverse Fly | 1:28 | média |
| Desenvolvimento com halteres | [hmh5kzKMmhM](https://www.youtube.com/watch?v=hmh5kzKMmhM) | Muscle & Motion | Shoulder Press Common Mistake and More... | 0:52 | média |
| Desenvolvimento militar | [XJGvZbDM8iY](https://www.youtube.com/watch?v=XJGvZbDM8iY) | Kinetic Library | Anatomy and Biomechanics of the Military Press | 0:31 | baixa |
| Manguito rotador (rotação externa) | [lw5jkvrLwVw](https://www.youtube.com/watch?v=lw5jkvrLwVw) | Muscle & Motion | Strengthen Your Rotator Cuff: Shoulder External Rotation with Mini Ban | 2:27 | média |
| Manguito rotador (rotação interna) | [lw5jkvrLwVw](https://www.youtube.com/watch?v=lw5jkvrLwVw) | Muscle & Motion | Strengthen Your Rotator Cuff: Shoulder External Rotation with Mini Ban | 2:27 | média |
| Encolhimento | [RwX1K9Qn4Uk](https://www.youtube.com/watch?v=RwX1K9Qn4Uk) | AOVALO | AOVALO dumbbell shrug fitness exercise workout animation video male | 0:17 | baixa |
| Remada alta | [pT4njrC59fk](https://www.youtube.com/watch?v=pT4njrC59fk) | Muscle & Motion | Upright Row - Good or Bad? | 1:07 | alta |
| Paralelas | [hML4VgNWLak](https://www.youtube.com/watch?v=hML4VgNWLak) | TricksUp | Dip Bars(Parallel Bars) Exercises / 3D Animations | 8:08 | baixa |
| Mergulho | [arZWKRN9PJY](https://www.youtube.com/watch?v=arZWKRN9PJY) | Muscle & Motion | Bench Dip - Dangerous Zone | 0:56 | alta |
| Supino fechado | [1cFDN5aSKtw](https://www.youtube.com/watch?v=1cFDN5aSKtw) | Muscle & Motion | Barbell Close Grip Bench Press | 0:43 | alta |
| Tríceps na polia | [4r3GdBAnHqc](https://www.youtube.com/watch?v=4r3GdBAnHqc) | Muscle & Motion | Work on your Triceps with Cable One Arm Push-down | 1:00 | alta |
| Tríceps francês | [PuS4aqUKXNY](https://www.youtube.com/watch?v=PuS4aqUKXNY) | Muscle & Motion | Kneeling Triceps Extension | 1:38 | média |
| Tríceps coice | [IQzfREbIfVg](https://www.youtube.com/watch?v=IQzfREbIfVg) | Dance Cube | "Triceps Kickback" Exercise (Learn the Muscles!) | 0:41 | baixa |
| Flexão de braço fechada | [8_ILkbB9an8](https://www.youtube.com/watch?v=8_ILkbB9an8) | Colossus Fitness | How to PROPERLY Diamond Push-Up (Close Grip Push-Up) For Muscle Gain | 3:38 | baixa |
| Rosca direta | [U1V6_tD9MfQ](https://www.youtube.com/watch?v=U1V6_tD9MfQ) | Muscle & Motion | Biceps Curl, Single Leg Deadlift Stance / Anatomical Analysis | 0:50 | média |
| Rosca martelo | [2HPs8LYJNYM](https://www.youtube.com/watch?v=2HPs8LYJNYM) | D3igital | 4K Hammer Curls Stock Animation | 0:31 | baixa |
| Rosca scott | [_O1rZ7ghM3c](https://www.youtube.com/watch?v=_O1rZ7ghM3c) | Muscle & Motion | How to Do One-Arm Preacher Curls and a Common mistake | 1:37 | alta |
| Rosca concentrada | [NiWoiu7WL-Y](https://www.youtube.com/watch?v=NiWoiu7WL-Y) | Muscle & Motion | Dumbbell Concentration Curl / 3D Anatomy | 0:27 | alta |
| Flexão de punho | [DQPkmTJpnk4](https://www.youtube.com/watch?v=DQPkmTJpnk4) | SHABBIR 45 | 3D Animation of Wrist Curls Exercise with Anatomical Muscle Highlight | 0:06 | baixa |
| Extensão de punho | [DQPkmTJpnk4](https://www.youtube.com/watch?v=DQPkmTJpnk4) | SHABBIR 45 | 3D Animation of Wrist Curls Exercise with Anatomical Muscle Highlight | 0:06 | baixa |
| Rosca inversa | [Wc_l1qL-60c](https://www.youtube.com/watch?v=Wc_l1qL-60c) | Muscle & Motion | Master the Hanging Reverse Curl: Core Strength Redefined | 2:42 | média |
| Agachamento livre | [hO4lUEXfriY](https://www.youtube.com/watch?v=hO4lUEXfriY) | Muscle & Motion | Squat Jump (Barbell): Build Explosive Power | 2:10 | baixa |
| Agachamento frontal | [7jbJq5am4sw](https://www.youtube.com/watch?v=7jbJq5am4sw) | BSU Masters Degree - Strength & Conditioning | Front Squat Anatomy | 1:23 | baixa |
| Agachamento sumô | [BE_9UDq5X5k](https://www.youtube.com/watch?v=BE_9UDq5X5k) | Dance Cube | "Sumo Squat" Exercise (Learn the Muscles!) | 0:48 | baixa |
| Agachamento búlgaro | [xyn1-o3NkLg](https://www.youtube.com/watch?v=xyn1-o3NkLg) | Muscle & Motion | Bulgarian Split Squat Vs. Skater Squat | 2:23 | média |
| Passada | [5DadWZno5N0](https://www.youtube.com/watch?v=5DadWZno5N0) | Muscle & Motion | Weighted walking lunge (kettlebell) | 1:16 | alta |
| Afundo | [SGwpAzYVNfc](https://www.youtube.com/watch?v=SGwpAzYVNfc) | Muscle & Motion | Overhead Lunge I Anatomical analysis & Mistakes to avoid | 1:47 | alta |
| Avanço | [te8GLt4IpZo](https://www.youtube.com/watch?v=te8GLt4IpZo) | The Muscle Movement | Forward lunges / Tutorial / The Muscle Movement | 0:21 | baixa |
| Leg press 45° | [QDnCR1eOOPw](https://www.youtube.com/watch?v=QDnCR1eOOPw) | Muscle & Motion | Leg Press Anatomy | 0:48 | alta |
| Stiff | [W40UxQXeaFE](https://www.youtube.com/watch?v=W40UxQXeaFE) | Muscle & Motion | Lifting Injury Risk, Stiff-leg Deadlift and more. | 0:52 | média |
| Cadeira extensora | [SkhqeTn3CEU](https://www.youtube.com/watch?v=SkhqeTn3CEU) | Muscle & Motion | Tricep Extensions - Leg Curls - Core Workout Exercises: Muscle Motion  | 0:58 | alta |
| Mesa flexora | [PvkDCShhyL0](https://www.youtube.com/watch?v=PvkDCShhyL0) | AOVALO | AOVALO seated leg curl machine fitness exercise workout animation | 0:24 | baixa |
| Cadeira flexora | [PvkDCShhyL0](https://www.youtube.com/watch?v=PvkDCShhyL0) | AOVALO | AOVALO seated leg curl machine fitness exercise workout animation | 0:24 | baixa |
| Flexora vertical | [SkhqeTn3CEU](https://www.youtube.com/watch?v=SkhqeTn3CEU) | Muscle & Motion | Tricep Extensions - Leg Curls - Core Workout Exercises: Muscle Motion  | 0:58 | média |
| Cadeira adutora | [6aIuEAsjIhs](https://www.youtube.com/watch?v=6aIuEAsjIhs) | Anatomy Lab | Adductors in Motion- Hip Circumduction (3D Animation) | 2:10 | baixa |
| Glúteo em 4 apoios | [_VPHlGhgYdg](https://www.youtube.com/watch?v=_VPHlGhgYdg) | Muscle & Motion | Gluteus Maximus - Kickback | 0:38 | média |
| Glúteo na máquina | [_VPHlGhgYdg](https://www.youtube.com/watch?v=_VPHlGhgYdg) | Muscle & Motion | Gluteus Maximus - Kickback | 0:38 | alta |
| Glúteo no cross | [_VPHlGhgYdg](https://www.youtube.com/watch?v=_VPHlGhgYdg) | Muscle & Motion | Gluteus Maximus - Kickback | 0:38 | média |
| Elevação pélvica | [3PY_WZ2xS10](https://www.youtube.com/watch?v=3PY_WZ2xS10) | Muscle & Motion | Single-Leg Hip Thrust: Build Stronger Glutes Without Adding Weight | 2:00 | alta |
| Cadeira abdutora | [V9ldQSyDYTM](https://www.youtube.com/watch?v=V9ldQSyDYTM) | Anatomy Lab | Understanding Hip Abduction: Anatomy, Muscles, and Range of Motion | 5:42 | baixa |
| Panturrilha em pé | [NNy8-kDjyXo](https://www.youtube.com/watch?v=NNy8-kDjyXo) | 🩺 Dr. HealthoraCare | BIGGER CALVES: Standing vs Seated Calf Raise / Which One Builds More M | 0:31 | baixa |
| Panturrilha sentado | [NNy8-kDjyXo](https://www.youtube.com/watch?v=NNy8-kDjyXo) | 🩺 Dr. HealthoraCare | BIGGER CALVES: Standing vs Seated Calf Raise / Which One Builds More M | 0:31 | baixa |
| Prancha | [AwFaqk3kNJk](https://www.youtube.com/watch?v=AwFaqk3kNJk) | Biomech Body3D | Plank Exercise Explained in 3D Anatomy  Correct Form, Core Muscles & I | 5:36 | baixa |
| Extensão lombar | [XI6G2ZP_Y8w](https://www.youtube.com/watch?v=XI6G2ZP_Y8w) | TrainHive | 45 Degree Back Extension Male – What Muscles Actually Work 3D Anatomy  | 0:39 | baixa |
| Flexão de pescoço | [jGV_RTfRGF4](https://www.youtube.com/watch?v=jGV_RTfRGF4) | Amir nawaz Khan | Head/Neck Flexion with 3D animation | 1:50 | baixa |

### Sem candidato (18)
Supino inclinado com halteres, Crucifixo declinado, Cross-over, Peck deck, Pull-down, Elevação frontal com barra, Tríceps testa com barra, Tríceps testa com halteres, Tríceps unilateral na polia, Rosca alternada, Hand grip, Panturrilha no leg press, Abdominal supra, Abdominal infra, Abdominal oblíquo, Vácuo abdominal, Extensão de pescoço, Abdominal na máquina

## Passos
1. Revisar visualmente os candidatos (miniaturas/abrir o vídeo) e descartar os de outro exercício.
2. Substituir `referenceVideos.ts` pelos escolhidos (id, título e canal vindos do oEmbed) e remover a atribuição ao Leandro Twin do README/HANDOFF.
3. `ensureOfficialMedia`: remover do banco os vídeos antigos (url dos ids do Leandro Twin) e registrar os novos (idempotente).
4. Ajustar o crédito exibido (hoje "Crédito: <canal> (YouTube)").
5. Testes: ids válidos (11 caracteres), exercício existe, canal creditado, sem vídeo do Leandro Twin.

## Não verificado / riscos
- Reprodução do vídeo incorporado (o painel de navegador do app não carrega o YouTube).
- Permissão dos canais para exibir os vídeos num produto comercial.
- O estilo exato da imagem (renderização realista com músculos em vermelho) só é garantido nos vídeos do Muscle & Motion; nos demais canais o visual muda.
- Vídeos podem ser removidos ou ter a incorporação desativada pelo autor depois: prever conferência periódica (oEmbed) e recuo para a animação 3D própria.
