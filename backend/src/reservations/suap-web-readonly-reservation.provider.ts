import type { AppConfig } from "../config/env.js";
import { HttpError } from "../http/errors.js";
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

  constructor(private readonly config: AppConfig) {
    this.automationClient = new SuapWebAutomationClient(config);
  }

  async list(
    query: ReservationListQuery
  ): Promise<readonly NormalizedReservation[]> {
    this.assertReady();
    if (this.cache.length === 0) {
      await this.sync();
    }

    return this.cache.filter((reservation) => matchesQuery(reservation, query));
  }

  async sync(): Promise<ReservationSyncResult> {
    this.assertReady();
    const previousById = new Map(
      this.cache.map((reservation) => [
        reservation.externalId,
        reservation.fingerprint
      ])
    );
    const scrapeResult = await this.automationClient.scrapeReservations();
    const currentIds = new Set(
      scrapeResult.reservations.map((reservation) => reservation.externalId)
    );

    let created = 0;
    let updated = 0;
    let unchanged = 0;
    let canceled = 0;
    let conflicted = 0;

    for (const reservation of scrapeResult.reservations) {
      const previousFingerprint = previousById.get(reservation.externalId);

      if (!previousFingerprint) {
        created += 1;
      } else if (previousFingerprint !== reservation.fingerprint) {
        updated += 1;
      } else {
        unchanged += 1;
      }

      if (reservation.status === "canceled") {
        canceled += 1;
      }

      if (reservation.status === "conflicted") {
        conflicted += 1;
      }
    }

    const absent = this.cache.filter(
      (reservation) => !currentIds.has(reservation.externalId)
    ).length;
    this.cache = scrapeResult.reservations;

    return {
      provider: this.name,
      syncedAt: new Date().toISOString(),
      metadata: {
        source: "suap-web-report",
        pagesVisited: scrapeResult.pagesVisited,
        reservationWindowStartsToday: true
      },
      created,
      updated,
      unchanged,
      absent,
      canceled,
      conflicted,
      failed: 0,
      reservations: this.cache
    };
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
