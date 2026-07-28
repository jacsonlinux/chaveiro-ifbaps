import type { AppConfig } from "../config/env.js";
import { HttpError } from "../http/errors.js";
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

  constructor(private readonly config: AppConfig) {}

  async list(
    _query: ReservationListQuery
  ): Promise<readonly NormalizedReservation[]> {
    this.assertReady();
    throw new HttpError(
      501,
      "suap_web_readonly_not_implemented",
      "Provider SUAP web read-only ainda nao implementado."
    );
  }

  async sync(): Promise<ReservationSyncResult> {
    this.assertReady();
    throw new HttpError(
      501,
      "suap_web_readonly_not_implemented",
      "Sincronizacao SUAP web read-only ainda nao implementada."
    );
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
