export type KeyStatus =
  | 'disponivel'
  | 'bloqueada_por_reserva'
  | 'retirada'
  | 'em_manutencao'
  | 'perdida'
  | 'danificada';

export type UserRole = 'usuario' | 'portaria' | 'admin';
export type AppView =
  | 'operacao'
  | 'identificacao'
  | 'consulta-chaves'
  | 'reservas'
  | 'movimentacoes'
  | 'ocorrencias'
  | 'relatorios'
  | 'administracao';

export type ReservationStatus =
  | 'active'
  | 'changed'
  | 'suspect_absent'
  | 'absent'
  | 'canceled'
  | 'conflicted';

export interface SessionResponse {
  readonly authenticated: boolean;
  readonly user: {
    readonly userId?: string;
    readonly displayName?: string;
    readonly email?: string;
    readonly campus?: string;
  } | null;
  readonly roles: readonly UserRole[];
}

export interface Room {
  readonly id: string;
  readonly name: string;
  readonly campus?: string;
  readonly externalRefs?: readonly string[];
  readonly active?: boolean;
  readonly schedulable?: boolean;
  readonly scheduleUrl?: string;
  readonly provisional?: boolean;
  readonly disabledAt?: string;
  readonly disabledBy?: string;
  readonly disabledReason?: string;
}

export interface PhysicalKey {
  readonly id: string;
  readonly code: string;
  readonly label: string;
  readonly baseStatus: KeyStatus;
  readonly provisional?: boolean;
  readonly disabledAt?: string;
  readonly disabledBy?: string;
  readonly disabledReason?: string;
}

export interface KeyRoomLink {
  readonly keyId: string;
  readonly roomId: string;
  readonly disabledAt?: string;
  readonly disabledBy?: string;
  readonly disabledReason?: string;
}

export interface Reservation {
  readonly externalId: string;
  readonly source: 'local' | 'suap-api' | 'suap-web';
  readonly roomName: string;
  readonly roomExternalId?: string;
  readonly campus?: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly responsibleName?: string;
  readonly responsibleIdentifier?: string;
  readonly purpose?: string;
  readonly status: ReservationStatus;
  readonly lastSyncedAt: string;
}

export interface Occupancy {
  readonly externalId: string;
  readonly source: 'local' | 'suap-api' | 'suap-web';
  readonly sourceKind: 'aula_regular' | 'reserva_deferida' | 'solicitacao_reserva' | 'aula_extra' | 'contraturno' | 'evento' | 'auditorio_ginasio' | 'outro';
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
  readonly status: ReservationStatus;
  readonly blocksKey: boolean;
  readonly lastSyncedAt: string;
  readonly missingFirstSeenAt?: string;
  readonly missingSyncCount?: number;
  readonly deletedOrCanceledAt?: string;
}

export interface ReservationSyncStatus {
  readonly scheduler: {
    readonly enabled: boolean;
    readonly running: boolean;
    readonly lastStartedAt?: string;
    readonly lastFinishedAt?: string;
    readonly nextRunAt?: string;
    readonly consecutiveFailures?: number;
    readonly lastErrorCode?: string;
    readonly lastErrorMessage?: string;
    readonly lastResult?: {
      readonly provider: string;
      readonly syncedAt: string;
      readonly created: number;
      readonly updated: number;
      readonly unchanged: number;
      readonly absent: number;
      readonly canceled: number;
      readonly conflicted: number;
      readonly failed: number;
      readonly reservationCount?: number;
    };
  };
}

export interface ReservationSyncEvent {
  readonly provider: string;
  readonly syncedAt: string;
  readonly created: number;
  readonly updated: number;
  readonly unchanged: number;
  readonly absent: number;
  readonly canceled: number;
  readonly conflicted: number;
  readonly failed: number;
  readonly reservationCount?: number;
  readonly writeCount?: number;
}

export interface KeyAvailability {
  readonly key: PhysicalKey;
  readonly rooms: readonly Room[];
  readonly status: KeyStatus;
  readonly roomRestricted?: boolean;
  readonly blockingOccupancy?: {
    readonly externalId: string;
    readonly roomName: string;
    readonly startsAt: string;
    readonly endsAt: string;
    readonly status?: ReservationStatus;
    readonly responsibleName?: string;
    readonly responsibleIdentifier?: string;
  };
  readonly upcomingOccupancy?: {
    readonly externalId: string;
    readonly roomName: string;
    readonly startsAt: string;
    readonly endsAt: string;
    readonly status?: ReservationStatus;
    readonly responsibleName?: string;
    readonly responsibleIdentifier?: string;
  };
  readonly activeMovement?: {
    readonly responsibleName: string;
    readonly responsibleIdentifier?: string;
    readonly checkedOutByName: string;
    readonly checkedOutAt: string;
    readonly reservationResponsibleName?: string;
    readonly reservationResponsibleIdentifier?: string;
  };
  readonly occupancyAttention?: {
    readonly externalId: string;
    readonly roomName: string;
    readonly startsAt: string;
    readonly endsAt: string;
    readonly status: 'suspect_absent';
  };
}

export interface KeyMovement {
  readonly id: string;
  readonly keyId: string;
  readonly roomId: string;
  readonly status: 'retirada' | 'devolvida';
  readonly responsibleName: string;
  readonly responsibleIdentifier?: string;
  readonly checkedOutByName: string;
  readonly checkedOutByIdentifier?: string;
  readonly checkedOutAt: string;
  readonly returnedByName?: string;
  readonly returnedByIdentifier?: string;
  readonly returnedAt?: string;
  readonly returnNotes?: string;
  readonly reservationExternalId?: string;
  readonly reservationResponsibleName?: string;
  readonly reservationResponsibleIdentifier?: string;
}

export interface KeyOccurrence {
  readonly id: string;
  readonly keyId: string;
  readonly roomId?: string;
  readonly type: 'ocorrencia';
  readonly previousStatus: KeyStatus;
  readonly targetStatus?: KeyStatus;
  readonly actorName: string;
  readonly actorIdentifier?: string;
  readonly occurredAt: string;
  readonly notes: string;
}

export interface OperationalReport {
  readonly generatedAt: string;
  readonly period: { readonly from?: string; readonly to?: string };
  readonly movements: {
    readonly withdrawals: number;
    readonly returns: number;
    readonly open: number;
    readonly records: readonly KeyMovement[];
  };
  readonly occurrences: {
    readonly total: number;
    readonly operational: number;
    readonly adminAdjustments: number;
    readonly records: readonly KeyOccurrence[];
  };
}

export interface AppUser {
  readonly id: string;
  readonly displayName?: string;
  readonly email?: string;
  readonly campus?: string;
  readonly roles: readonly UserRole[];
  readonly personId?: string;
  readonly linkedAt?: string;
}

export interface Person {
  readonly id: string;
  readonly name: string;
  readonly email?: string | null;
  readonly matricula: string;
  readonly cargo: 'professor' | 'tecnico' | 'aluno';
  readonly campus?: string;
  readonly active?: boolean;
  readonly pinGeneratedAt?: string | null;
}
