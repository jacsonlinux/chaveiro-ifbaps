import type { AppConfig } from "../config/env.js";
import type { ReservationProvider, ReservationSyncResult } from "./types.js";
import type { ReservationStore } from "./reservation-store.js";

export interface ReservationSyncSchedulerStatus {
  readonly enabled: boolean;
  readonly running: boolean;
  readonly intervalMs: number;
  readonly backoffMinMs: number;
  readonly backoffMaxMs: number;
  readonly consecutiveFailures: number;
  readonly lastStartedAt?: string;
  readonly lastFinishedAt?: string;
  readonly lastSuccessAt?: string;
  readonly lastFailureAt?: string;
  readonly lastErrorCode?: string;
  readonly lastErrorMessage?: string;
  readonly lastResult?: Omit<ReservationSyncResult, "reservations"> & {
    readonly reservationCount: number;
  };
  readonly nextRunAt?: string;
}

export class ReservationSyncScheduler {
  private timer: NodeJS.Timeout | undefined;
  private running = false;
  private stopped = true;
  private consecutiveFailures = 0;
  private lastStartedAt: string | undefined;
  private lastFinishedAt: string | undefined;
  private lastSuccessAt: string | undefined;
  private lastFailureAt: string | undefined;
  private lastErrorCode: string | undefined;
  private lastErrorMessage: string | undefined;
  private lastResult: ReservationSyncSchedulerStatus["lastResult"];
  private nextRunAt: string | undefined;

  constructor(
    private readonly config: AppConfig,
    private readonly reservationProvider: ReservationProvider,
    private readonly reservationStore: ReservationStore
  ) {}

  start(): void {
    if (!this.config.reservationSyncSchedule.enabled || !this.stopped) {
      return;
    }

    this.stopped = false;
    this.schedule(0);
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    this.nextRunAt = undefined;
  }

  status(): ReservationSyncSchedulerStatus {
    return {
      enabled: this.config.reservationSyncSchedule.enabled,
      running: this.running,
      intervalMs: this.config.reservationSyncSchedule.intervalMs,
      backoffMinMs: this.config.reservationSyncSchedule.backoffMinMs,
      backoffMaxMs: this.config.reservationSyncSchedule.backoffMaxMs,
      consecutiveFailures: this.consecutiveFailures,
      lastStartedAt: this.lastStartedAt,
      lastFinishedAt: this.lastFinishedAt,
      lastSuccessAt: this.lastSuccessAt,
      lastFailureAt: this.lastFailureAt,
      lastErrorCode: this.lastErrorCode,
      lastErrorMessage: this.lastErrorMessage,
      lastResult: this.lastResult,
      nextRunAt: this.nextRunAt
    };
  }

  async runOnce(): Promise<void> {
    if (this.running) {
      return;
    }

    this.running = true;
    this.lastStartedAt = new Date().toISOString();
    await this.persistStatus();

    try {
      const result = await this.reservationProvider.sync();
      this.lastResult = {
        provider: result.provider,
        syncedAt: result.syncedAt,
        metadata: result.metadata,
        created: result.created,
        updated: result.updated,
        unchanged: result.unchanged,
        absent: result.absent,
        canceled: result.canceled,
        conflicted: result.conflicted,
        failed: result.failed,
        reservationCount: result.reservations.length
      };
      await this.pruneOldSyncEvents();
      this.consecutiveFailures = 0;
      this.lastSuccessAt = new Date().toISOString();
      this.lastErrorCode = undefined;
      this.lastErrorMessage = undefined;
      await this.persistStatus();
    } catch (error) {
      this.consecutiveFailures += 1;
      this.lastFailureAt = new Date().toISOString();
      this.lastErrorCode = getErrorCode(error);
      this.lastErrorMessage = getSafeErrorMessage(error);
      await this.persistStatus();
    } finally {
      this.running = false;
      this.lastFinishedAt = new Date().toISOString();
      await this.persistStatus();
    }
  }

  private schedule(delayMs: number): void {
    if (this.stopped) {
      return;
    }

    this.nextRunAt = new Date(Date.now() + delayMs).toISOString();
    this.timer = setTimeout(async () => {
      await this.runOnce();
      this.schedule(this.getNextDelayMs());
    }, delayMs);
    this.timer.unref();
  }

  private getNextDelayMs(): number {
    if (this.consecutiveFailures === 0) {
      return this.config.reservationSyncSchedule.intervalMs;
    }

    const multiplier = 2 ** Math.max(0, this.consecutiveFailures - 1);
    return Math.min(
      this.config.reservationSyncSchedule.backoffMaxMs,
      this.config.reservationSyncSchedule.backoffMinMs * multiplier
    );
  }

  private async pruneOldSyncEvents(): Promise<void> {
    const retentionDays = this.config.reservationStore.syncEventRetentionDays;
    if (retentionDays <= 0 || !this.reservationStore.pruneSyncEvents) {
      return;
    }

    const cutoff = new Date(
      Date.now() - retentionDays * 24 * 60 * 60 * 1000
    ).toISOString();
    await this.reservationStore.pruneSyncEvents(cutoff);
  }

  private async persistStatus(): Promise<void> {
    if (!this.reservationStore.setSyncStatus) {
      return;
    }

    try {
      await this.reservationStore.setSyncStatus(this.status() as unknown as Record<string, unknown>);
    } catch {
      // Sync diagnostics must never make the reservation sync fail.
    }
  }
}

function getErrorCode(error: unknown): string {
  if (typeof error === "object" && error && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string") {
      return code;
    }
  }

  return "sync_failed";
}

function getSafeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Falha na sincronizacao de reservas.";
}
