import type { NormalizedReservation } from "../reservations/types.js";

export type KeyOperationalStatus =
  | "disponivel"
  | "bloqueada_por_reserva"
  | "retirada"
  | "atrasada"
  | "em_manutencao"
  | "perdida"
  | "danificada";

export interface Room {
  readonly id: string;
  readonly roomCode?: string;
  readonly name: string;
  readonly campus?: string;
  readonly building?: string;
  readonly floor?: string;
  readonly scheduleUrl?: string;
  readonly schedulable?: boolean;
  readonly active?: boolean;
  readonly source?: string;
  readonly sourceUrl?: string;
  readonly firstSeenAt?: string;
  readonly lastSeenAt?: string;
  readonly externalRefs: readonly string[];
  readonly provisional?: boolean;
  readonly disabledAt?: string;
  readonly disabledBy?: string;
  readonly disabledReason?: string;
  readonly updatedAt?: string;
  readonly updatedBy?: string;
}

export interface PhysicalKey {
  readonly id: string;
  readonly code: string;
  readonly label: string;
  readonly baseStatus: KeyOperationalStatus;
  readonly provisional?: boolean;
  readonly disabledAt?: string;
  readonly disabledBy?: string;
  readonly disabledReason?: string;
  readonly updatedAt?: string;
  readonly updatedBy?: string;
}

export interface KeyRoomLink {
  readonly keyId: string;
  readonly roomId: string;
  readonly disabledAt?: string;
  readonly disabledBy?: string;
  readonly disabledReason?: string;
}

export interface KeyCatalog {
  readonly rooms: readonly Room[];
  readonly keys: readonly PhysicalKey[];
  readonly links: readonly KeyRoomLink[];
}

export interface BlockingReservation {
  readonly externalId: string;
  readonly roomName: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly status: NormalizedReservation["status"];
}

export interface ReservationAttention {
  readonly externalId: string;
  readonly roomName: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly status: "suspect_absent";
}

export interface KeyAvailability {
  readonly key: PhysicalKey;
  readonly rooms: readonly Room[];
  readonly status: KeyOperationalStatus;
  readonly blockingReservation?: BlockingReservation;
  readonly reservationAttention?: ReservationAttention;
}
