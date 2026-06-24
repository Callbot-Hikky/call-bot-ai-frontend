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

// Reconstruit le corps d'une mutation (PUT) à partir du DTO courant + un nouveau statut.
export function toRequest(dto: ReservationDto, status: string): ReservationRequestDto {
  return {
    restaurantId: dto.restaurantId,
    customerId: dto.customerId,
    tableId: dto.tableId,
    callId: dto.callId,
    startsAt: dto.startsAt,
    endsAt: dto.endsAt,
    partySize: dto.partySize,
    status,
    source: dto.source,
    notes: dto.notes,
  };
}
