import { HttpError } from "../http/errors.js";
import type {
  NormalizedReservation,
  ReservationListQuery,
  ReservationProvider,
  ReservationSyncResult
} from "./types.js";

export class SuapApiReservationProvider implements ReservationProvider {
  readonly name = "suap-api";

  async list(
    _query: ReservationListQuery
  ): Promise<readonly NormalizedReservation[]> {
    throw new HttpError(
      501,
      "suap_api_not_implemented",
      "Provider SUAP API aguardando endpoint oficial autorizado."
    );
  }

  async sync(): Promise<ReservationSyncResult> {
    throw new HttpError(
      501,
      "suap_api_not_implemented",
      "Sincronizacao por API oficial do SUAP ainda nao implementada."
    );
  }
}
