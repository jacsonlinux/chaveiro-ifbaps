import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatToolbarModule } from '@angular/material/toolbar';
import { FirebaseAuthService } from './firebase-auth.service';
import { FirestoreDataService } from './firestore-data.service';

export type KeyStatus =
  | 'disponivel'
  | 'bloqueada_por_reserva'
  | 'retirada'
  | 'atrasada'
  | 'em_manutencao'
  | 'perdida'
  | 'danificada';
export type UserRole = 'usuario' | 'portaria' | 'admin';
export type AppView =
  | 'operacao'
  | 'reservas'
  | 'movimentacoes'
  | 'ocorrencias'
  | 'relatorios'
  | 'administracao';
type PortariaMode = 'reservas' | 'avulsa';
export type ReservationStatus =
  | 'active'
  | 'changed'
  | 'suspect_absent'
  | 'absent'
  | 'canceled'
  | 'conflicted';

interface AppViewOption {
  readonly id: AppView;
  readonly label: string;
}

interface PortariaDayOption {
  readonly value: string;
  readonly label: string;
  readonly shortDate: string;
  readonly count: number;
}

interface PortariaReservationItem {
  readonly id: string;
  readonly reservation: Reservation;
  readonly availability?: KeyAvailability;
  readonly keyCode: string;
  readonly keyStatus: KeyStatus | 'sem_chave';
  readonly isBlocked: boolean;
  readonly action: 'withdrawal' | 'return' | 'none';
}

interface PendingKeyActionConfirmation {
  readonly action: 'withdrawal' | 'return';
  readonly title: string;
  readonly message: string;
}

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
  readonly blockingReservation?: {
    readonly externalId: string;
    readonly roomName: string;
    readonly startsAt: string;
    readonly endsAt: string;
    readonly status?: ReservationStatus;
    readonly responsibleName?: string;
    readonly responsibleIdentifier?: string;
  };
  readonly upcomingReservation?: {
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
    readonly expectedReturnAt?: string;
  };
  readonly reservationAttention?: {
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
  readonly status: 'retirada' | 'devolvida' | 'atrasada';
  readonly responsibleName: string;
  readonly responsibleIdentifier?: string;
  readonly checkedOutByName: string;
  readonly checkedOutByIdentifier?: string;
  readonly checkedOutAt: string;
  readonly expectedReturnAt?: string;
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
  readonly period: {
    readonly from?: string;
    readonly to?: string;
  };
  readonly movements: {
    readonly withdrawals: number;
    readonly returns: number;
    readonly open: number;
    readonly late: number;
  };
  readonly occurrences: {
    readonly total: number;
    readonly operational: number;
    readonly adminAdjustments: number;
  };
}

export interface AppUser {
  readonly id: string;
  readonly displayName?: string;
  readonly email?: string;
  readonly campus?: string;
  readonly roles: readonly UserRole[];
}

interface ListResponse<T> {
  readonly count: number;
  readonly results: readonly T[];
}

@Component({
  selector: 'app-root',
  imports: [
    FormsModule,
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatIconModule,
    MatToolbarModule,
  ],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnInit {
  private readonly firebaseAuth = inject(FirebaseAuthService);
  private readonly firestore = inject(FirestoreDataService);
  private toastTimer?: ReturnType<typeof setTimeout>;

  readonly session = signal<SessionResponse | null>(null);
  readonly availability = signal<readonly KeyAvailability[]>([]);
  readonly movements = signal<readonly KeyMovement[]>([]);
  readonly movementHistory = signal<readonly KeyMovement[]>([]);
  readonly occurrences = signal<readonly KeyOccurrence[]>([]);
  readonly occurrenceHistory = signal<readonly KeyOccurrence[]>([]);
  readonly operationalReport = signal<OperationalReport | null>(null);
  readonly users = signal<readonly AppUser[]>([]);
  readonly rooms = signal<readonly Room[]>([]);
  readonly keys = signal<readonly PhysicalKey[]>([]);
  readonly keyRoomLinks = signal<readonly KeyRoomLink[]>([]);
  readonly reservations = signal<readonly Reservation[]>([]);
  readonly reservationSyncStatus = signal<ReservationSyncStatus | null>(null);
  readonly reservationSyncEvents = signal<readonly ReservationSyncEvent[]>([]);
  readonly roleDrafts = signal<Record<string, readonly UserRole[]>>({});
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly saved = signal<string | null>(null);
  readonly toastMessage = signal<string | null>(null);
  readonly pendingConfirmation = signal<PendingKeyActionConfirmation | null>(null);
  readonly movementValidationAttempted = signal(false);
  readonly operationPending = signal(false);

  readonly search = signal('');
  readonly statusFilter = signal<KeyStatus | 'todas'>('todas');
  readonly avulsaSearch = signal('');
  readonly avulsaStatusFilter = signal<KeyStatus | 'todas'>('todas');
  readonly theme = signal<'light' | 'dark'>('light');
  readonly accent = signal<'blue' | 'teal' | 'amber'>('blue');
  readonly settingsOpen = signal(false);
  readonly portariaMode = signal<PortariaMode>('reservas');
  readonly portariaDate = signal(toDateInputValue(new Date()));
  readonly selectedReservationId = signal<string | null>(null);
  readonly detailMode = signal<'details' | 'withdrawal' | 'return'>('details');
  readonly reservationSearch = signal('');
  readonly reservationStatusFilter = signal<ReservationStatus | 'todas'>('todas');
  readonly userSearch = signal('');
  readonly userRoleFilter = signal<UserRole | 'todos'>('todos');
  readonly activeView = signal<AppView>('operacao');
  readonly selectedKeyId = signal<string | null>(null);
  readonly identificationOptions = ['Técnico', 'Professor', 'Aluno', 'Público externo'] as const;

  withdrawal = {
    keyId: '',
    roomId: '',
    responsibleName: '',
    responsibleIdentifier: '',
    actorName: '',
    actorIdentifier: '',
    expectedReturnAt: '',
    notes: '',
  };

  returnForm = {
    keyId: '',
    actorName: '',
    actorIdentifier: '',
    notes: '',
  };

  movementHistoryFilter = {
    keyId: '',
    roomId: '',
    status: 'todas' as 'todas' | 'retirada' | 'devolvida' | 'atrasada',
    dateField: 'checkedOutAt' as 'checkedOutAt' | 'returnedAt',
    from: '',
    to: '',
  };

  occurrence = {
    keyId: '',
    roomId: '',
    type: 'ocorrencia' as 'ocorrencia',
    actorName: '',
    actorIdentifier: '',
    notes: '',
  };

  occurrenceHistoryFilter = {
    keyId: '',
    roomId: '',
    type: 'todas' as 'todas' | 'ocorrencia',
    from: '',
    to: '',
  };

  reportFilter = {
    from: '',
    to: '',
  };

  readonly filteredAvailability = computed(() => {
    const query = normalize(this.search());
    const status = this.statusFilter();

    return this.availability().filter((item) => {
      const text = normalize(
        [this.keyDisplayCode(item), ...item.rooms.map((room) => room.name)]
          .filter(Boolean)
          .join(' '),
      );
      return (!query || text.includes(query)) && (status === 'todas' || item.status === status);
    });
  });

  readonly filteredReservations = computed(() => {
    const query = normalize(this.reservationSearch());
    const status = this.reservationStatusFilter();

    return this.reservations().filter((reservation) => {
      const text = normalize(
        [
          reservation.roomName,
          reservation.campus,
          reservation.purpose,
          this.reservationResponsibleLabel(reservation),
        ]
          .filter(Boolean)
          .join(' '),
      );
      return (!query || text.includes(query)) && (status === 'todas' || reservation.status === status);
    });
  });
  readonly portariaReservations = computed<readonly PortariaReservationItem[]>(() => {
    const query = normalize(this.search());
    const status = this.statusFilter();
    const selectedDate = this.portariaDate();

    return this.reservations()
      .filter((reservation) =>
        selectedDate === reservationDay(reservation) &&
        ['active', 'changed', 'conflicted'].includes(reservation.status),
      )
      .map((reservation) => this.toPortariaReservationItem(reservation))
      .filter((item) => {
        const text = normalize(
          [
            item.keyCode,
            item.reservation.roomName,
            item.reservation.responsibleName,
            item.reservation.responsibleIdentifier,
            item.reservation.purpose,
            item.availability?.activeMovement?.responsibleName,
          ]
            .filter(Boolean)
            .join(' '),
        );
        return (!query || text.includes(query)) &&
          (status === 'todas' || item.keyStatus === status);
      });
  });
  readonly portariaDays = computed<readonly PortariaDayOption[]>(() => {
    const today = dateOnly(new Date());
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(today);
      date.setDate(today.getDate() + index);
      const value = toDateInputValue(date);
      const count = this.reservations().filter((reservation) =>
        value === reservationDay(reservation) &&
        ['active', 'changed', 'conflicted'].includes(reservation.status),
      ).length;
      return {
        value,
        label: index === 0 ? 'Hoje' : index === 1 ? 'Amanha' : weekdayLabel(date),
        shortDate: shortDateLabel(date),
        count,
      };
    });
  });
  readonly portariaCounts = computed(() => {
    const reservations = this.portariaReservations();
    return {
      reservations: reservations.length,
      available: reservations.filter((item) => item.keyStatus === 'disponivel').length,
      withdrawn: reservations.filter((item) => item.keyStatus === 'retirada' || item.keyStatus === 'atrasada').length,
    };
  });
  readonly filteredAvulsaAvailability = computed(() => {
    const query = normalize(this.avulsaSearch());
    const status = this.avulsaStatusFilter();

    return this.availability().filter((item) => {
      const text = normalize(
        [
          this.keyDisplayCode(item),
          item.key.code,
          item.key.label,
          ...item.rooms.map((room) => room.name),
          item.activeMovement?.responsibleName,
          item.blockingReservation?.responsibleName,
          item.upcomingReservation?.responsibleName,
        ]
          .filter(Boolean)
          .join(' '),
      );

      return (!query || text.includes(query)) && (status === 'todas' || item.status === status);
    });
  });
  readonly avulsaCounts = computed(() => {
    const items = this.filteredAvulsaAvailability();
    return {
      total: items.length,
      available: items.filter((item) => item.status === 'disponivel').length,
      withdrawn: items.filter((item) => item.status === 'retirada' || item.status === 'atrasada').length,
    };
  });
  readonly selectedPortariaReservation = computed(() => {
    const id = this.selectedReservationId();
    return id ? this.portariaReservations().find((item) => item.id === id) ?? null : null;
  });
  readonly reservationCounts = computed(() => {
    const items = this.reservations();

    return {
      total: items.length,
      active: items.filter((item) => item.status === 'active').length,
      changed: items.filter((item) => item.status === 'changed').length,
      conflicted: items.filter((item) => item.status === 'conflicted').length,
      suspectAbsent: items.filter((item) => item.status === 'suspect_absent').length,
      absent: items.filter((item) => item.status === 'absent').length,
      canceled: items.filter((item) => item.status === 'canceled').length,
    };
  });
  readonly selectedAvailability = computed(() => {
    const keyId = this.selectedKeyId();
    return keyId ? this.availability().find((item) => item.key.id === keyId) ?? null : null;
  });
  readonly filteredUsers = computed(() => {
    const query = normalize(this.userSearch());
    const role = this.userRoleFilter();

    return this.users().filter((user) => {
      const text = normalize([user.id, user.displayName, user.email, user.campus].filter(Boolean).join(' '));
      return (!query || text.includes(query)) && (role === 'todos' || user.roles.includes(role));
    });
  });
  readonly counts = computed(() => {
    const items = this.availability();
    return {
      total: items.length,
      disponivel: items.filter((item) => item.status === 'disponivel').length,
      bloqueada: items.filter((item) => item.status === 'bloqueada_por_reserva').length,
      retirada: items.filter((item) => item.status === 'retirada').length,
      atrasada: items.filter((item) => item.status === 'atrasada').length,
      indisponivel: items.filter(
        (item) =>
          item.status === 'em_manutencao' ||
          item.status === 'perdida' ||
          item.status === 'danificada',
      ).length,
    };
  });

  readonly isAdmin = computed(() => this.hasRole('admin'));
  readonly canMoveKeys = computed(() => this.hasRole('portaria') || this.hasRole('admin'));
  readonly isPortariaOnly = computed(() => this.hasRole('portaria') && !this.isAdmin());
  readonly isSignedIn = computed(() => this.session()?.authenticated ?? false);
  readonly availableViews = computed<readonly AppViewOption[]>(() => {
    if (!this.isSignedIn()) {
      return [];
    }

    const views: AppViewOption[] = [
      { id: 'operacao', label: 'Operacao' },
    ];
    if (this.canMoveKeys() && !this.isPortariaOnly()) {
      views.push(
        { id: 'movimentacoes', label: 'Movimentacoes' },
        { id: 'ocorrencias', label: 'Ocorrencias' },
        { id: 'relatorios', label: 'Relatorios' },
      );
    }
    if (this.isAdmin()) {
      views.push({ id: 'reservas', label: 'Reservas' });
      views.push({ id: 'administracao', label: 'Administracao' });
    }

    return views;
  });

  ngOnInit(): void {
    void this.initialize();
  }

  private async initialize(): Promise<void> {
    const storedTheme = localStorage.getItem('keychain-theme');
    const storedAccent = localStorage.getItem('keychain-accent');
    if (storedTheme === 'light' || storedTheme === 'dark') {
      this.theme.set(storedTheme);
    }
    if (storedAccent === 'blue' || storedAccent === 'teal' || storedAccent === 'amber') {
      this.accent.set(storedAccent);
    }
    await this.firebaseAuth.ready;
    await this.reload();
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      await this.loadSession();
      this.ensureAllowedView();
      if (!this.isSignedIn()) {
        this.availability.set([]);
        this.movements.set([]);
        this.movementHistory.set([]);
        this.occurrences.set([]);
        this.occurrenceHistory.set([]);
        this.operationalReport.set(null);
        this.users.set([]);
        this.rooms.set([]);
        this.keys.set([]);
        this.keyRoomLinks.set([]);
        this.reservations.set([]);
        this.reservationSyncStatus.set(null);
        this.reservationSyncEvents.set([]);
        this.roleDrafts.set({});
        this.selectedKeyId.set(null);
        this.userSearch.set('');
        this.userRoleFilter.set('todos');
        return;
      }

      await this.loadOperationalData();
    } catch (error) {
      this.error.set(toErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  async login(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      await this.firebaseAuth.signInWithGoogle();
      await this.reload();
    } catch (error) {
      this.error.set(toErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  async logout(): Promise<void> {
    await this.firebaseAuth.signOut();
    this.session.set(null);
    this.availability.set([]);
    this.movements.set([]);
    this.movementHistory.set([]);
    this.occurrences.set([]);
    this.occurrenceHistory.set([]);
    this.operationalReport.set(null);
    this.users.set([]);
    this.rooms.set([]);
    this.keys.set([]);
    this.keyRoomLinks.set([]);
    this.reservations.set([]);
    this.reservationSyncStatus.set(null);
    this.reservationSyncEvents.set([]);
    this.roleDrafts.set({});
    this.activeView.set('operacao');
    this.selectedKeyId.set(null);
    this.userSearch.set('');
    this.userRoleFilter.set('todos');
    this.showSuccess('Sessao encerrada.');
  }

  requestWithdrawalConfirmation(): void {
    this.movementValidationAttempted.set(true);
    const responsibleName = this.withdrawal.responsibleName.trim();
    const responsibleIdentifier = this.withdrawal.responsibleIdentifier.trim();

    if (!this.withdrawal.keyId || !this.withdrawal.roomId || !responsibleName || !responsibleIdentifier) {
      this.error.set(null);
      return;
    }

    const selected = this.selectedAvailability();
    const reservationWarning = selected?.status === 'bloqueada_por_reserva'
      ? ' Entregar somente ao responsável indicado na reserva do SUAP.'
      : '';

    this.error.set(null);
    this.movementValidationAttempted.set(false);
    this.pendingConfirmation.set({
      action: 'withdrawal',
      title: 'Confirmar retirada',
      message: `Deseja realmente registrar a retirada desta chave por ${responsibleName}?${reservationWarning}`,
    });
  }

  requestReturnConfirmation(): void {
    this.movementValidationAttempted.set(true);
    if (!this.returnForm.keyId || !this.returnForm.actorName.trim()) {
      this.error.set(null);
      return;
    }

    this.error.set(null);
    this.movementValidationAttempted.set(false);
    this.pendingConfirmation.set({
      action: 'return',
      title: 'Confirmar devolução',
      message: 'Deseja realmente registrar a devolução desta chave?',
    });
  }

  cancelPendingConfirmation(): void {
    this.pendingConfirmation.set(null);
  }

  async confirmPendingAction(): Promise<void> {
    const confirmation = this.pendingConfirmation();
    if (!confirmation || this.loading()) {
      return;
    }

    this.pendingConfirmation.set(null);
    this.operationPending.set(true);

    try {
      if (confirmation.action === 'withdrawal') {
        await this.registerWithdrawal();
        return;
      }

      await this.registerReturn();
    } finally {
      this.operationPending.set(false);
    }
  }

  async registerWithdrawal(): Promise<void> {
    const selected = this.selectedAvailability();

    await this.submit(async () => {
      await this.firestore.registerWithdrawal({
        ...this.withdrawal,
        expectedReturnAt: this.toIsoOrEmpty(this.withdrawal.expectedReturnAt),
        reservationExternalId: selected?.blockingReservation?.externalId ?? selected?.upcomingReservation?.externalId,
        reservationResponsibleName: selected?.blockingReservation?.responsibleName ?? selected?.upcomingReservation?.responsibleName,
        reservationResponsibleIdentifier: selected?.blockingReservation?.responsibleIdentifier ?? selected?.upcomingReservation?.responsibleIdentifier,
      });
      this.withdrawal = {
        keyId: '',
        roomId: '',
        responsibleName: '',
        responsibleIdentifier: '',
        actorName: this.withdrawal.actorName,
        actorIdentifier: this.withdrawal.actorIdentifier,
        expectedReturnAt: '',
        notes: '',
      };
      this.showSuccess('Retirada registrada com sucesso.');
      if (this.isPortariaOnly()) {
        this.closePortariaModal();
      }
    });
  }

  async registerReturn(): Promise<void> {
    await this.submit(async () => {
      await this.firestore.registerReturn(this.returnForm);
      this.returnForm = {
        keyId: '',
        actorName: this.returnForm.actorName,
        actorIdentifier: this.returnForm.actorIdentifier,
        notes: '',
      };
      this.showSuccess('Devolução registrada com sucesso.');
      if (this.isPortariaOnly()) {
        this.closePortariaModal();
      }
    });
  }

  async searchMovementHistory(): Promise<void> {
    await this.submit(async () => {
      await this.loadMovementHistory();
      this.showSuccess('Historico atualizado.');
    });
  }

  async registerOccurrence(): Promise<void> {
    await this.submit(async () => {
      await this.firestore.registerOccurrence({
        ...this.occurrence,
      });
      this.occurrence = {
        keyId: '',
        roomId: '',
        type: 'ocorrencia',
        actorName: this.occurrence.actorName,
        actorIdentifier: this.occurrence.actorIdentifier,
        notes: '',
      };
      this.showSuccess('Ocorrencia registrada.');
    });
  }

  async searchOccurrenceHistory(): Promise<void> {
    await this.submit(async () => {
      await this.loadOccurrenceHistory();
      this.showSuccess('Historico de ocorrencias atualizado.');
    });
  }

  async refreshOperationalReport(): Promise<void> {
    await this.submit(async () => {
      await this.loadOperationalReport();
      this.showSuccess('Relatorio atualizado.');
    });
  }

  async refreshUsers(): Promise<void> {
    await this.submit(async () => {
      await this.loadUsers();
      this.showSuccess('Usuarios filtrados.');
    });
  }

  async saveUserRoles(user: AppUser): Promise<void> {
    await this.submit(async () => {
      const roles = this.roleDraft(user).filter((role) => role !== 'usuario');
      await this.firestore.updateUserRoles({ userId: user.id, roles });
      this.showSuccess('Perfis atualizados.');
    });
  }

  selectKey(item: KeyAvailability): void {
    this.movementValidationAttempted.set(false);
    this.selectedKeyId.set(item.key.id);
    this.withdrawal.keyId = item.key.id;
    this.withdrawal.roomId = item.rooms[0]?.id ?? '';
    this.returnForm.keyId = item.key.id;
    this.occurrence.keyId = item.key.id;
    this.occurrence.roomId = item.rooms[0]?.id ?? '';
    const reservation = item.blockingReservation ?? item.upcomingReservation;
    if (reservation) {
      this.withdrawal.responsibleName = reservation.responsibleName ?? reservation.responsibleIdentifier ?? '';
      this.withdrawal.responsibleIdentifier = reservation.responsibleIdentifier ?? '';
    }
  }

  prepareWithdrawal(item: KeyAvailability): void {
    this.selectKey(item);
    this.focusOperationForm('withdrawal-form');
  }

  prepareReturn(item: KeyAvailability): void {
    this.selectKey(item);
    this.focusOperationForm('return-form');
  }

  openReservationDetails(item: PortariaReservationItem): void {
    this.selectedReservationId.set(item.id);
    this.detailMode.set('details');
    if (item.availability) {
      this.selectKey(item.availability);
    }
  }

  prepareReservationWithdrawal(item: PortariaReservationItem): void {
    this.selectedReservationId.set(item.id);
    this.detailMode.set('withdrawal');
    if (!item.availability) {
      return;
    }
    this.selectKey(item.availability);
    this.withdrawal.responsibleName =
      item.reservation.responsibleName ?? item.reservation.responsibleIdentifier ?? '';
    this.withdrawal.responsibleIdentifier = '';
  }

  prepareReservationReturn(item: PortariaReservationItem): void {
    this.selectedReservationId.set(item.id);
    this.detailMode.set('return');
    if (item.availability) {
      this.selectKey(item.availability);
    }
  }

  closePortariaModal(): void {
    this.selectedReservationId.set(null);
    this.selectedKeyId.set(null);
    this.detailMode.set('details');
    this.pendingConfirmation.set(null);
    this.movementValidationAttempted.set(false);
  }

  setPortariaMode(mode: PortariaMode): void {
    this.portariaMode.set(mode);
    this.settingsOpen.set(false);
    this.closePortariaModal();
  }

  toggleTheme(): void {
    this.setTheme(this.theme() === 'dark' ? 'light' : 'dark');
  }

  dismissToast(): void {
    this.toastMessage.set(null);
    if (this.toastTimer) {
      clearTimeout(this.toastTimer);
      this.toastTimer = undefined;
    }
  }

  prepareAdhocWithdrawal(item: KeyAvailability): void {
    this.selectedReservationId.set(null);
    this.selectKey(item);
    this.detailMode.set('withdrawal');
    if (item.status !== 'bloqueada_por_reserva') {
      this.withdrawal.responsibleName = '';
      this.withdrawal.responsibleIdentifier = '';
    }
  }

  prepareAdhocReturn(item: KeyAvailability): void {
    this.selectedReservationId.set(null);
    this.selectKey(item);
    this.detailMode.set('return');
  }

  setActiveView(view: AppView): void {
    if (this.availableViews().some((option) => option.id === view)) {
      this.activeView.set(view);
    }
  }

  roleDraft(user: AppUser): readonly UserRole[] {
    return this.roleDrafts()[user.id] ?? user.roles;
  }

  roleChecked(user: AppUser, role: UserRole): boolean {
    return this.roleDraft(user).includes(role);
  }

  setUserRoleDraft(user: AppUser, role: UserRole, checked: boolean): void {
    const roles = new Set<UserRole>(this.roleDraft(user));
    roles.add('usuario');

    if (checked) {
      roles.add(role);
    } else {
      roles.delete(role);
    }

    this.roleDrafts.update((drafts) => ({
      ...drafts,
      [user.id]: orderRoles(roles),
    }));
  }

  statusLabel(status: string): string {
    const labels: Record<string, string> = {
      disponivel: 'Disponivel',
      bloqueada_por_reserva: 'Reserva',
      retirada: 'Retirada',
      atrasada: 'Atrasada',
      em_manutencao: 'Manutencao',
      perdida: 'Perdida',
      danificada: 'Danificada',
      devolvida: 'Devolvida',
      sem_chave: 'Sem chave',
    };
    return labels[status] ?? status;
  }

  reservationKeyStatusLabel(item: PortariaReservationItem): string {
    if (item.availability?.activeMovement) {
      return 'Retirada';
    }
    if (item.keyStatus === 'sem_chave') {
      return 'Chave não vinculada';
    }
    if (item.keyStatus === 'disponivel') {
      return item.isBlocked ? 'Aguardando retirada' : 'Disponível para retirada';
    }
    if (item.keyStatus === 'bloqueada_por_reserva') {
      return 'Aguardando retirada';
    }
    return this.statusLabel(item.keyStatus);
  }

  availabilityStatusLabel(item: KeyAvailability): string {
    if (item.activeMovement) {
      return 'Retirada';
    }
    if (item.status === 'disponivel') {
      return 'Disponível para retirada';
    }
    if (item.status === 'bloqueada_por_reserva') {
      return 'Bloqueada';
    }
    return this.statusLabel(item.status);
  }

  keyDisplayCode(item: KeyAvailability): string {
    return displayKeyCode([
      item.rooms[0]?.name,
      ...item.rooms.flatMap((room) => room.externalRefs ?? []),
      item.key.label,
      item.key.code,
    ]);
  }

  reservationPeriod(reservation: Reservation): string {
    return `${timeLabel(reservation.startsAt)} - ${timeLabel(reservation.endsAt)}`;
  }

  reservationDetailDate(reservation: Reservation): string {
    return new Intl.DateTimeFormat('pt-BR', {
      weekday: 'long',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(new Date(reservation.startsAt));
  }

  setTheme(theme: 'light' | 'dark'): void {
    this.theme.set(theme);
    localStorage.setItem('keychain-theme', theme);
  }

  setAccent(accent: 'blue' | 'teal' | 'amber'): void {
    this.accent.set(accent);
    localStorage.setItem('keychain-accent', accent);
  }

  roomName(roomId: string): string {
    return this.rooms().find((room) => room.id === roomId)?.name ??
      this.availability().flatMap((item) => item.rooms).find((room) => room.id === roomId)?.name ??
      roomId;
  }

  keyLabel(keyId: string): string {
    const key = this.keys().find((item) => item.id === keyId) ??
      this.availability().find((item) => item.key.id === keyId)?.key;
    return key ? `${key.code} - ${key.label}` : keyId;
  }

  activeLabel(value: { readonly disabledAt?: string }): string {
    return value.disabledAt ? 'Desativado' : 'Ativo';
  }

  reservationStatusLabel(status: ReservationStatus): string {
    const labels: Record<ReservationStatus, string> = {
      active: 'Ativa',
      changed: 'Alterada',
      suspect_absent: 'Ausente?',
      absent: 'Ausente',
      canceled: 'Cancelada',
      conflicted: 'Conflito',
    };
    return labels[status];
  }

  reservationResponsibleLabel(reservation: Reservation): string {
    if (!this.canMoveKeys()) {
      return '-';
    }

    return reservation.responsibleName || reservation.responsibleIdentifier || '-';
  }

  syncSummary(): string {
    if (!this.isAdmin()) {
      return 'Consulta do backend';
    }

    const status = this.reservationSyncStatus()?.scheduler;
    if (!status) {
      return 'Status indisponivel';
    }

    if (!status.enabled) {
      return 'Agendamento desligado';
    }

    if (status.running) {
      return 'Sincronizacao em andamento';
    }

    return status.nextRunAt ? `Proxima: ${this.formatDate(status.nextRunAt)}` : 'Agendamento ativo';
  }

  private hasRole(role: UserRole): boolean {
    return this.session()?.roles.includes(role) ?? false;
  }

  private ensureAllowedView(): void {
    if (!this.availableViews().some((option) => option.id === this.activeView())) {
      this.activeView.set('operacao');
    }
  }

  private focusOperationForm(id: string): void {
    setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  formatDate(value?: string): string {
    if (!value) {
      return '-';
    }

    return new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(value));
  }

  formatMovementDate(value?: string): string {
    if (!value) {
      return '-';
    }
    const date = new Date(value);
    const day = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(date);
    const time = new Intl.DateTimeFormat('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
    return `Em ${day}, às ${time}.`;
  }

  private async submit(action: () => Promise<void>): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    this.saved.set(null);

    try {
      await action();
      await this.loadOperationalData();
    } catch (error) {
      this.error.set(toErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  private showSuccess(message: string): void {
    this.saved.set(message);
    this.toastMessage.set(message);
    if (this.toastTimer) {
      clearTimeout(this.toastTimer);
    }
    this.toastTimer = setTimeout(() => this.toastMessage.set(null), 3000);
  }

  private async loadSession(): Promise<void> {
    const firebaseUser = this.firebaseAuth.user();
    if (!firebaseUser) {
      this.session.set({ authenticated: false, user: null, roles: [] });
      return;
    }

    const profile = await this.firestore.ensureCurrentUserProfile();
    const session: SessionResponse = {
      authenticated: true,
      user: {
        userId: firebaseUser.uid,
        displayName: firebaseUser.displayName ?? profile?.displayName,
        email: firebaseUser.email ?? profile?.email,
        campus: profile?.campus,
      },
      roles: profile?.roles ?? [],
    };
    this.session.set(session);

    const operatorName = session.user?.displayName || session.user?.email || session.user?.userId || 'Portaria';
    const operatorIdentifier = session.user?.email || session.user?.userId || '';
    this.withdrawal.actorName ||= operatorName;
    this.withdrawal.actorIdentifier ||= operatorIdentifier;
    this.returnForm.actorName ||= operatorName;
    this.returnForm.actorIdentifier ||= operatorIdentifier;
    this.occurrence.actorName ||= operatorName;
    this.occurrence.actorIdentifier ||= operatorIdentifier;
  }

  private async loadAvailability(): Promise<void> {
    this.availability.set(await this.firestore.listAvailability());
  }

  private async loadMovements(): Promise<void> {
    this.movements.set(
      (await this.firestore.listMovements()).filter(
        (movement) => movement.status === 'retirada' || movement.status === 'atrasada',
      ),
    );
  }

  private async loadMovementHistory(): Promise<void> {
    if (!this.canMoveKeys()) {
      this.movementHistory.set([]);
      return;
    }

    const filter = this.movementHistoryFilter;
    const from = filter.from ? this.toIsoOrEmpty(filter.from) : '';
    const to = filter.to ? this.toIsoOrEmpty(filter.to) : '';
    this.movementHistory.set(
      (await this.firestore.listMovements()).filter((movement) => {
        const date = filter.dateField === 'returnedAt' ? movement.returnedAt : movement.checkedOutAt;
        return (
          (!filter.keyId || movement.keyId === filter.keyId) &&
          (!filter.roomId || movement.roomId === filter.roomId) &&
          (filter.status === 'todas' || movement.status === filter.status) &&
          (!from || !!date && date >= from) &&
          (!to || !!date && date <= to)
        );
      }),
    );
  }

  private async loadOccurrences(): Promise<void> {
    this.occurrences.set((await this.firestore.listOccurrences()).slice(0, 20));
  }

  private async loadOccurrenceHistory(): Promise<void> {
    if (!this.canMoveKeys()) {
      this.occurrenceHistory.set([]);
      return;
    }

    const filter = this.occurrenceHistoryFilter;
    const from = filter.from ? this.toIsoOrEmpty(filter.from) : '';
    const to = filter.to ? this.toIsoOrEmpty(filter.to) : '';
    this.occurrenceHistory.set(
      (await this.firestore.listOccurrences()).filter((occurrence) =>
        (!filter.keyId || occurrence.keyId === filter.keyId) &&
        (!filter.roomId || occurrence.roomId === filter.roomId) &&
        (filter.type === 'todas' || occurrence.type === filter.type) &&
        (!from || occurrence.occurredAt >= from) &&
        (!to || occurrence.occurredAt <= to),
      ),
    );
  }

  private async loadOperationalReport(): Promise<void> {
    if (!this.canMoveKeys()) {
      this.operationalReport.set(null);
      return;
    }

    this.operationalReport.set(
      await this.firestore.buildReport(
        this.reportFilter.from ? this.toIsoOrEmpty(this.reportFilter.from) : undefined,
        this.reportFilter.to ? this.toIsoOrEmpty(this.reportFilter.to) : undefined,
      ),
    );
  }

  private async loadReservations(): Promise<void> {
    this.reservations.set(await this.firestore.listReservations());
  }

  private async loadReservationSyncStatus(): Promise<void> {
    if (!this.isAdmin()) {
      this.reservationSyncStatus.set(null);
      this.reservationSyncEvents.set([]);
      return;
    }

    const [status, events] = await Promise.all([
      this.firestore.getSyncStatus(),
      this.firestore.listSyncEvents(),
    ]);
    this.reservationSyncStatus.set(status);
    this.reservationSyncEvents.set(events as readonly ReservationSyncEvent[]);
  }

  private async loadUsers(): Promise<void> {
    if (!this.isAdmin()) {
      this.users.set([]);
      this.roleDrafts.set({});
      this.rooms.set([]);
      this.keys.set([]);
      this.keyRoomLinks.set([]);
      this.reservationSyncStatus.set(null);
      this.reservationSyncEvents.set([]);
      return;
    }

    const [allUsers, rooms, keys, links] = await Promise.all([
      this.firestore.listUsers(),
      this.firestore.listRooms(),
      this.firestore.listKeys(),
      this.firestore.listKeyRoomLinks(),
    ]);
    const search = normalize(this.userSearch());
    const role = this.userRoleFilter();
    const users = allUsers.filter((user) =>
      (!search || normalize([user.id, user.displayName, user.email, user.campus].filter(Boolean).join(' ')).includes(search)) &&
      (role === 'todos' || user.roles.includes(role)),
    );
    this.users.set(users);
    this.rooms.set(rooms);
    this.keys.set(keys);
    this.keyRoomLinks.set(links);
    this.roleDrafts.set(Object.fromEntries(users.map((user) => [user.id, orderRoles(user.roles)])));
  }

  private async loadOperationalData(): Promise<void> {
    const tasks = [this.loadAvailability()];

    if (this.canMoveKeys()) {
      tasks.push(this.loadReservations());
    } else {
      this.reservations.set([]);
    }

    if (this.canMoveKeys() && !this.isPortariaOnly()) {
      tasks.push(
        this.loadMovements(),
        this.loadMovementHistory(),
        this.loadOccurrences(),
        this.loadOccurrenceHistory(),
        this.loadOperationalReport(),
      );
    } else {
      this.movements.set([]);
      this.movementHistory.set([]);
      this.occurrences.set([]);
      this.occurrenceHistory.set([]);
      this.operationalReport.set(null);
    }

    await Promise.all(tasks);
    await Promise.all([this.loadUsers(), this.loadReservationSyncStatus()]);
  }

  private toPortariaReservationItem(reservation: Reservation): PortariaReservationItem {
    const availability = this.availability().find((item) => this.availabilityMatchesReservation(item, reservation));
    const keyStatus = availability?.status ?? 'sem_chave';
    const startsAt = new Date(reservation.startsAt).getTime();
    const isBlocked = Date.now() >= startsAt - 30 * 60 * 1000;
    const action: PortariaReservationItem['action'] = availability?.activeMovement
      ? 'return'
      : availability && ['disponivel', 'bloqueada_por_reserva'].includes(availability.status)
        ? 'withdrawal'
        : 'none';

    return {
      id: reservation.externalId,
      reservation,
      availability,
      keyCode: displayKeyCode([
        reservation.roomName,
        reservation.roomExternalId,
        ...(availability?.rooms.flatMap((room) => [room.name, ...(room.externalRefs ?? [])]) ?? []),
        availability?.key.label,
        availability?.key.code,
      ]),
      keyStatus,
      isBlocked,
      action,
    };
  }

  private availabilityMatchesReservation(item: KeyAvailability, reservation: Reservation): boolean {
    const reservationRefs = new Set(
      [reservation.roomName, reservation.roomExternalId]
        .filter((value): value is string => !!value)
        .map(normalizeReference),
    );
    const reservationCode = displayKeyCode([reservation.roomName, reservation.roomExternalId]);
    return item.rooms.some((room) => {
      const roomRefs = [room.id, room.name, ...(room.externalRefs ?? [])].map(normalizeReference);
      const roomCode = displayKeyCode([room.name, ...(room.externalRefs ?? [])]);
      return roomRefs.some((roomRef) => reservationRefs.has(roomRef)) ||
        (reservationCode !== 'Sem codigo' && roomCode === reservationCode);
    });
  }

  private toIsoOrEmpty(value: string): string {
    return value ? new Date(value).toISOString() : '';
  }

  private consumeLoginStatus(): void {
    const url = new URL(window.location.href);
    if (url.searchParams.get('login') !== 'suap-ok') {
      return;
    }

    this.saved.set('Login SUAP concluido.');
    url.searchParams.delete('login');
    window.history.replaceState({}, document.title, url.toString());
  }
}

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

function normalizeReference(value: string): string {
  return normalize(value).replace(/\s+/g, ' ');
}

function dateOnly(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function toDateInputValue(value: Date): string {
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, '0');
  const day = `${value.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function reservationDay(reservation: Reservation): string {
  return toDateInputValue(new Date(reservation.startsAt));
}

function weekdayLabel(value: Date): string {
  return new Intl.DateTimeFormat('pt-BR', { weekday: 'short' })
    .format(value)
    .replace('.', '');
}

function shortDateLabel(value: Date): string {
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' }).format(value);
}

function timeLabel(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function displayKeyCode(values: readonly (string | undefined)[]): string {
  for (const value of values) {
    if (!value) continue;
    const code = extractRoomCode(value);
    if (code) return code.toUpperCase();
  }

  return 'Sem codigo';
}

function extractRoomCode(value: string): string | undefined {
  return value.match(/\b([A-Z]{1,3}\d{1,3})\b/i)?.[1]?.toUpperCase();
}

function compact<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter((entry) => {
      const current = entry[1];
      return current !== '' && (!Array.isArray(current) || current.length > 0);
    }),
  ) as Partial<T>;
}

function orderRoles(roles: Iterable<UserRole>): readonly UserRole[] {
  const values = new Set(roles);
  return (['usuario', 'portaria', 'admin'] as const).filter((role) => values.has(role));
}

function toErrorMessage(error: unknown): string {
  if (typeof error === 'object' && error && 'error' in error) {
    const payload = (error as { error?: { error?: { message?: string } } }).error;
    if (payload?.error?.message) {
      return payload.error.message;
    }
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return 'Nao foi possivel concluir a operacao no Firestore.';
}
