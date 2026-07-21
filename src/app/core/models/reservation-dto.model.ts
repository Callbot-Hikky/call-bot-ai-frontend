import { Reservation, ReservationStatus } from './reservation.model';

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
  table?: BackTable | null;
  customer?: BackCustomer | null;
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
    customerName: name || 'Client',
    phone: dto.customer?.phone ?? '',
    dateTime: dto.startsAt,
    partySize: dto.partySize,
    table: dto.table
      ? { id: dto.table.id, name: dto.table.name, capacity: dto.table.capacity }
      : undefined,
    status: dto.status as ReservationStatus,
    notes: dto.notes ?? undefined,
    source: (dto.source as Reservation['source']) ?? undefined,
  };
}

// Champs surchargeables lors d'une mutation PUT (le reste vient du DTO courant).
// `tableId` permet d'affecter (UUID) ou de desaffecter (null) une table sans
// changer le statut.
export interface ReservationRequestOverrides {
  status?: string;
  tableId?: string | null;
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
    startsAt: dto.startsAt,
    endsAt: dto.endsAt,
    partySize: dto.partySize,
    status: overrides.status ?? dto.status,
    source: dto.source,
    notes: dto.notes,
  };
}
