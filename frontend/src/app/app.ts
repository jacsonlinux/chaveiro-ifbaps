import { Component, computed, ElementRef, inject, OnDestroy, OnInit, signal, ViewChild } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatToolbarModule } from '@angular/material/toolbar';
import { FirebaseAuthService } from './core/firebase-auth.service';
import type {
  AppViewOption,
  ListResponse,
  PendingKeyActionConfirmation,
  PortariaOccupancyItem,
} from './core/app-state.models';
import { FirestoreDataService } from './data-access/firestore-data.service';
import {
  formatDateValue,
  formatMovementDateValue,
} from './shared/date-formatters';
import {
  compareKeyAvailability,
  comparePortariaOccupancy,
  displayKeyCode,
} from './shared/key-display';
import { StatusBadgeComponent } from './shared/status-badge.component';

import type {
  AppUser,
  AppView,
  KeyAvailability,
  KeyMovement,
  KeyOccurrence,
  KeyRoomLink,
  KeyStatus,
  Occupancy,
  OperationalReport,
  Person,
  PhysicalKey,
  Reservation,
  ReservationStatus,
  ReservationSyncEvent,
  ReservationSyncStatus,
  Room,
  SessionResponse,
  UserRole,
} from './app-models';

type PortariaMode = 'reservas' | 'avulsa';

interface ValidatedIdentity {
  readonly name: string;
  readonly identifier: string;
}

@Component({
  selector: 'app-root',
  imports: [
    DatePipe,
    FormsModule,
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatDividerModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatToolbarModule,
    StatusBadgeComponent,
  ],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnInit, OnDestroy {
  private readonly firebaseAuth = inject(FirebaseAuthService);
  private readonly firestore = inject(FirestoreDataService);
  private toastTimer?: ReturnType<typeof setTimeout>;
  private readonly realtimeUnsubscriptions: Array<() => void> = [];

  readonly session = signal<SessionResponse | null>(null);
  readonly availability = signal<readonly KeyAvailability[]>([]);
  readonly movements = signal<readonly KeyMovement[]>([]);
  readonly allMovements = signal<readonly KeyMovement[]>([]);
  readonly movementHistory = signal<readonly KeyMovement[]>([]);
  readonly occurrences = signal<readonly KeyOccurrence[]>([]);
  readonly occurrenceHistory = signal<readonly KeyOccurrence[]>([]);
  readonly operationalReport = signal<OperationalReport | null>(null);
  readonly users = signal<readonly AppUser[]>([]);
  readonly rooms = signal<readonly Room[]>([]);
  readonly keys = signal<readonly PhysicalKey[]>([]);
  readonly keyRoomLinks = signal<readonly KeyRoomLink[]>([]);
  readonly reservations = signal<readonly Reservation[]>([]);
  readonly occupancies = signal<readonly Occupancy[]>([]);
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
  readonly selectedReservationId = signal<string | null>(null);
  readonly detailMode = signal<'details' | 'withdrawal' | 'return' | 'batch-withdrawal'>('details');
  readonly selectedAvulsaKeyIds = signal<readonly string[]>([]);
  readonly reservationSearch = signal('');
  readonly reservationStatusFilter = signal<ReservationStatus | 'todas'>('todas');
  readonly userSearch = signal('');
  readonly userRoleFilter = signal<UserRole | 'todos'>('todos');
  readonly registerEmail = signal('');
  readonly registerRole = signal<UserRole>('portaria');
  readonly registerBusy = signal(false);
  readonly registerMessage = signal<string | null>(null);
  readonly activeView = signal<AppView>('operacao');
  readonly selectedKeyId = signal<string | null>(null);
  readonly identificationOptions = ['Técnico', 'Professor', 'Aluno', 'Terceirizado'] as const;
  readonly linkedPerson = signal<Person | null>(null);
  readonly matriculaLink = signal('');
  readonly linkingBusy = signal(false);
  readonly linkError = signal<string | null>(null);

  readonly qrTokenId = signal<string | null>(null);
  readonly qrDataUrl = signal<string | null>(null);
  readonly qrExpiresAt = signal<number | null>(null);
  readonly qrBusy = signal(false);
  readonly qrError = signal<string | null>(null);

  readonly qrImageUrl = signal<string | null>(null);
  readonly qrCameraActive = signal(false);
  readonly qrCameraBusy = signal(false);
  readonly validacaoTab = signal<'qr' | 'pin'>('qr');
  readonly pin = signal('');
  readonly pinConfirm = signal('');
  readonly pinBusy = signal(false);
  readonly pinError = signal<string | null>(null);
  readonly pinSaved = signal(false);
  readonly pinInput = signal<string>('');
  readonly pinSuccess = signal(false);
  readonly pinSuccessName = signal<string | null>(null);
  readonly pinSuccessCargo = signal<string | null>(null);
  readonly validatedIdentity = signal<ValidatedIdentity | null>(null);
  @ViewChild('qrVideo') private qrVideo?: ElementRef<HTMLVideoElement>;
  private qrCameraStream?: MediaStream;
  private qrScanTimer?: ReturnType<typeof setTimeout>;

  withdrawal = {
    keyId: '',
    roomId: '',
    responsibleName: '',
    responsibleIdentifier: '',
    actorName: '',
    actorIdentifier: '',
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
    status: 'todas' as 'todas' | 'retirada' | 'devolvida',
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
  readonly portariaOccupancies = computed<readonly PortariaOccupancyItem[]>(() => {
    const query = normalize(this.search());
    const status = this.statusFilter();
    const today = toDateInputValue(new Date());

    return this.occupancies()
      .filter((occupancy) =>
        today === occupancyDay(occupancy) &&
        ['active', 'changed', 'conflicted'].includes(occupancy.status),
      )
      .map((occupancy) => this.toPortariaOccupancyItem(occupancy))
      .filter((item) => {
        const text = normalize(
          [
            item.keyCode,
            item.occupancy.roomName,
            item.occupancy.responsibleName,
            item.occupancy.responsibleIdentifier,
            item.occupancy.purpose,
            item.availability?.activeMovement?.responsibleName,
          ]
            .filter(Boolean)
            .join(' '),
        );
        return (!query || text.includes(query)) &&
          (status === 'todas' || item.keyStatus === status);
      })
      .sort((left, right) => comparePortariaOccupancy(left, right));
  });
  readonly portariaCounts = computed(() => {
    const reservations = this.portariaOccupancies();
    return {
      reservations: reservations.length,
      available: reservations.filter((item) => item.keyStatus === 'disponivel').length,
      withdrawn: reservations.filter((item) => item.keyStatus === 'retirada').length,
    };
  });
  readonly filteredAvulsaAvailability = computed(() => {
    const query = normalize(this.avulsaSearch());
    const status = this.avulsaStatusFilter();

    return this.availability()
      .filter((item) => {
        const text = normalize(
          [
            this.keyDisplayCode(item),
            item.key.code,
            item.key.label,
            ...item.rooms.map((room) => room.name),
            item.activeMovement?.responsibleName,
            item.blockingOccupancy?.responsibleName,
            item.upcomingOccupancy?.responsibleName,
          ]
            .filter(Boolean)
            .join(' '),
        );

        return (!query || text.includes(query)) && (status === 'todas' || item.status === status);
      })
      .sort((left, right) => compareKeyAvailability(left, right));
  });
  readonly avulsaCounts = computed(() => {
    const items = this.filteredAvulsaAvailability();
    return {
      total: items.length,
      available: items.filter((item) => item.status === 'disponivel').length,
      withdrawn: items.filter((item) => item.status === 'retirada').length,
    };
  });
  readonly selectedPortariaOccupancy = computed(() => {
    const id = this.selectedReservationId();
    return id ? this.portariaOccupancies().find((item) => item.id === id) ?? null : null;
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
  readonly selectedAvulsaItems = computed(() => {
    const selected = new Set(this.selectedAvulsaKeyIds());
    return this.filteredAvulsaAvailability().filter((item) =>
      selected.has(item.key.id) && this.canSelectAvulsaKey(item),
    );
  });
  readonly hasAvulsaSelection = computed(() => this.selectedAvulsaKeyIds().length > 0);
  readonly publicAvailability = computed(() => {
    const query = normalize(this.search());

    return this.availability()
      .filter((item) => {
        const text = normalize(
          [
            this.keyDisplayCode(item),
            item.key.code,
            item.key.label,
            ...item.rooms.map((room) => room.name),
            item.activeMovement?.responsibleName,
          ]
            .filter(Boolean)
            .join(' '),
        );
        return !query || text.includes(query);
      })
      .sort((left, right) => compareKeyAvailability(left, right));
  });
  readonly filteredUsers = computed(() => {
    const query = normalize(this.userSearch());
    const role = this.userRoleFilter();

    return this.users().filter((user) => {
      const text = normalize([user.id, user.displayName, user.email, user.campus].filter(Boolean).join(' '));
      return (!query || text.includes(query)) && (role === 'todos' || user.roles.includes(role));
    });
  });
  readonly isAdmin = computed(() => this.hasRole('admin'));
  readonly canMoveKeys = computed(() => this.hasRole('portaria') || this.hasRole('admin'));
  readonly isPortariaOnly = computed(() => this.hasRole('portaria') && !this.isAdmin());
  readonly isPublicOnly = computed(() => this.isSignedIn() && !this.canMoveKeys());
  readonly isSignedIn = computed(() => this.session()?.authenticated ?? false);
  readonly availableViews = computed<readonly AppViewOption[]>(() => {
    if (!this.isSignedIn()) {
      return [];
    }

    const views: AppViewOption[] = [];
    if (this.canMoveKeys() && this.isPortariaOnly()) {
      views.push({ id: 'operacao', label: 'Operacao' });
    }
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

  ngOnDestroy(): void {
    this.stopRealtimeData();
    this.stopQrCamera();
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
        this.stopRealtimeData();
        this.availability.set([]);
        this.movements.set([]);
        this.allMovements.set([]);
        this.movementHistory.set([]);
        this.occurrences.set([]);
        this.occurrenceHistory.set([]);
        this.operationalReport.set(null);
        this.users.set([]);
        this.rooms.set([]);
        this.keys.set([]);
        this.keyRoomLinks.set([]);
        this.reservations.set([]);
        this.occupancies.set([]);
        this.reservationSyncStatus.set(null);
        this.reservationSyncEvents.set([]);
        this.roleDrafts.set({});
        this.selectedKeyId.set(null);
        this.selectedAvulsaKeyIds.set([]);
        this.userSearch.set('');
        this.userRoleFilter.set('todos');
        return;
      }

      await this.loadOperationalData();
      this.startRealtimeData();
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
    this.stopRealtimeData();
    this.session.set(null);
    this.availability.set([]);
    this.movements.set([]);
    this.allMovements.set([]);
    this.movementHistory.set([]);
    this.occurrences.set([]);
    this.occurrenceHistory.set([]);
    this.operationalReport.set(null);
    this.users.set([]);
    this.rooms.set([]);
    this.keys.set([]);
    this.keyRoomLinks.set([]);
    this.reservations.set([]);
    this.occupancies.set([]);
    this.reservationSyncStatus.set(null);
    this.reservationSyncEvents.set([]);
    this.roleDrafts.set({});
    this.activeView.set('operacao');
    this.selectedKeyId.set(null);
    this.selectedAvulsaKeyIds.set([]);
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

  requestBatchWithdrawalConfirmation(): void {
    this.movementValidationAttempted.set(true);
    const responsibleName = this.withdrawal.responsibleName.trim();
    const responsibleIdentifier = this.withdrawal.responsibleIdentifier.trim();
    const selectedItems = this.selectedAvulsaItems().filter((item) => item.status === 'disponivel');

    if (selectedItems.length === 0 || !responsibleName || !responsibleIdentifier) {
      this.error.set(null);
      return;
    }

    const keys = selectedItems.map((item) => this.keyDisplayCode(item)).join(', ');
    this.error.set(null);
    this.movementValidationAttempted.set(false);
    this.pendingConfirmation.set({
      action: 'batch-withdrawal',
      title: 'Confirmar retirada',
      message: `Deseja realmente registrar a retirada de ${selectedItems.length} chaves por ${responsibleName}? (${keys})`,
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

      if (confirmation.action === 'batch-withdrawal') {
        await this.registerBatchWithdrawal();
        return;
      }

      await this.registerReturn();
    } finally {
      this.operationPending.set(false);
    }
  }

  async registerWithdrawal(): Promise<void> {
    const selected = this.selectedAvailability();
    const selectedOccupancy = this.selectedPortariaOccupancy()?.occupancy;

    await this.submit(async () => {
      await this.firestore.registerWithdrawal({
        ...this.withdrawal,
        reservationExternalId: selectedOccupancy?.externalId,
        reservationResponsibleName: selectedOccupancy?.responsibleName,
        reservationResponsibleIdentifier: selectedOccupancy?.responsibleIdentifier,
      });
      this.withdrawal = {
        keyId: '',
        roomId: '',
        responsibleName: '',
        responsibleIdentifier: '',
        actorName: this.withdrawal.actorName,
        actorIdentifier: this.withdrawal.actorIdentifier,
        notes: '',
      };
      this.showSuccess('Retirada registrada com sucesso.');
      if (this.isPortariaOnly()) {
        this.closePortariaModal();
      }
    });
  }

  async registerBatchWithdrawal(): Promise<void> {
    const selectedItems = this.selectedAvulsaItems().filter((item) => item.status === 'disponivel');

    await this.submit(async () => {
      await this.firestore.registerBatchWithdrawal(selectedItems.map((item) => ({
        ...this.withdrawal,
        keyId: item.key.id,
        roomId: item.rooms[0]?.id ?? '',
        reservationExternalId: undefined,
        reservationResponsibleName: undefined,
        reservationResponsibleIdentifier: undefined,
      })));
      const total = selectedItems.length;
      this.withdrawal = {
        keyId: '',
        roomId: '',
        responsibleName: '',
        responsibleIdentifier: '',
        actorName: this.withdrawal.actorName,
        actorIdentifier: this.withdrawal.actorIdentifier,
        notes: '',
      };
      this.selectedAvulsaKeyIds.set([]);
      this.closePortariaModal();
      this.showSuccess(total === 1 ? 'Retirada registrada com sucesso.' : `${total} retiradas registradas com sucesso.`);
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

  async registerPortariaEmail(): Promise<void> {
    const email = this.registerEmail().trim().toLowerCase();
    if (!email) {
      this.registerMessage.set('Informe o email do porteiro.');
      return;
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      this.registerMessage.set('Email invalido.');
      return;
    }
    this.registerBusy.set(true);
    this.registerMessage.set(null);
    try {
      await this.firestore.registerEmail(email, this.registerRole());
      this.registerEmail.set('');
      this.registerMessage.set('Email cadastrado. O porteiro pode acessar apos o primeiro login com o Google.');
    } catch (error) {
      this.registerMessage.set(toErrorMessage(error));
    } finally {
      this.registerBusy.set(false);
    }
  }

  selectKey(item: KeyAvailability): void {
    this.movementValidationAttempted.set(false);
    this.selectedKeyId.set(item.key.id);
    this.withdrawal.keyId = item.key.id;
    this.withdrawal.roomId = item.rooms[0]?.id ?? '';
    this.returnForm.keyId = item.key.id;
    this.occurrence.keyId = item.key.id;
    this.occurrence.roomId = item.rooms[0]?.id ?? '';
    const occupancy = item.blockingOccupancy ?? item.upcomingOccupancy;
    if (occupancy) {
      this.withdrawal.responsibleName = occupancy.responsibleName ?? occupancy.responsibleIdentifier ?? '';
      this.withdrawal.responsibleIdentifier = occupancy.responsibleIdentifier ?? '';
    }
  }

  openReservationAction(item: PortariaOccupancyItem): void {
    if (item.action === 'return') {
      this.prepareReservationReturn(item);
    } else if (item.action === 'withdrawal') {
      this.prepareReservationWithdrawal(item);
    } else if (item.availability) {
      this.selectedReservationId.set(item.id);
      this.detailMode.set('details');
      this.selectKey(item.availability);
    }
  }

  prepareReservationWithdrawal(item: PortariaOccupancyItem): void {
    this.selectedReservationId.set(item.id);
    this.clearIdentityValidation();
    this.detailMode.set('withdrawal');
    if (!item.availability) {
      return;
    }
    this.selectKey(item.availability);
    this.withdrawal.responsibleName =
      item.occupancy.responsibleName ?? item.occupancy.responsibleIdentifier ?? '';
    this.withdrawal.responsibleIdentifier = '';
  }

  prepareReservationReturn(item: PortariaOccupancyItem): void {
    this.selectedReservationId.set(item.id);
    this.detailMode.set('return');
    if (item.availability) {
      this.selectKey(item.availability);
    }
  }

  closePortariaModal(): void {
    this.clearIdentityValidation();
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
    if (mode !== 'avulsa') {
      this.clearAvulsaSelection();
    }
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
    this.clearIdentityValidation();
    this.selectKey(item);
    this.detailMode.set('withdrawal');
    if (item.status !== 'bloqueada_por_reserva') {
      this.withdrawal.responsibleName = '';
      this.withdrawal.responsibleIdentifier = '';
    }
  }

  prepareAdhocReturn(item: KeyAvailability): void {
    this.selectedReservationId.set(null);
    this.clearIdentityValidation();
    this.selectKey(item);
    this.detailMode.set('return');
  }

  prepareAdhocDetails(item: KeyAvailability): void {
    this.selectedReservationId.set(null);
    this.clearIdentityValidation();
    this.selectKey(item);
    this.detailMode.set('details');
  }

  openAvulsaAction(item: KeyAvailability): void {
    if (item.activeMovement) {
      this.prepareAdhocReturn(item);
    } else if (this.canSelectAvulsaKey(item) && !this.hasAvulsaSelection()) {
      this.prepareAdhocWithdrawal(item);
    } else {
      this.prepareAdhocDetails(item);
    }
  }

  canSelectAvulsaKey(item: KeyAvailability): boolean {
    return item.status === 'disponivel' && !item.roomRestricted && !item.activeMovement && item.rooms.length > 0;
  }

  isAvulsaKeySelected(item: KeyAvailability): boolean {
    return this.selectedAvulsaKeyIds().includes(item.key.id);
  }

  toggleAvulsaSelection(item: KeyAvailability): void {
    if (!this.canSelectAvulsaKey(item)) {
      return;
    }

    this.selectedAvulsaKeyIds.update((ids) =>
      ids.includes(item.key.id)
        ? ids.filter((id) => id !== item.key.id)
        : [...ids, item.key.id],
    );
  }

  selectAllAvailableAvulsa(): void {
    this.selectedAvulsaKeyIds.set(
      this.filteredAvulsaAvailability()
        .filter((item) => this.canSelectAvulsaKey(item))
        .map((item) => item.key.id),
    );
  }

  clearAvulsaSelection(): void {
    this.selectedAvulsaKeyIds.set([]);
    if (this.detailMode() === 'batch-withdrawal') {
      this.detailMode.set('details');
    }
  }

  openBatchWithdrawal(): void {
    if (this.selectedAvulsaItems().length === 0) {
      return;
    }

    this.selectedReservationId.set(null);
    this.selectedKeyId.set(null);
    this.detailMode.set('batch-withdrawal');
    this.movementValidationAttempted.set(false);
    this.withdrawal.responsibleName = '';
    this.withdrawal.responsibleIdentifier = '';
    this.withdrawal.notes = '';
  }

  setActiveView(view: AppView): void {
    if (this.availableViews().some((option) => option.id === view)) {
      this.activeView.set(view);
    }
  }

  viewIcon(view: string): string {
    switch (view) {
      case 'operacao':
        return 'dashboard';
      case 'movimentacoes':
        return 'swap_horiz';
      case 'ocorrencias':
        return 'report';
      case 'relatorios':
        return 'summarize';
      case 'reservas':
        return 'event_available';
      case 'administracao':
        return 'admin_panel_settings';
      default:
        return 'circle';
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
      em_manutencao: 'Manutencao',
      perdida: 'Perdida',
      danificada: 'Danificada',
      devolvida: 'Devolvida',
      sem_chave: 'Sem chave',
    };
    return labels[status] ?? status;
  }

  occupancyKeyStatusLabel(item: PortariaOccupancyItem): string {
    if (item.completedMovement) {
      return 'Devolvida';
    }
    if (item.activeMovement || item.availability?.activeMovement) {
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
    if (item.roomRestricted) {
      return 'Indisponível no SUAP';
    }
    if (item.status === 'disponivel') {
      return 'Disponível para retirada';
    }
    if (item.status === 'bloqueada_por_reserva') {
      return 'Em uso agora';
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

  occupancyPeriod(reservation: Occupancy): string {
    return `${timeLabel(reservation.startsAt)} - ${timeLabel(reservation.endsAt)}`;
  }

  occupancyDetailDate(reservation: Occupancy): string {
    return new Intl.DateTimeFormat('pt-BR', {
      weekday: 'long',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(new Date(reservation.startsAt));
  }

  todayLabel(): string {
    return new Intl.DateTimeFormat('pt-BR', {
      weekday: 'long',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(new Date());
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
    if (this.isAdmin()) {
      this.activeView.set('administracao');
      return;
    }
    if (this.isPortariaOnly()) {
      this.activeView.set('operacao');
      return;
    }
    if (!this.availableViews().some((option) => option.id === this.activeView())) {
      this.activeView.set(this.availableViews()[0]?.id ?? 'operacao');
    }
  }

  formatDate(value?: string): string {
    return formatDateValue(value);
  }

  formatMovementDate(value?: string): string {
    return formatMovementDateValue(value);
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

    let profile: AppUser | null = null;
    try {
      profile = await this.firestore.ensureCurrentUserProfile();
    } catch (error) {
      const email = firebaseUser.email?.trim().toLowerCase() ?? '';
      const registeredRole = email
        ? await this.firestore.getRegisteredEmailRole(email).catch(() => null)
        : null;
      if (registeredRole !== 'portaria' && registeredRole !== 'admin') {
        throw error;
      }
      profile = {
        id: firebaseUser.uid,
        email: firebaseUser.email ?? undefined,
        displayName: firebaseUser.displayName ?? undefined,
        roles: [registeredRole],
      };
    }
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
    await this.loadLinkedPerson();
  }

  private async loadLinkedPerson(): Promise<void> {
    const firebaseUser = this.firebaseAuth.user();
    if (!firebaseUser) {
      this.linkedPerson.set(null);
      return;
    }

    const profile = await this.firestore.getCurrentUserProfile();
    if (profile?.personId) {
      const person = await this.firestore.getPersonById(profile.personId);
      this.linkedPerson.set(person);
      return;
    }

    this.linkedPerson.set(null);
  }

  async linkByMatricula(): Promise<void> {
    const matricula = this.matriculaLink().trim();
    if (!matricula || this.linkingBusy()) {
      return;
    }

    this.linkingBusy.set(true);
    this.linkError.set(null);
    try {
      const person = await this.firestore.getPersonById(`p-${matricula}`);
      if (!person || person.active === false) {
        this.linkError.set('Matrícula não encontrada na base institucional.');
        return;
      }
      await this.firestore.linkCurrentUserToPerson(person.id);
      this.matriculaLink.set('');
      await this.loadLinkedPerson();
    } catch {
      this.linkError.set('Não foi possível vincular. Verifique a matrícula ou tente novamente.');
    } finally {
      this.linkingBusy.set(false);
    }
  }

  async generateQr(): Promise<void> {
    const person = this.linkedPerson();
    if (!person || this.qrBusy()) {
      return;
    }

    this.qrBusy.set(true);
    this.qrError.set(null);
    try {
      const tokenId = await this.firestore.createQrToken(person.id);
      const QRCode = await import('qrcode');
      const dataUrl = await QRCode.toDataURL(`qr_tokens/${tokenId}`);
      this.qrTokenId.set(tokenId);
      this.qrDataUrl.set(dataUrl);
      this.qrExpiresAt.set(Date.now() + 5 * 60_000);
    } catch {
      this.qrError.set('Não foi possível gerar o QR Code. Tente novamente.');
    } finally {
      this.qrBusy.set(false);
    }
  }

  clearQr(): void {
    this.stopQrCamera();
    this.qrTokenId.set(null);
    this.qrDataUrl.set(null);
    this.qrExpiresAt.set(null);
    this.qrError.set(null);
    this.qrImageUrl.set(null);
  }

  private clearIdentityValidation(): void {
    this.clearQr();
    this.validatedIdentity.set(null);
    this.pinInput.set('');
    this.pinError.set(null);
    this.pinSuccess.set(false);
    this.pinSuccessName.set(null);
    this.pinSuccessCargo.set(null);
  }

  onQrFileSelect(file: File): void {
    const reader = new FileReader();
    reader.onload = (e: any) => {
      this.qrImageUrl.set(e.target.result);
    };
    reader.readAsDataURL(file);
  }

  selectValidacaoTab(tab: 'qr' | 'pin'): void {
    this.validacaoTab.set(tab);
    if (tab !== 'qr') {
      this.stopQrCamera();
    }
  }

  async startQrCamera(): Promise<void> {
    if (this.qrCameraActive() || this.qrCameraBusy()) {
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      this.qrError.set('A câmera não está disponível neste navegador. Use HTTPS ou digite o PIN.');
      return;
    }

    this.qrCameraBusy.set(true);
    this.qrError.set(null);
    try {
      this.qrCameraStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
      this.qrCameraActive.set(true);
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const video = this.qrVideo?.nativeElement;
      if (!video) {
        throw new Error('camera_preview_unavailable');
      }
      video.srcObject = this.qrCameraStream;
      await video.play();
      this.scanQrCameraFrame();
    } catch (error) {
      this.stopQrCamera();
      this.qrError.set(error instanceof DOMException && error.name === 'NotAllowedError'
        ? 'Permita o acesso à câmera no navegador para ler o QR Code.'
        : 'Não foi possível abrir a câmera. Use o PIN ou selecione uma imagem.');
    } finally {
      this.qrCameraBusy.set(false);
    }
  }

  stopQrCamera(): void {
    if (this.qrScanTimer) {
      clearTimeout(this.qrScanTimer);
      this.qrScanTimer = undefined;
    }
    this.qrCameraStream?.getTracks().forEach((track) => track.stop());
    this.qrCameraStream = undefined;
    if (this.qrVideo?.nativeElement) {
      this.qrVideo.nativeElement.pause();
      this.qrVideo.nativeElement.srcObject = null;
    }
    this.qrCameraActive.set(false);
  }

  private scanQrCameraFrame(): void {
    const video = this.qrVideo?.nativeElement;
    if (!this.qrCameraActive() || !video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      if (this.qrCameraActive()) {
        this.qrScanTimer = setTimeout(() => this.scanQrCameraFrame(), 250);
      }
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context || !canvas.width || !canvas.height) {
      this.qrScanTimer = setTimeout(() => this.scanQrCameraFrame(), 250);
      return;
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    void import('jsqr').then(({ default: jsQR }) => {
      if (!this.qrCameraActive()) return;
      const decoded = jsQR(
        context.getImageData(0, 0, canvas.width, canvas.height).data,
        canvas.width,
        canvas.height,
        { inversionAttempts: 'attemptBoth' },
      );
      if (decoded?.data) {
        this.stopQrCamera();
        void this.validateQrPayload(decoded.data);
        return;
      }
      this.qrScanTimer = setTimeout(() => this.scanQrCameraFrame(), 250);
    }).catch(() => {
      this.qrError.set('Não foi possível iniciar o leitor de QR Code. Use o PIN.');
      this.stopQrCamera();
    });
  }

  async savePin(): Promise<void> {
    const person = this.linkedPerson();
    if (!person || this.pinBusy()) {
      return;
    }

    const pin = this.pin().trim();
    if (!/^\d{6}$/.test(pin)) {
      this.pinError.set('O PIN deve ter exatamente 6 dígitos numéricos.');
      return;
    }
    if (pin !== this.pinConfirm().trim()) {
      this.pinError.set('A confirmação não confere com a senha digitada.');
      return;
    }

    this.pinBusy.set(true);
    this.pinError.set(null);
    this.pinSaved.set(false);
    try {
      const requestId = await this.firestore.createPinRequestSet(pin, person.id);
      const unsubscribe = this.firestore.watchPinRequest(
        requestId,
        (result) => {
          if (result.status === 'completed') {
            this.pinSaved.set(true);
            this.pinBusy.set(false);
            this.pin.set('');
            this.pinConfirm.set('');
            unsubscribe();
          } else if (result.status === 'failed') {
            this.pinError.set(
              result.failReason === 'request_expired'
                ? 'O pedido expirou. Tente novamente.'
                : 'Não foi possível salvar a senha. Tente novamente.',
            );
            this.pinBusy.set(false);
            unsubscribe();
          }
        },
        () => {
          this.pinError.set('Falha ao confirmar a senha. Tente novamente.');
          this.pinBusy.set(false);
        },
      );
    } catch {
      this.pinError.set('Não foi possível solicitar a definição da senha. Tente novamente.');
      this.pinBusy.set(false);
    }
  }

  async validarPin(): Promise<void> {
    if (this.pinBusy()) {
      return;
    }

    const pin = this.pinInput().trim();
    if (!/^\d{6}$/.test(pin)) {
      this.pinError.set('O PIN deve ter exatamente 6 dígitos numéricos.');
      return;
    }

    this.pinBusy.set(true);
    this.pinError.set(null);
    this.pinSuccess.set(false);
    this.pinSuccessName.set(null);
    this.pinSuccessCargo.set(null);

    try {
      const requestId = await this.firestore.createPinRequestVerify(pin);
      const unsubscribe = this.firestore.watchPinRequest(
        requestId,
        (result) => {
          if (result.status === 'completed') {
            this.pinSuccess.set(true);
            this.pinSuccessName.set(result.result?.name ?? null);
            this.pinSuccessCargo.set(result.result?.cargo ?? null);
            if (result.result?.name) {
              this.setValidatedIdentity(result.result.name, result.result.cargo);
            }
            this.pinBusy.set(false);
            unsubscribe();
          } else if (result.status === 'failed') {
            this.pinError.set(
              result.failReason === 'attempts_locked'
                ? 'Conta bloqueada por excesso de tentativas. Tente mais tarde.'
                : 'Senha invalida. Tente novamente.',
            );
            this.pinBusy.set(false);
            unsubscribe();
          }
        },
        () => {
          this.pinError.set('Falha ao validar a senha. Tente novamente.');
          this.pinBusy.set(false);
        });
    } catch {
      this.pinError.set('Não foi possível solicitar a validacao da senha. Tente novamente.');
      this.pinBusy.set(false);
    }
  }

  async validarQr(): Promise<void> {
    const imageUrl = this.qrImageUrl();
    if (!imageUrl) {
      this.pinError.set('Selecione uma imagem de QR Code para validar.');
      return;
    }
    if (this.pinBusy()) {
      return;
    }

    this.pinBusy.set(true);
    this.pinError.set(null);
    this.pinSuccess.set(false);
    this.pinSuccessName.set(null);
    this.pinSuccessCargo.set(null);

    try {
      const payload = await this.decodeQrImage(imageUrl);
      await this.validateQrPayload(payload);
    } catch {
      this.pinError.set('Nao foi possivel ler o QR Code da imagem. Use uma imagem com foco e boa iluminacao.');
    } finally {
      this.pinBusy.set(false);
    }
  }

  private async validateQrPayload(payload: string): Promise<void> {
    this.pinBusy.set(true);
    this.pinError.set(null);
    this.pinSuccess.set(false);
    this.pinSuccessName.set(null);
    this.pinSuccessCargo.set(null);
    try {
      const match = /^qr_tokens\/([A-Za-z0-9-]+)$/.exec(payload);
      if (!match) {
        this.pinError.set('QR Code inválido para o controle de chaves.');
        return;
      }
      const token = await this.firestore.getQrToken(match[1]);
      if (!token) {
        this.pinError.set('QR Code não encontrado ou expirado.');
        return;
      }
      const person = await this.firestore.getPersonById(token.personId);
      if (!person) {
        this.pinError.set('Responsável não encontrado para este QR Code.');
        return;
      }
      await this.firestore.consumeQrToken(token.id);
      this.pinSuccess.set(true);
      this.pinSuccessName.set(person.name ?? null);
      this.pinSuccessCargo.set(person.cargo ?? null);
      this.setValidatedIdentity(person.name, person.cargo);
    } catch {
      this.pinError.set('Não foi possível validar o QR Code. Tente novamente.');
    } finally {
      this.pinBusy.set(false);
    }
  }

  private setValidatedIdentity(name: string, cargo?: string): void {
    const normalizedCargo = (cargo ?? '').toLowerCase();
    const identifier = normalizedCargo.includes('prof')
      ? 'Professor'
      : normalizedCargo.includes('tec')
        ? 'Técnico'
        : normalizedCargo.includes('alun')
          ? 'Aluno'
          : 'Terceirizado';
    this.validatedIdentity.set({ name, identifier });
    this.withdrawal.responsibleName = name;
    this.withdrawal.responsibleIdentifier = identifier;
  }

  private async decodeQrImage(imageUrl: string): Promise<string> {
    const image = new Image();
    image.src = imageUrl;
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('image_load_failed'));
    });

    const canvas = document.createElement('canvas');
    const maxSide = 1024;
    const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) {
      throw new Error('canvas_unavailable');
    }
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);

    const { default: jsQR } = await import('jsqr');
    const decoded = jsQR(data, canvas.width, canvas.height, {
      inversionAttempts: 'attemptBoth',
    });
    if (!decoded?.data) {
      throw new Error('qr_not_found');
    }
    return decoded.data;
  }

  pinInputChanged(value: string): void {
    this.pinInput.set(value);
  }

  private async loadAvailability(): Promise<void> {
    this.availability.set(await this.firestore.listAvailability({
      includeOccupancies: this.canMoveKeys(),
    }));
  }

  private async loadMovements(): Promise<void> {
    const records = await this.firestore.listMovements();
    this.allMovements.set(records);
    this.movements.set(records.filter(
      (movement) => movement.status === 'retirada',
    ));
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

  private async loadOccupancies(): Promise<void> {
    this.occupancies.set(await this.firestore.listOccupancies());
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
      tasks.push(this.loadOccupancies(), this.loadMovements());
      if (this.isAdmin()) {
        tasks.push(this.loadReservations());
      }
    } else {
      this.reservations.set([]);
      this.occupancies.set([]);
      this.allMovements.set([]);
    }

    if (this.canMoveKeys() && !this.isPortariaOnly()) {
      tasks.push(
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

    if (this.isAdmin()) {
      tasks.push(this.loadUsers(), this.loadReservationSyncStatus());
    } else {
      this.users.set([]);
      this.reservationSyncStatus.set(null);
      this.reservationSyncEvents.set([]);
    }

    await Promise.all(tasks);
  }

  private startRealtimeData(): void {
    this.stopRealtimeData();
    if (!this.isSignedIn()) {
      return;
    }

    const onError = (error: unknown) => this.error.set(toErrorMessage(error));
    this.realtimeUnsubscriptions.push(
      this.firestore.watchAvailability(
        { includeOccupancies: this.canMoveKeys() },
        (records) => this.availability.set(records),
        onError,
      ),
    );

    if (this.canMoveKeys()) {
      this.realtimeUnsubscriptions.push(
        this.firestore.watchOccupancies(
          (records) => this.occupancies.set(records),
          onError,
        ),
        this.firestore.watchMovements(
          (records) => this.setMovementRecords(records),
          onError,
        ),
      );
      if (this.isAdmin()) {
        this.realtimeUnsubscriptions.push(
          this.firestore.watchReservations(
            (records) => this.reservations.set(records),
            onError,
          ),
        );
      }
    } else {
      this.reservations.set([]);
      this.occupancies.set([]);
      this.allMovements.set([]);
      this.movements.set([]);
    }
  }

  private stopRealtimeData(): void {
    while (this.realtimeUnsubscriptions.length > 0) {
      this.realtimeUnsubscriptions.pop()?.();
    }
  }

  private setMovementRecords(records: readonly KeyMovement[]): void {
    this.allMovements.set(records);
    this.movements.set(records.filter(
      (movement) => movement.status === 'retirada',
    ));
    if (this.canMoveKeys() && !this.isPortariaOnly()) {
      this.updateMovementHistoryFrom(records);
    }
  }

  private updateMovementHistoryFrom(records: readonly KeyMovement[]): void {
    const filter = this.movementHistoryFilter;
    const from = filter.from ? this.toIsoOrEmpty(filter.from) : '';
    const to = filter.to ? this.toIsoOrEmpty(filter.to) : '';
    this.movementHistory.set(records.filter((movement) => {
      const date = filter.dateField === 'returnedAt' ? movement.returnedAt : movement.checkedOutAt;
      return (
        (!filter.keyId || movement.keyId === filter.keyId) &&
        (!filter.roomId || movement.roomId === filter.roomId) &&
        (filter.status === 'todas' || movement.status === filter.status) &&
        (!from || !!date && date >= from) &&
        (!to || !!date && date <= to)
      );
    }));
  }

  private toPortariaOccupancyItem(reservation: Occupancy): PortariaOccupancyItem {
    const availability = this.availability().find((item) => this.availabilityMatchesOccupancy(item, reservation));
    const reservationMovements = this.allMovements().filter(
      (movement) => movement.reservationExternalId === reservation.externalId,
    );
    const completedMovement = reservationMovements.find((movement) => movement.status === 'devolvida');
    const activeMovement = reservationMovements.find(
      (movement) => movement.status === 'retirada',
    );
    const keyStatus = completedMovement
      ? 'devolvida'
      : activeMovement
        ? activeMovement.status
        : availability?.status ?? 'sem_chave';
    const isBlocked = !completedMovement && availability?.status === 'bloqueada_por_reserva';
    const action: PortariaOccupancyItem['action'] = completedMovement
      ? 'none'
      : activeMovement
      ? 'return'
      : availability && !availability.activeMovement && ['disponivel', 'bloqueada_por_reserva'].includes(availability.status)
        ? 'withdrawal'
        : 'none';

    return {
      id: reservation.externalId,
      occupancy: reservation,
      availability,
      activeMovement,
      completedMovement,
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

  private availabilityMatchesOccupancy(item: KeyAvailability, reservation: Occupancy): boolean {
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

function toDateInputValue(value: Date): string {
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, '0');
  const day = `${value.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function occupancyDay(reservation: Occupancy): string {
  return toDateInputValue(new Date(reservation.startsAt));
}

function timeLabel(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
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
