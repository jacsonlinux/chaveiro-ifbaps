import type {
  KeyAvailability,
  KeyMovement,
  KeyStatus,
  Occupancy,
  AppView,
} from '../app-models';

export interface AppViewOption {
  readonly id: AppView;
  readonly label: string;
}

export interface PortariaOccupancyItem {
  readonly id: string;
  readonly occupancy: Occupancy;
  readonly availability?: KeyAvailability;
  readonly activeMovement?: KeyMovement;
  readonly completedMovement?: KeyMovement;
  readonly keyCode: string;
  readonly keyStatus: KeyStatus | 'sem_chave' | 'devolvida';
  readonly isBlocked: boolean;
  readonly action: 'withdrawal' | 'return' | 'none';
}

export interface PendingKeyActionConfirmation {
  readonly action: 'withdrawal' | 'return' | 'batch-withdrawal';
  readonly title: string;
  readonly message: string;
}

export interface ListResponse<T> {
  readonly count: number;
  readonly results: readonly T[];
}
