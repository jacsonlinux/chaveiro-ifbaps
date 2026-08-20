const ptBrDateTime = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
});

const ptBrDate = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' });

const ptBrTime = new Intl.DateTimeFormat('pt-BR', {
  hour: '2-digit',
  minute: '2-digit',
});

export function formatDateValue(value?: string): string {
  return value ? ptBrDateTime.format(new Date(value)) : '-';
}

export function formatMovementDateValue(value?: string): string {
  if (!value) return '-';
  const date = new Date(value);
  return `Em ${ptBrDate.format(date)}, às ${ptBrTime.format(date)}.`;
}
