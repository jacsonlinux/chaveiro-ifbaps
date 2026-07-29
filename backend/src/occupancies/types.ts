import type {
  ReservationSource,
  ReservationStatus
} from "../reservations/types.js";

export type OccupancySource = ReservationSource;

export type OccupancySourceKind =
  | "aula_regular"
  | "reserva_deferida"
  | "solicitacao_reserva"
  | "aula_extra"
  | "contraturno"
  | "evento"
  | "auditorio_ginasio"
  | "outro";

export type OccupancyStatus = ReservationStatus;

export interface NormalizedOccupancy {
  readonly externalId: string;
  readonly source: OccupancySource;
  readonly sourceKind: OccupancySourceKind;
  readonly sourceUrl?: string;
  readonly requestExternalId?: string;
  readonly roomName: string;
  readonly roomExternalId?: string;
  readonly roomCode?: string;
  readonly campus?: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly responsibleName?: string;
  readonly responsibleIdentifier?: string;
  readonly purpose?: string;
  readonly status: OccupancyStatus;
  readonly blocksKey: boolean;
  readonly fingerprint: string;
  readonly firstSeenAt: string;
  readonly lastSeenAt: string;
  readonly lastSyncedAt: string;
  readonly missingFirstSeenAt?: string;
  readonly missingLastSeenAt?: string;
  readonly missingSyncCount?: number;
  readonly missingConfirmedAt?: string;
  readonly deletedOrCanceledAt?: string;
  readonly rawVersion?: string;
}
