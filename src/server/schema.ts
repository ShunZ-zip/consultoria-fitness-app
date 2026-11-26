// Esquema do banco (PostgreSQL). Executado na abertura; idempotente.
export const SCHEMA_SQL = `
create table if not exists consultancies (
  id uuid primary key,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists users (
  id uuid primary key,
  email text not null unique,
  name text not null,
  password_hash text not null,
  created_at timestamptz not null default now()
);

-- Um usuário pertence a uma única consultoria, com um papel.
create table if not exists memberships (
  user_id uuid primary key references users(id),
  consultancy_id uuid not null references consultancies(id),
  role text not null check (role in ('trainer','student'))
);

create table if not exists sessions (
  token_hash text primary key,
  user_id uuid not null references users(id),
  expires_at timestamptz not null
);

create table if not exists invites (
  id uuid primary key,
  consultancy_id uuid not null references consultancies(id),
  created_by uuid not null references users(id),
  student_name text not null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

-- Catálogo: consultancy_id nulo = oficial (compartilhado).
create table if not exists exercises (
  id uuid primary key,
  consultancy_id uuid references consultancies(id),
  name text not null,
  muscle text not null,
  equipment text not null
);

create table if not exists programs (
  id uuid primary key,
  consultancy_id uuid not null references consultancies(id),
  student_id uuid not null references users(id),
  name text not null,
  created_by uuid not null references users(id),
  created_at timestamptz not null default now()
);

-- Versão da prescrição. Depois de publicada, torna-se imutável.
create table if not exists program_versions (
  id uuid primary key,
  program_id uuid not null references programs(id),
  version int not null default 1,
  status text not null default 'draft' check (status in ('draft','published')),
  published_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists version_exercises (
  id uuid primary key,
  version_id uuid not null references program_versions(id),
  position int not null,
  exercise_id uuid not null references exercises(id),
  exercise_name text not null
);

create table if not exists version_sets (
  id uuid primary key,
  version_exercise_id uuid not null references version_exercises(id),
  position int not null,
  reps int,
  load_kg double precision,
  rir int,
  rest_s int
);

-- Realizado: registros separados da prescrição.
create table if not exists workout_logs (
  id uuid primary key,
  student_id uuid not null references users(id),
  version_id uuid not null references program_versions(id),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  note text
);

create table if not exists logged_sets (
  id uuid primary key,
  log_id uuid not null references workout_logs(id),
  version_set_id uuid not null references version_sets(id),
  reps int,
  load_kg double precision,
  rir int,
  note text,
  created_at timestamptz not null default now(),
  unique (log_id, version_set_id)
);

-- Barreira no banco: prescrição publicada não pode ser alterada nem apagada.
create or replace function block_published_edit() returns trigger as $$
declare vid uuid; st text;
begin
  if tg_table_name = 'version_exercises' then
    vid := coalesce(old.version_id, new.version_id);
  else
    select version_id into vid from version_exercises
      where id = coalesce(old.version_exercise_id, new.version_exercise_id);
  end if;
  select status into st from program_versions where id = vid;
  if st = 'published' then
    raise exception 'versao publicada e imutavel';
  end if;
  return coalesce(new, old);
end $$ language plpgsql;

drop trigger if exists trg_block_ve on version_exercises;
create trigger trg_block_ve before update or delete on version_exercises
  for each row execute function block_published_edit();
drop trigger if exists trg_block_vs on version_sets;
create trigger trg_block_vs before update or delete on version_sets
  for each row execute function block_published_edit();
`;

// Entrega 2: migrações aditivas e idempotentes (valem para bancos criados na entrega 1).
export const MIGRATION_2_SQL = `
alter table exercises add column if not exists primary_muscles text[] not null default '{}';
alter table exercises add column if not exists secondary_muscles text[] not null default '{}';

alter table program_versions add column if not exists based_on uuid references program_versions(id);
-- No máximo um rascunho por programa; as versões publicadas ficam preservadas.
create unique index if not exists one_draft_per_program on program_versions(program_id) where status = 'draft';

alter table version_sets add column if not exists set_type text not null default 'work'
  check (set_type in ('warmup','prep','work'));
alter table version_sets add column if not exists reps_max int;
alter table version_sets add column if not exists load_pct double precision;
alter table version_sets add column if not exists rpe double precision;
alter table version_sets add column if not exists tempo text;
alter table version_sets add column if not exists note text;

-- Configuração por consultoria: peso das séries indiretas no volume ponderado (0 a 1, passos de 0,25).
create table if not exists consultancy_settings (
  consultancy_id uuid primary key references consultancies(id),
  indirect_weight double precision not null default 0.5
);

-- Trilha de auditoria de configurações e publicações.
create table if not exists audit_log (
  id uuid primary key,
  consultancy_id uuid not null references consultancies(id),
  actor_id uuid not null references users(id),
  action text not null,
  detail jsonb not null default '{}',
  at timestamptz not null default now()
);

create table if not exists templates (
  id uuid primary key,
  consultancy_id uuid not null references consultancies(id),
  name text not null,
  content jsonb not null,
  created_by uuid not null references users(id),
  created_at timestamptz not null default now()
);
`;

// Autonomia por aluno (opção C): permissões, alternativas autorizadas e adaptações da sessão.
// Adaptações ficam em tabelas próprias: prescrição, adaptação e execução são registros distintos.
export const MIGRATION_3_SQL = `
create table if not exists student_permissions (
  student_id uuid primary key references users(id),
  consultancy_id uuid not null references consultancies(id),
  perms jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

-- Alternativas autorizadas pelo personal por exercício (parte da versão publicada).
alter table version_exercises add column if not exists alternative_ids uuid[] not null default '{}';

-- Ordem escolhida pelo aluno na sessão (nula = ordem prescrita).
alter table workout_logs add column if not exists exercise_order uuid[];

create table if not exists log_substitutions (
  log_id uuid not null references workout_logs(id),
  version_exercise_id uuid not null references version_exercises(id),
  exercise_id uuid not null references exercises(id),
  primary key (log_id, version_exercise_id)
);

create table if not exists log_extra_exercises (
  id uuid primary key,
  log_id uuid not null references workout_logs(id),
  exercise_id uuid not null references exercises(id),
  exercise_name text not null,
  position int not null
);

-- Séries realizadas: prescrita (version_set_id), série extra de exercício prescrito
-- (version_exercise_id + position) ou série de exercício extra (extra_exercise_id + position).
alter table logged_sets alter column version_set_id drop not null;
alter table logged_sets add column if not exists version_exercise_id uuid references version_exercises(id);
alter table logged_sets add column if not exists extra_exercise_id uuid references log_extra_exercises(id);
alter table logged_sets add column if not exists position int;
alter table logged_sets add column if not exists rest_s int;
create unique index if not exists logged_extra_set_uq on logged_sets (log_id, version_exercise_id, position)
  where version_set_id is null and extra_exercise_id is null;
create unique index if not exists logged_extra_ex_uq on logged_sets (extra_exercise_id, position)
  where extra_exercise_id is not null;
`;

// Redefinição de senha: só o hash do token é guardado; uso único; validade curta.
export const MIGRATION_4_SQL = `
create table if not exists password_resets (
  id uuid primary key,
  user_id uuid not null references users(id),
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
`;

// Entrega 3: frequência semanal opcional do programa (base da aderência).
export const MIGRATION_5_SQL = `
alter table programs add column if not exists weekly_frequency int check (weekly_frequency between 1 and 7);
`;

// Entrega 4: mídia dos exercícios, avaliações, check-ins e chat.
export const MIGRATION_6_SQL = `
create table if not exists exercise_media (
  id uuid primary key,
  exercise_id uuid not null references exercises(id),
  consultancy_id uuid references consultancies(id),          -- nulo = mídia oficial
  kind text not null check (kind in ('animation','video')),
  title text not null,
  url text not null,
  license text,
  created_by uuid references users(id),
  created_at timestamptz not null default now()
);

create table if not exists media_preferences (
  id uuid primary key,
  consultancy_id uuid not null references consultancies(id),
  exercise_id uuid not null references exercises(id),
  student_id uuid references users(id),                      -- nulo = todos os alunos do personal
  mode text not null check (mode in ('official','own','both')),
  own_media_id uuid references exercise_media(id),
  updated_at timestamptz not null default now()
);

create table if not exists assessment_templates (
  id uuid primary key,
  consultancy_id uuid not null references consultancies(id),
  name text not null,
  kind text not null,
  fields jsonb not null,
  created_by uuid not null references users(id),
  created_at timestamptz not null default now()
);

create table if not exists assessments (
  id uuid primary key,
  consultancy_id uuid not null references consultancies(id),
  student_id uuid not null references users(id),
  template_id uuid not null references assessment_templates(id),
  template_name text not null,
  fields jsonb not null,                                     -- cópia dos campos no momento do pedido
  answers jsonb,
  status text not null check (status in ('pending','done')),
  requested_by uuid not null references users(id),
  filled_by text check (filled_by in ('student','trainer')),
  created_at timestamptz not null default now(),
  submitted_at timestamptz
);

create table if not exists checkin_configs (
  id uuid primary key,
  consultancy_id uuid not null references consultancies(id),
  student_id uuid references users(id),                      -- nulo = padrão da consultoria
  frequency_days int not null check (frequency_days between 1 and 30),
  question_ids jsonb not null
);

create table if not exists checkins (
  id uuid primary key,
  consultancy_id uuid not null references consultancies(id),
  student_id uuid not null references users(id),
  answers jsonb not null,
  flags jsonb not null default '[]',
  created_at timestamptz not null default now()
);

create table if not exists messages (
  id uuid primary key,
  consultancy_id uuid not null references consultancies(id),
  student_id uuid not null references users(id),             -- a conversa é do aluno com o personal
  sender_id uuid not null references users(id),
  body text not null check (length(body) between 1 and 2000),
  exercise_id uuid references exercises(id),
  exercise_name text,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists messages_thread on messages (consultancy_id, student_id, created_at);
`;

// Entrega 5: assinatura da plataforma (SaaS) e cobrança do aluno em registros SEPARADOS, eventos do intermediador,
// despesas. Valores em centavos; datas de vencimento em texto AAAA-MM-DD.
export const MIGRATION_7_SQL = `
create table if not exists saas_subscriptions (
  id uuid primary key,
  consultancy_id uuid not null unique references consultancies(id),
  plan_id text not null,
  status text not null check (status in ('trialing','active','pending','past_due','canceled')),
  trial_used boolean not null default false,
  trial_ends_at timestamptz,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists saas_invoices (
  id uuid primary key,
  consultancy_id uuid not null references consultancies(id),
  subscription_id uuid not null references saas_subscriptions(id),
  plan_id text not null,
  amount_cents int not null check (amount_cents > 0),
  fee_cents int not null default 0,
  status text not null check (status in ('pending','paid','overdue','failed','canceled','refunded')),
  provider_ref text unique,
  period_start timestamptz not null,
  period_end timestamptz not null,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

create table if not exists student_contracts (
  id uuid primary key,
  consultancy_id uuid not null references consultancies(id),
  student_id uuid not null references users(id),
  description text not null,
  amount_cents int not null check (amount_cents between 100 and 10000000),
  due_day int not null check (due_day between 1 and 31),
  start_month text not null,
  active boolean not null default true,
  created_by uuid not null references users(id),
  created_at timestamptz not null default now()
);

create table if not exists student_charges (
  id uuid primary key,
  consultancy_id uuid not null references consultancies(id),
  student_id uuid not null references users(id),
  contract_id uuid references student_contracts(id),
  period text,
  description text not null,
  amount_cents int not null check (amount_cents between 100 and 10000000),
  fee_cents int not null default 0,
  due_date text not null check (due_date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  status text not null check (status in ('pending','paid','overdue','failed','canceled','refunded')),
  method text,
  source text not null default 'provider' check (source in ('provider','manual')),
  provider_ref text unique,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  refunded_at timestamptz
);
create unique index if not exists student_charge_period on student_charges (contract_id, period) where contract_id is not null;

-- Evento do intermediador: (provedor, id do evento) é único => reprocessar não repete efeito financeiro.
create table if not exists payment_events (
  id uuid primary key,
  provider text not null,
  event_id text not null,
  type text not null,
  ref text,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  result text check (result in ('applied','ignored','rejected')),
  reason text,
  scope text,
  target_id uuid,
  from_status text,
  to_status text,
  unique (provider, event_id)
);

create table if not exists expenses (
  id uuid primary key,
  consultancy_id uuid not null references consultancies(id),
  description text not null,
  category text not null,
  amount_cents int not null check (amount_cents > 0),
  date text not null check (date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  created_by uuid not null references users(id),
  created_at timestamptz not null default now()
);
`;

// Organização do personal (quadro de tarefas). Não é agenda: due_date é só um texto de data opcional.
export const MIGRATION_8_SQL = `
create table if not exists tasks (
  id uuid primary key,
  consultancy_id uuid not null references consultancies(id),
  title text not null check (length(title) between 1 and 140),
  tag text not null default 'Outro',
  status text not null default 'todo' check (status in ('todo','in-progress','done')),
  student_id uuid references users(id),
  due_date text check (due_date is null or due_date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  position int not null default 0,
  source_key text,
  created_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists tasks_source_key on tasks (consultancy_id, source_key) where source_key is not null;
create index if not exists tasks_board on tasks (consultancy_id, status, position);
`;

// Entrega 6: sugestões assistivas por regras. A decisão é do personal; aprovar cria RASCUNHO de nova versão.
export const MIGRATION_9_SQL = `
create table if not exists suggestions (
  id uuid primary key,
  consultancy_id uuid not null references consultancies(id),
  student_id uuid not null references users(id),
  version_id uuid not null references program_versions(id),   -- versão publicada analisada
  kind text not null,
  dedupe_key text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  title text not null,
  rationale text not null,
  evidence jsonb not null,
  proposal jsonb,
  result_version_id uuid references program_versions(id),     -- rascunho criado ao aprovar
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references users(id),
  unique (consultancy_id, student_id, version_id, kind, dedupe_key)
);
create index if not exists suggestions_student on suggestions (consultancy_id, student_id, status);
`;

// Seletor de exercícios do editor: favoritos (por usuário) e presets de séries do personal (por consultoria).
export const MIGRATION_10_SQL = `
create table if not exists exercise_favorites (
  user_id uuid not null references users(id),
  exercise_id uuid not null references exercises(id),
  created_at timestamptz not null default now(),
  primary key (user_id, exercise_id)
);
create table if not exists set_presets (
  id uuid primary key,
  consultancy_id uuid not null references consultancies(id),
  name text not null check (length(name) between 1 and 60),
  sets jsonb not null,
  created_by uuid not null references users(id),
  created_at timestamptz not null default now()
);
create unique index if not exists set_presets_name on set_presets (consultancy_id, lower(name));
`;

// Catálogo oficial inicial (nomes e músculos provisórios; vídeos de referência em src/lib/referenceVideos.ts).
// Taxonomia muscular PROVISÓRIA: o documento deixa a taxonomia e a ponderação para validação.
export interface OfficialExercise { name: string; equipment: string; primary: string[]; secondary: string[] }
export const OFFICIAL_EXERCISES: OfficialExercise[] = [
  { name: "Agachamento livre", equipment: "Barra", primary: ["Quadríceps"], secondary: ["Glúteo máximo", "Adutores", "Eretores da espinha"] },
  { name: "Leg press 45°", equipment: "Máquina", primary: ["Quadríceps"], secondary: ["Glúteo máximo", "Adutores"] },
  { name: "Cadeira extensora", equipment: "Máquina", primary: ["Quadríceps"], secondary: [] },
  { name: "Mesa flexora", equipment: "Máquina", primary: ["Posterior de coxa"], secondary: [] },
  { name: "Stiff", equipment: "Barra", primary: ["Posterior de coxa", "Glúteo máximo"], secondary: ["Eretores da espinha"] },
  { name: "Panturrilha em pé", equipment: "Máquina", primary: ["Panturrilha"], secondary: [] },
  { name: "Supino reto", equipment: "Barra", primary: ["Peitoral"], secondary: ["Deltoide anterior", "Tríceps"] },
  { name: "Supino inclinado com halteres", equipment: "Halteres", primary: ["Peitoral"], secondary: ["Deltoide anterior", "Tríceps"] },
  { name: "Crucifixo", equipment: "Halteres", primary: ["Peitoral"], secondary: ["Deltoide anterior"] },
  { name: "Remada curvada", equipment: "Barra", primary: ["Dorsais"], secondary: ["Bíceps", "Deltoide posterior", "Eretores da espinha"] },
  { name: "Puxada frontal", equipment: "Polia", primary: ["Dorsais"], secondary: ["Bíceps", "Deltoide posterior"] },
  { name: "Desenvolvimento com halteres", equipment: "Halteres", primary: ["Deltoide anterior", "Deltoide lateral"], secondary: ["Tríceps"] },
  { name: "Elevação lateral", equipment: "Halteres", primary: ["Deltoide lateral"], secondary: [] },
  { name: "Rosca direta", equipment: "Barra", primary: ["Bíceps"], secondary: ["Antebraço"] },
  { name: "Tríceps na polia", equipment: "Polia", primary: ["Tríceps"], secondary: [] },
  { name: "Abdominal na máquina", equipment: "Máquina", primary: ["Abdômen"], secondary: [] },
  // Ampliação (lista "Vídeos dos Exercícios" de Leandro Twin): nomes e músculos PROVISÓRIOS, a validar. As variações da lista (pegada, aparelho) viram um exercício por movimento.
  { name: "Supino declinado", equipment: "Barra", primary: ["Peitoral"], secondary: ["Deltoide anterior", "Tríceps"] },
  { name: "Crucifixo inclinado", equipment: "Halteres", primary: ["Peitoral"], secondary: ["Deltoide anterior"] },
  { name: "Crucifixo declinado", equipment: "Halteres", primary: ["Peitoral"], secondary: ["Deltoide anterior"] },
  { name: "Cross-over", equipment: "Polia", primary: ["Peitoral"], secondary: ["Deltoide anterior"] },
  { name: "Flexão de braço", equipment: "Peso corporal", primary: ["Peitoral"], secondary: ["Deltoide anterior", "Tríceps"] },
  { name: "Peck deck", equipment: "Máquina", primary: ["Peitoral"], secondary: ["Deltoide anterior"] },
  { name: "Pull-over", equipment: "Halteres", primary: ["Peitoral"], secondary: ["Dorsais", "Tríceps"] },
  { name: "Barra fixa", equipment: "Peso corporal", primary: ["Dorsais"], secondary: ["Bíceps", "Deltoide posterior"] },
  { name: "Levantamento terra", equipment: "Barra", primary: ["Glúteo máximo", "Eretores da espinha"], secondary: ["Posterior de coxa", "Quadríceps", "Trapézio", "Dorsais"] },
  { name: "Remada curvada com halteres", equipment: "Halteres", primary: ["Dorsais"], secondary: ["Bíceps", "Deltoide posterior"] },
  { name: "Remada na máquina", equipment: "Máquina", primary: ["Dorsais"], secondary: ["Bíceps", "Deltoide posterior"] },
  { name: "Remada no cross", equipment: "Polia", primary: ["Dorsais"], secondary: ["Bíceps", "Deltoide posterior"] },
  { name: "Remada unilateral com halter", equipment: "Halteres", primary: ["Dorsais"], secondary: ["Bíceps", "Deltoide posterior"] },
  { name: "Pull-down", equipment: "Polia", primary: ["Dorsais"], secondary: [] },
  { name: "Elevação lateral no cross", equipment: "Polia", primary: ["Deltoide lateral"], secondary: [] },
  { name: "Elevação frontal", equipment: "Halteres", primary: ["Deltoide anterior"], secondary: [] },
  { name: "Elevação frontal com barra", equipment: "Barra", primary: ["Deltoide anterior"], secondary: [] },
  { name: "Elevação frontal no cross", equipment: "Polia", primary: ["Deltoide anterior"], secondary: [] },
  { name: "Crucifixo inverso", equipment: "Halteres", primary: ["Deltoide posterior"], secondary: ["Trapézio"] },
  { name: "Desenvolvimento militar", equipment: "Barra", primary: ["Deltoide anterior", "Deltoide lateral"], secondary: ["Tríceps"] },
  { name: "Manguito rotador (rotação externa)", equipment: "Halteres", primary: ["Manguito rotador"], secondary: ["Deltoide posterior"] },
  { name: "Manguito rotador (rotação interna)", equipment: "Halteres", primary: ["Manguito rotador"], secondary: ["Deltoide anterior"] },
  { name: "Encolhimento", equipment: "Halteres", primary: ["Trapézio"], secondary: [] },
  { name: "Remada alta", equipment: "Barra", primary: ["Trapézio", "Deltoide lateral"], secondary: ["Bíceps"] },
  { name: "Paralelas", equipment: "Peso corporal", primary: ["Tríceps"], secondary: ["Peitoral", "Deltoide anterior"] },
  { name: "Mergulho", equipment: "Banco", primary: ["Tríceps"], secondary: ["Peitoral", "Deltoide anterior"] },
  { name: "Supino fechado", equipment: "Barra", primary: ["Tríceps"], secondary: ["Peitoral", "Deltoide anterior"] },
  { name: "Tríceps testa com barra", equipment: "Barra", primary: ["Tríceps"], secondary: [] },
  { name: "Tríceps testa com halteres", equipment: "Halteres", primary: ["Tríceps"], secondary: [] },
  { name: "Tríceps unilateral na polia", equipment: "Polia", primary: ["Tríceps"], secondary: [] },
  { name: "Tríceps francês", equipment: "Halteres", primary: ["Tríceps"], secondary: [] },
  { name: "Tríceps coice", equipment: "Halteres", primary: ["Tríceps"], secondary: [] },
  { name: "Flexão de braço fechada", equipment: "Peso corporal", primary: ["Tríceps"], secondary: ["Peitoral", "Deltoide anterior"] },
  { name: "Rosca martelo", equipment: "Halteres", primary: ["Bíceps"], secondary: ["Antebraço"] },
  { name: "Rosca alternada", equipment: "Halteres", primary: ["Bíceps"], secondary: ["Antebraço"] },
  { name: "Rosca scott", equipment: "Barra", primary: ["Bíceps"], secondary: ["Antebraço"] },
  { name: "Rosca concentrada", equipment: "Halteres", primary: ["Bíceps"], secondary: ["Antebraço"] },
  { name: "Flexão de punho", equipment: "Barra", primary: ["Antebraço"], secondary: [] },
  { name: "Extensão de punho", equipment: "Barra", primary: ["Antebraço"], secondary: [] },
  { name: "Rosca inversa", equipment: "Barra", primary: ["Antebraço"], secondary: ["Bíceps"] },
  { name: "Hand grip", equipment: "Hand grip", primary: ["Antebraço"], secondary: [] },
  { name: "Agachamento frontal", equipment: "Barra", primary: ["Quadríceps"], secondary: ["Glúteo máximo", "Eretores da espinha"] },
  { name: "Agachamento sumô", equipment: "Barra", primary: ["Quadríceps"], secondary: ["Glúteo máximo", "Adutores"] },
  { name: "Agachamento búlgaro", equipment: "Halteres", primary: ["Quadríceps"], secondary: ["Glúteo máximo", "Adutores"] },
  { name: "Passada", equipment: "Halteres", primary: ["Quadríceps"], secondary: ["Glúteo máximo", "Adutores"] },
  { name: "Afundo", equipment: "Halteres", primary: ["Quadríceps"], secondary: ["Glúteo máximo", "Adutores"] },
  { name: "Avanço", equipment: "Halteres", primary: ["Quadríceps"], secondary: ["Glúteo máximo", "Adutores"] },
  { name: "Cadeira flexora", equipment: "Máquina", primary: ["Posterior de coxa"], secondary: [] },
  { name: "Flexora vertical", equipment: "Máquina", primary: ["Posterior de coxa"], secondary: [] },
  { name: "Cadeira adutora", equipment: "Máquina", primary: ["Adutores"], secondary: [] },
  { name: "Glúteo em 4 apoios", equipment: "Peso corporal", primary: ["Glúteo máximo"], secondary: ["Posterior de coxa"] },
  { name: "Glúteo na máquina", equipment: "Máquina", primary: ["Glúteo máximo"], secondary: ["Posterior de coxa"] },
  { name: "Glúteo no cross", equipment: "Polia", primary: ["Glúteo máximo"], secondary: ["Posterior de coxa"] },
  { name: "Elevação pélvica", equipment: "Barra", primary: ["Glúteo máximo"], secondary: ["Posterior de coxa"] },
  { name: "Cadeira abdutora", equipment: "Máquina", primary: ["Glúteo médio"], secondary: ["Glúteo máximo"] },
  { name: "Panturrilha sentado", equipment: "Máquina", primary: ["Panturrilha"], secondary: [] },
  { name: "Panturrilha no leg press", equipment: "Máquina", primary: ["Panturrilha"], secondary: [] },
  { name: "Abdominal supra", equipment: "Peso corporal", primary: ["Abdômen"], secondary: [] },
  { name: "Abdominal infra", equipment: "Peso corporal", primary: ["Abdômen"], secondary: [] },
  { name: "Abdominal oblíquo", equipment: "Peso corporal", primary: ["Oblíquos"], secondary: ["Abdômen"] },
  { name: "Prancha", equipment: "Peso corporal", primary: ["Abdômen"], secondary: ["Eretores da espinha"] },
  { name: "Extensão lombar", equipment: "Peso corporal", primary: ["Eretores da espinha"], secondary: ["Glúteo máximo"] },
  { name: "Vácuo abdominal", equipment: "Peso corporal", primary: ["Abdômen"], secondary: [] },
  { name: "Flexão de pescoço", equipment: "Peso corporal", primary: ["Pescoço"], secondary: [] },
  { name: "Extensão de pescoço", equipment: "Peso corporal", primary: ["Pescoço"], secondary: [] },
];
