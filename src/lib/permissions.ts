// Autonomia configurável por aluno (opção C, CONFIRMADA). A lista de 9 permissões e os padrões
// vêm do protótipo enviado pelo Henry; os padrões são PROPOSTA (5 de 9 habilitadas).
// Independentemente das permissões, o aluno sempre pode registrar o que realizou, e a prescrição
// original fica preservada para comparação.
export const PERMISSIONS = [
  { key: "reorder", label: "Alterar a ordem dos exercícios", help: "Adaptar a sessão à disponibilidade dos equipamentos.", default: true },
  { key: "substituteAuthorized", label: "Substituir exercícios autorizados", help: "Escolher alternativas previamente definidas pelo personal.", default: true },
  { key: "substituteFree", label: "Substituir livremente exercícios", help: "Selecionar outros exercícios da biblioteca.", default: false },
  { key: "addExercises", label: "Adicionar exercícios", help: "Incluir exercícios extras na sessão.", default: false },
  { key: "editSets", label: "Alterar séries e repetições prescritas", help: "Modificar as metas durante o treino (no app: registrar séries extras).", default: false },
  { key: "changeDays", label: "Alterar dias de treinamento", help: "Reorganizar o calendário semanal. Ainda sem efeito: depende da agenda (tópico 7, pendente).", default: true },
  { key: "adjustRest", label: "Ajustar tempo de descanso", help: "Modificar o intervalo durante a sessão.", default: true },
  { key: "viewVolume", label: "Visualizar volume muscular semanal", help: "Acessar indicadores técnicos da prescrição.", default: false },
  { key: "viewHistory", label: "Consultar treinos anteriores", help: "Acessar programas e registros históricos.", default: true },
] as const;

export type PermKey = (typeof PERMISSIONS)[number]["key"];
export type Permissions = Record<PermKey, boolean>;
export const PERMISSION_KEYS = PERMISSIONS.map((p) => p.key) as PermKey[];

export const DEFAULT_PERMISSIONS = Object.fromEntries(PERMISSIONS.map((p) => [p.key, p.default])) as Permissions;

export function mergePermissions(stored?: Partial<Permissions> | null): Permissions {
  return { ...DEFAULT_PERMISSIONS, ...(stored ?? {}) };
}
