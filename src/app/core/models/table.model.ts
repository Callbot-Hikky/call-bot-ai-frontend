// Table physique du restaurant (entite "table" cote back, GET /api/tables).
// Le back ne stocke pas de position : le plan de salle la derive (auto-grille).
// Distincte de RestaurantTable (reservation.model.ts) qui n'est que la reference
// minimale embarquee dans une reservation.
export interface FloorTable {
  id: string;
  name: string;
  capacity: number;
  zone?: string | null;
  isActive: boolean;
}

// Forme brute renvoyee par GET /api/tables?restaurantId=...
export interface TableDto {
  id: string;
  restaurantId: string;
  name: string;
  capacity: number;
  zone?: string | null;
  isActive?: boolean;
}

// DTO back -> modele d'affichage (un seul endroit a maintenir).
export function mapTable(dto: TableDto): FloorTable {
  return {
    id: dto.id,
    name: dto.name,
    capacity: dto.capacity,
    zone: dto.zone ?? null,
    isActive: dto.isActive ?? true,
  };
}
