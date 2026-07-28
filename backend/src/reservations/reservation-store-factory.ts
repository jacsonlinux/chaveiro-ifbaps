import type { AppConfig } from "../config/env.js";
import { FirestoreReservationStore } from "./firestore-reservation.store.js";
import { MemoryReservationStore } from "./memory-reservation.store.js";
import type { ReservationStore } from "./reservation-store.js";

export function createReservationStore(config: AppConfig): ReservationStore {
  if (config.reservationStore.name === "firestore") {
    return new FirestoreReservationStore(config);
  }

  return new MemoryReservationStore();
}
