export interface SuapReservationReportFilters {
  readonly dataInicio?: string;
  readonly dataFim?: string;
  readonly horaInicio?: string;
  readonly horaFim?: string;
  readonly campus?: string;
  readonly situacao?: string;
}

export interface BuildSuapReservationReportUrlInput {
  readonly baseUrl: string;
  readonly now: Date;
  readonly windowDays: number;
  readonly horaInicio: string;
  readonly horaFim: string;
  readonly campus?: string;
  readonly situacao: string;
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

export function buildFutureSuapReservationReportUrl(
  input: BuildSuapReservationReportUrlInput
): string {
  const url = new URL(input.baseUrl);
  const today = toSaoPauloDate(input.now);
  const endDate = addDays(today, input.windowDays);

  url.search = "";
  url.searchParams.set("data_inicio", formatBrazilianDate(today));
  url.searchParams.set("data_fim", formatBrazilianDate(endDate));
  url.searchParams.set("hora_inicio", input.horaInicio);
  url.searchParams.set("hora_fim", input.horaFim);

  if (input.campus) {
    url.searchParams.set("campus", input.campus);
  }

  url.searchParams.set("situacao", input.situacao);
  url.searchParams.set("relatorioreservassalas_form", "Aguarde...");

  return url.toString();
}

function getQueryValue(url: URL, name: string): string | undefined {
  return url.searchParams.get(name) ?? undefined;
}

interface DateParts {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

function toSaoPauloDate(date: Date): DateParts {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);

  return {
    year: Number(parts.find((part) => part.type === "year")?.value),
    month: Number(parts.find((part) => part.type === "month")?.value),
    day: Number(parts.find((part) => part.type === "day")?.value)
  };
}

function addDays(date: DateParts, days: number): DateParts {
  const next = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return {
    year: next.getUTCFullYear(),
    month: next.getUTCMonth() + 1,
    day: next.getUTCDate()
  };
}

function formatBrazilianDate(date: DateParts): string {
  return [
    String(date.day).padStart(2, "0"),
    String(date.month).padStart(2, "0"),
    String(date.year)
  ].join("/");
}
