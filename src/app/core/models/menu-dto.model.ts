import {
  DEFAULT_LIMITS,
  Menu,
  MenuFile,
  MenuLimits,
  MenuMode,
  PublicMenu,
  emptyManual,
  isManualMenu,
  withManualKeys,
} from './menu.model';

// Formes EXACTES des reponses du back (MenuResponse, MenuFileResponse, MenuLimits).
export interface MenuFileDto {
  id: string;
  kind: 'pdf' | 'image';
  contentType: string;
  position: number;
  sizeBytes: number;
  url: string;
}

export interface MenuDto {
  restaurantId: string;
  mode: MenuMode;
  manual: unknown;
  files: MenuFileDto[];
  limits?: MenuLimits;
}

// DTO -> modele d'affichage. Le document de saisie est verifie avant d'etre
// accepte : un contenu inattendu devient un menu vide, jamais une erreur d'ecran.
export function mapMenu(dto: MenuDto): Menu {
  return {
    restaurantId: dto.restaurantId,
    mode: dto.mode,
    manual: isManualMenu(dto.manual) ? withManualKeys(dto.manual) : emptyManual(),
    files: dto.files.map(mapFile),
    limits: dto.limits ?? DEFAULT_LIMITS,
  };
}

function mapFile(dto: MenuFileDto): MenuFile {
  return {
    id: dto.id,
    kind: dto.kind,
    contentType: dto.contentType,
    position: dto.position,
    sizeBytes: dto.sizeBytes,
    url: dto.url,
  };
}

// Forme EXACTE de PublicMenuResponse cote back.
export interface PublicMenuDto {
  restaurantName: string;
  mode: MenuMode;
  manual: unknown;
  files: MenuFileDto[];
}

export function mapPublicMenu(dto: PublicMenuDto): PublicMenu {
  return {
    restaurantName: dto.restaurantName,
    mode: dto.mode,
    manual: isManualMenu(dto.manual) ? withManualKeys(dto.manual) : null,
    files: dto.files.map(mapFile),
  };
}
