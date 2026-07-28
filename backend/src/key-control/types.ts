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
  readonly name: string;
  readonly campus?: string;
  readonly externalRefs: readonly string[];
  readonly provisional?: boolean;
  readonly disabledAt?: string;
  readonly disabledBy?: string;
  readonly disabledReason?: string;
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

export interface KeyAvailability {
  readonly key: PhysicalKey;
  readonly rooms: readonly Room[];
  readonly status: KeyOperationalStatus;
  readonly blockingReservation?: BlockingReservation;
}
