import { HttpErrorResponse } from '@angular/common/http';

// Menu du restaurant : ce que le restaurateur publie (PDF, images ou saisie) et
// ce que le client lit. Le document de saisie est stocke tel quel par le back
// (JSONB opaque), donc SA FORME EST DECIDEE ICI : version + sections + plats.

export type MenuMode = 'none' | 'pdf' | 'images' | 'manual';
export type MenuFileKind = 'pdf' | 'image';

export interface MenuFile {
  id: string;
  kind: MenuFileKind;
  contentType: string;
  position: number;
  sizeBytes: number;
  // URL admin (apercu, session requise) cote restaurateur, URL publique cote client.
  url: string;
}

export interface MenuLimits {
  pdfMaxBytes: number;
  imageMaxBytes: number;
  imageMaxCount: number;
}

export interface ManualItem {
  name: string;
  description: string;
  // Prix normalise « 12.50 », ou chaine vide : le prix est optionnel.
  price: string;
}

export interface ManualSection {
  name: string;
  items: ManualItem[];
}

export interface ManualMenu {
  version: 1;
  sections: ManualSection[];
}

export interface Menu {
  restaurantId: string;
  mode: MenuMode;
  manual: ManualMenu;
  files: MenuFile[];
  limits: MenuLimits;
}

// Memes valeurs que MenuLimits.DEFAULT cote back ; le back renvoie les siennes
// dans chaque reponse admin et elles font foi.
export const DEFAULT_LIMITS: MenuLimits = {
  pdfMaxBytes: 10 * 1024 * 1024,
  imageMaxBytes: 5 * 1024 * 1024,
  imageMaxCount: 8,
};

// Bornes de la saisie. Une seule source, lue par le formulaire et par la validation.
export const MANUAL_LIMITS = {
  sectionName: 60,
  itemName: 80,
  description: 200,
  sections: 20,
  itemsPerSection: 50,
} as const;

export const MODE_LABELS: Record<MenuMode, string> = {
  none: 'aucun',
  pdf: 'PDF',
  images: 'photos',
  manual: 'saisie manuelle',
};

export function emptyManual(): ManualMenu {
  return { version: 1, sections: [] };
}

// Le back renvoie le document tel qu'il a ete stocke : on ne fait confiance a sa
// forme qu'apres verification. Un document inattendu = menu vide, jamais un plantage.
export function isManualMenu(value: unknown): value is ManualMenu {
  if (!value || typeof value !== 'object') return false;
  const doc = value as { version?: unknown; sections?: unknown };
  if (doc.version !== 1 || !Array.isArray(doc.sections)) return false;
  return doc.sections.every(
    (s) =>
      s &&
      typeof s === 'object' &&
      typeof (s as ManualSection).name === 'string' &&
      Array.isArray((s as ManualSection).items) &&
      (s as ManualSection).items.every(
        (i) =>
          i &&
          typeof i === 'object' &&
          typeof (i as ManualItem).name === 'string' &&
          typeof (i as ManualItem).description === 'string' &&
          typeof (i as ManualItem).price === 'string',
      ),
  );
}

// --- Helpers immuables : chaque appel renvoie un nouveau document. -------------

export function addSection(menu: ManualMenu, name = ''): ManualMenu {
  if (menu.sections.length >= MANUAL_LIMITS.sections) {
    return menu;
  }
  return { ...menu, sections: [...menu.sections, { name, items: [] }] };
}

export function removeSection(menu: ManualMenu, index: number): ManualMenu {
  return { ...menu, sections: menu.sections.filter((_, i) => i !== index) };
}

export function updateSection(menu: ManualMenu, index: number, name: string): ManualMenu {
  return {
    ...menu,
    sections: menu.sections.map((s, i) => (i === index ? { ...s, name } : s)),
  };
}

export function addItem(menu: ManualMenu, sectionIndex: number): ManualMenu {
  return {
    ...menu,
    sections: menu.sections.map((s, i) => {
      if (i !== sectionIndex || s.items.length >= MANUAL_LIMITS.itemsPerSection) {
        return s;
      }
      return { ...s, items: [...s.items, { name: '', description: '', price: '' }] };
    }),
  };
}

export function removeItem(menu: ManualMenu, sectionIndex: number, itemIndex: number): ManualMenu {
  return {
    ...menu,
    sections: menu.sections.map((s, i) =>
      i === sectionIndex ? { ...s, items: s.items.filter((_, j) => j !== itemIndex) } : s,
    ),
  };
}

// Rogne les espaces et normalise le prix ; un prix invalide est garde tel quel
// pour que la validation puisse le signaler, au lieu d'etre efface en silence.
export function updateItem(
  menu: ManualMenu,
  sectionIndex: number,
  itemIndex: number,
  patch: Partial<ManualItem>,
): ManualMenu {
  return {
    ...menu,
    sections: menu.sections.map((s, i) => {
      if (i !== sectionIndex) return s;
      return {
        ...s,
        items: s.items.map((item, j) => {
          if (j !== itemIndex) return item;
          const next = { ...item, ...patch };
          if (patch.name !== undefined) next.name = patch.name.trim();
          if (patch.description !== undefined) next.description = patch.description.trim();
          if (patch.price !== undefined)
            next.price = normalizePrice(patch.price) ?? patch.price.trim();
          return next;
        }),
      };
    }),
  };
}

// « 12 », « 12.5 », « 12,50 » -> « 12.50 » ; vide -> vide ; sinon null.
// Quatre chiffres max avant la virgule : personne ne vend un plat 10 000 euros.
const PRICE_PATTERN = /^\d{1,4}(?:[.,]\d{1,2})?$/;

export function normalizePrice(input: string): string | null {
  const raw = input.trim();
  if (raw === '') return '';
  if (!PRICE_PATTERN.test(raw)) return null;
  return Number(raw.replace(',', '.')).toFixed(2);
}

// Liste de messages en francais ; vide = document publiable.
export function validateManual(menu: ManualMenu): string[] {
  const errors: string[] = [];
  if (menu.sections.length > MANUAL_LIMITS.sections) {
    errors.push(`${MANUAL_LIMITS.sections} sections maximum.`);
  }
  menu.sections.forEach((section, s) => {
    const label = section.name.trim() || `section ${s + 1}`;
    if (section.name.trim() === '') {
      errors.push(`La section ${s + 1} n'a pas de nom.`);
    } else if (section.name.length > MANUAL_LIMITS.sectionName) {
      errors.push(
        `Le nom de la section « ${label} » dépasse ${MANUAL_LIMITS.sectionName} caractères.`,
      );
    }
    if (section.items.length > MANUAL_LIMITS.itemsPerSection) {
      errors.push(`${MANUAL_LIMITS.itemsPerSection} plats maximum dans « ${label} ».`);
    }
    section.items.forEach((item, i) => {
      if (item.name.trim() === '') {
        errors.push(`Le plat ${i + 1} de « ${label} » n'a pas de nom.`);
      } else if (item.name.length > MANUAL_LIMITS.itemName) {
        errors.push(
          `Le nom du plat « ${item.name.slice(0, 20)}… » dépasse ${MANUAL_LIMITS.itemName} caractères.`,
        );
      }
      if (item.description.length > MANUAL_LIMITS.description) {
        errors.push(
          `La description de « ${item.name || `plat ${i + 1}`} » dépasse ${MANUAL_LIMITS.description} caractères.`,
        );
      }
      if (item.price !== '' && normalizePrice(item.price) === null) {
        errors.push(`Le prix de « ${item.name || `plat ${i + 1}`} » n'est pas valide (ex. 12.50).`);
      }
    });
  });
  return errors;
}

// --- Fichiers : memes signatures que le back (MenuFileType.java). -------------

export type MenuFileType = 'pdf' | 'jpeg' | 'png' | 'webp';

export const FILE_TYPE_MIME: Record<MenuFileType, string> = {
  pdf: 'application/pdf',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

const ASCII = (s: string): number[] => Array.from(s, (c) => c.charCodeAt(0));
const PDF_MAGIC = ASCII('%PDF-');
const JPEG_MAGIC = [0xff, 0xd8, 0xff];
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const RIFF_MAGIC = ASCII('RIFF');
const WEBP_MAGIC = ASCII('WEBP');

function startsWith(bytes: Uint8Array, offset: number, magic: number[]): boolean {
  if (bytes.length < offset + magic.length) return false;
  return magic.every((b, i) => bytes[offset + i] === b);
}

// Detection sur les 12 premiers octets, jamais sur l'extension ni le type annonce.
export function detectFileType(bytes: Uint8Array): MenuFileType | null {
  if (bytes.length < 12) return null;
  if (startsWith(bytes, 0, PDF_MAGIC)) return 'pdf';
  if (startsWith(bytes, 0, JPEG_MAGIC)) return 'jpeg';
  if (startsWith(bytes, 0, PNG_MAGIC)) return 'png';
  if (startsWith(bytes, 0, RIFF_MAGIC) && startsWith(bytes, 8, WEBP_MAGIC)) return 'webp';
  return null;
}

// --- Erreurs du back -> francais (meme principe que conflictMessage). ---------

export const MENU_ERROR_MESSAGES: Record<string, string> = {
  unsupported_file_type: 'Seuls les fichiers PDF, JPEG, PNG et WebP sont acceptés.',
  file_too_large: 'Fichier trop volumineux : 10 Mo maximum pour un PDF, 5 Mo pour une image.',
  too_many_files: 'Vous avez atteint la limite de 8 images.',
  mode_not_ready: "Ajoutez d'abord du contenu avant de publier ce mode.",
  invalid_manual: 'Le menu saisi est mal formé.',
  invalid_file_order: "L'ordre des images est incomplet, rechargez la page.",
  forbidden: "Ce restaurant n'appartient pas à votre compte.",
};

export function menuErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof HttpErrorResponse) {
    const code = (err.error as { error?: string } | null)?.error;
    if (code && MENU_ERROR_MESSAGES[code]) {
      return MENU_ERROR_MESSAGES[code];
    }
  }
  return fallback;
}

// --- Page publique --------------------------------------------------------------

export interface PublicMenu {
  restaurantName: string;
  mode: MenuMode;
  // null quand le mode publie n'est pas la saisie, ou si le document est inattendu.
  manual: ManualMenu | null;
  files: MenuFile[];
}

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const PUBLIC_FILE_URL = new RegExp(`^/api/public/restaurants/${UUID}/menu/files/${UUID}$`, 'i');

// Seules nos propres URL de fichiers publics peuvent etre incorporees dans un cadre :
// un chemin relatif, sur notre origine, avec deux identifiants au format strict.
export function isSafePublicFileUrl(url: string): boolean {
  return PUBLIC_FILE_URL.test(url);
}

// « 18.50 » stocke -> « 18,50 » affiche, virgule francaise.
export function formatPrice(price: string): string {
  return price ? price.replace('.', ',') : '';
}
