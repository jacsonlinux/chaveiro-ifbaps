export interface SuapReservationReportFilters {
  readonly dataInicio?: string;
  readonly dataFim?: string;
  readonly horaInicio?: string;
  readonly horaFim?: string;
  readonly campus?: string;
  readonly situacao?: string;
}

export function parseSuapReservationReportFilters(
  value: string
): SuapReservationReportFilters | undefined {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    return undefined;
  }

  if (url.pathname !== "/comum/sala/reservasala_relat/") {
    return undefined;
  }

  return {
    dataInicio: getQueryValue(url, "data_inicio"),
    dataFim: getQueryValue(url, "data_fim"),
    horaInicio: getQueryValue(url, "hora_inicio"),
    horaFim: getQueryValue(url, "hora_fim"),
    campus: getQueryValue(url, "campus"),
    situacao: getQueryValue(url, "situacao")
  };
}

function getQueryValue(url: URL, name: string): string | undefined {
  return url.searchParams.get(name) ?? undefined;
}
