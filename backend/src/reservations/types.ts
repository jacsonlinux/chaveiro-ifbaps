export type ReservationSource = "local" | "suap-api" | "suap-web";

export type ReservationStatus =
  | "active"
  | "changed"
  | "absent"
  | "canceled"
  | "conflicted";

export interface NormalizedReservation {
  readonly externalId: string;
  readonly source: ReservationSource;
  readonly roomName: string;
  readonly roomExternalId?: string;
  readonly campus?: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly responsibleName?: string;
  readonly responsibleIdentifier?: string;
  readonly purpose?: string;
  readonly status: ReservationStatus;
  readonly fingerprint: string;
  readonly firstSeenAt: string;
  readonly lastSeenAt: string;
  readonly lastSyncedAt: string;
  readonly deletedOrCanceledAt?: string;
  readonly rawVersion?: string;
}

export interface ReservationListQuery {
  readonly from?: string;
  readonly to?: string;
  readonly roomName?: string;
  readonly status?: ReservationStatus;
}

export interface ReservationSyncResult {
  readonly provider: string;
  readonly syncedAt: string;
  readonly created: number;
  readonly updated: number;
  readonly unchanged: number;
  readonly absent: number;
  readonly canceled: number;
  readonly conflicted: number;
  readonly failed: number;
  readonly reservations: readonly NormalizedReservation[];
}

export interface ReservationProvider {
  readonly name: string;
  list(query: ReservationListQuery): Promise<readonly NormalizedReservation[]>;
  sync(): Promise<ReservationSyncResult>;
}
