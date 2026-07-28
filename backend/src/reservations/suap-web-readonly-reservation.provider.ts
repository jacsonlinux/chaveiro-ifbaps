import type { AppConfig } from "../config/env.js";
import { HttpError } from "../http/errors.js";
import type { ReservationStore } from "./reservation-store.js";
import { SuapWebAutomationClient } from "./suap-web-automation.client.js";
import type {
  NormalizedReservation,
  ReservationListQuery,
  ReservationProvider,
  ReservationSyncResult
} from "./types.js";

export class SuapWebReadOnlyReservationProvider
  implements ReservationProvider
{
  readonly name = "suap-web-readonly";
  private readonly automationClient: SuapWebAutomationClient;
  private cache: readonly NormalizedReservation[] = [];
  private cacheLoadedAt = 0;

  constructor(
    private readonly config: AppConfig,
    private readonly reservationStore: ReservationStore
  ) {
    this.automationClient = new SuapWebAutomationClient(config);
  }

  async list(
    query: ReservationListQuery
  ): Promise<readonly NormalizedReservation[]> {
    this.assertReady();
    if (this.isCacheFresh()) {
      return this.cache.filter((reservation) => matchesQuery(reservation, query));
    }

    this.cache = await this.reservationStore.list({});
    this.cacheLoadedAt = Date.now();

    if (this.cache.length === 0) {
      await this.sync();
    }

    return this.cache.filter((reservation) => matchesQuery(reservation, query));
  }

  async sync(): Promise<ReservationSyncResult> {
    this.assertReady();
    const scrapeResult = await this.automationClient.scrapeReservations();
    const result = await this.reservationStore.sync({
      provider: this.name,
      syncedAt: new Date().toISOString(),
      metadata: {
        source: "suap-web-report",
        pagesVisited: scrapeResult.pagesVisited,
        reservationWindowStartsToday: true
      },
      absenceConfirmationSyncs:
        this.config.reservationStore.absenceConfirmationSyncs,
      reservations: scrapeResult.reservations
    });

    this.cache = result.reservations;
    this.cacheLoadedAt = Date.now();

    return result;
  }

  private assertReady(): void {
    if (!this.config.suap.webReadonlyEnabled) {
      throw new HttpError(
        503,
        "suap_web_readonly_disabled",
        "Leitura web read-only do SUAP esta desabilitada por configuracao."
      );
    }

    if (!this.config.suap.webLoginConfigured) {
      throw new HttpError(
        503,
        "suap_web_login_not_configured",
        "Configuracao de login web do SUAP esta incompleta no ambiente externo."
      );
    }

    if (!this.config.suap.reservationTargetsConfigured) {
      throw new HttpError(
        503,
        "suap_reservation_targets_not_configured",
        "Nenhuma URL de reservas do SUAP foi configurada no ambiente externo."
      );
    }
  }

  private isCacheFresh(): boolean {
    return (
      this.cache.length > 0 &&
      Date.now() - this.cacheLoadedAt <= this.config.reservationStore.cacheTtlMs
    );
  }
}

function matchesQuery(
  reservation: NormalizedReservation,
  query: ReservationListQuery
): boolean {
  if (query.status && reservation.status !== query.status) {
    return false;
  }

  if (
    query.roomName &&
    !reservation.roomName.toLowerCase().includes(query.roomName.toLowerCase())
  ) {
    return false;
  }

  if (query.from && reservation.endsAt < query.from) {
    return false;
  }

  if (query.to && reservation.startsAt > query.to) {
    return false;
  }

  return true;
}
