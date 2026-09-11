import { Reservation, ReservationStatus } from './reservation.model';

import type { PendingTopUp } from './guarantee.model';

// Forme brute renvoyée par le backend (ReservationResponse, objets liés via ?expand).
export interface BackTable {
  id: string;
  name: string;
  capacity: number;
}

export interface BackCustomer {
  id: string;
  phone: string;
  firstName: string | null;
  lastName: string | null;
}

export interface BackRestaurant {
  id: string;
  name: string;
}

// Miroir de CustomerResponse côté back (GET /customers/:id).
// Utilisé quand on refetch un client avant de le PUT pour ne pas écraser ses champs.
export interface BackCustomerFull {
  id: string;
  restaurantId: string;
  phone: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  notes: string | null;
}

export interface ReservationDto {
  id: string;
  restaurantId: string;
  customerId: string;
  tableId: string | null;
  callId: string | null;
  startsAt: string;
  endsAt: string;
  partySize: number;
  status: string;
  source: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  cancelledAt: string | null;
  guaranteeMode?: string | null;
  guaranteeStatus?: string | null;
  guaranteeAmountCents?: number | null;
  table?: BackTable | null;
  customer?: BackCustomer | null;
  restaurant?: BackRestaurant | null;
  // Present uniquement tant qu'une hausse de couverts attend son reglement.
  pendingTopUp?: PendingTopUp | null;
}

// Corps attendu par le backend pour POST / PUT (ReservationRequest).
export interface ReservationRequestDto {
  restaurantId: string;
  customerId: string | null;
  tableId: string | null;
  callId: string | null;
  startsAt: string;
  endsAt: string;
  partySize: number;
  status: string;
  source: string;
  notes: string | null;
}

// DTO backend -> modèle d'affichage du front (un seul endroit à maintenir).
export function mapReservation(dto: ReservationDto): Reservation {
  const name = [dto.customer?.firstName, dto.customer?.lastName].filter(Boolean).join(' ').trim();
  return {
    id: dto.id,
    customerId: dto.customerId,
    customerName: name || 'Client',
    phone: dto.customer?.phone ?? '',
    dateTime: dto.startsAt,
    partySize: dto.partySize,
    table: dto.table
      ? { id: dto.table.id, name: dto.table.name, capacity: dto.table.capacity }
      : undefined,
    status: dto.status as ReservationStatus,
    notes: dto.notes ?? '',
    source: (dto.source as Reservation['source']) ?? undefined,
    restaurant: dto.restaurant ? { id: dto.restaurant.id, name: dto.restaurant.name } : undefined,
    guaranteeMode: (dto.guaranteeMode as Reservation['guaranteeMode']) ?? undefined,
    guaranteeStatus: (dto.guaranteeStatus as Reservation['guaranteeStatus']) ?? undefined,
    guaranteeAmountCents: dto.guaranteeAmountCents ?? undefined,
    pendingTopUp: dto.pendingTopUp ?? undefined,
  };
}

// Champs surchargeables lors d'une mutation PUT (le reste vient du DTO courant).
// `tableId` permet d'affecter (UUID) ou de desaffecter (null) une table sans
// changer le statut. `startsAt` / `endsAt` / `notes` couvrent le flow client
// "je change de créneau" (reschedule).
// `partySize` permet de corriger le nombre de couverts : le back y applique sa
// regle. Une baisse passe, une hausse exige une table libre, et sur une
// reservation payante elle ouvre un complement au lieu de s'appliquer — la
// reponse fait alors foi, pas la valeur demandee.
export interface ReservationRequestOverrides {
  status?: string;
  tableId?: string | null;
  startsAt?: string;
  endsAt?: string;
  partySize?: number;
  notes?: string | null;
}

// Reconstruit le corps d'une mutation (PUT) a partir du DTO courant + surcharges.
// Sans surcharge, le corps est identique au DTO (idempotent).
export function toRequest(
  dto: ReservationDto,
  overrides: ReservationRequestOverrides = {},
): ReservationRequestDto {
  return {
    restaurantId: dto.restaurantId,
    customerId: dto.customerId,
    tableId: overrides.tableId !== undefined ? overrides.tableId : dto.tableId,
    callId: dto.callId,
    startsAt: overrides.startsAt ?? dto.startsAt,
    endsAt: overrides.endsAt ?? dto.endsAt,
    partySize: overrides.partySize ?? dto.partySize,
    status: overrides.status ?? dto.status,
    source: dto.source,
    notes: overrides.notes !== undefined ? overrides.notes : dto.notes,
  };
}
