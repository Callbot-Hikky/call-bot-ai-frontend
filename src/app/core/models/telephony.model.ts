/**
 * Renvoi d'appel : ce que le restaurateur doit composer sur sa propre ligne.
 *
 * <p>Le restaurateur garde son numéro public. On ne peut pas y faire répondre
 * l'assistant — ce numéro appartient à son opérateur. On lui attribue donc un
 * numéro dédié (le DID) et il active un renvoi de sa ligne vers ce DID.
 * Le client compose toujours le numéro du restaurant et ne voit jamais le DID.
 */

export type ForwardMode = 'safety_net' | 'front_line';

export interface ForwardingSetup {
  /** Numéro dédié attribué au restaurant, format E.164. */
  did: string;
  mode: ForwardMode;
  /** Sonneries chez le restaurateur avant bascule, en secondes (mode filet seulement). */
  ringSeconds: number;
  /** Renseigné au premier appel réellement reçu sur le DID. */
  verifiedAt: string | null;
}

export interface MmiCode {
  label: string;
  code: string;
  hint?: string;
}

/**
 * Délai de bascule par défaut, en secondes.
 *
 * <p>20 s semble naturel (~4 sonneries) mais c'est précisément le délai auquel la
 * messagerie vocale des opérateurs se déclenche : à égalité, c'est elle qui gagne et
 * l'appel ne parvient jamais à l'assistant. 10 s passe devant sans frustrer l'appelant.
 */
export const DEFAULT_RING_SECONDS = 10;

/** Valeurs acceptées par les opérateurs : multiples de 5, de 5 à 30 secondes. */
export const RING_SECONDS_CHOICES = [5, 10, 15, 20, 25, 30] as const;

/**
 * Met le numéro sous la forme que les opérateurs acceptent dans un code MMI.
 *
 * <p>Vérifié en conditions réelles : Bouygues refuse le format national
 * (`0974067183` → « Erreur d'exécution de la requête ») et n'accepte que
 * l'international avec le `+`. Par ailleurs le trunk restitue le DID tantôt avec
 * le `+`, tantôt sans — d'où la normalisation systématique ici plutôt qu'à
 * chaque appel.
 */
export function toDialableDid(did: string): string {
  const digits = did.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) {
    return digits;
  }
  // 0X XX XX XX XX → +33X XX XX XX XX
  if (digits.startsWith('0')) {
    return `+33${digits.slice(1)}`;
  }

  return `+${digits}`;
}

/** Affichage lisible : +33974067183 → +33 9 74 06 71 83 */
export function formatDidForDisplay(did: string): string {
  const dialable = toDialableDid(did);
  if (!dialable.startsWith('+33') || dialable.length !== 12) {
    return dialable;
  }
  const rest = dialable.slice(3);

  return `+33 ${rest[0]} ${rest.slice(1).replace(/(\d{2})(?=\d)/g, '$1 ')}`.trim();
}

/**
 * Codes à composer pour activer le renvoi.
 *
 * <p>En mode filet de sécurité il en faut **deux** : « sans réponse » ne couvre pas
 * le cas où la ligne est déjà occupée, ce qui est fréquent en plein service — et
 * c'est exactement le moment où l'assistant est le plus utile.
 */
export function activationCodes(
  did: string,
  mode: ForwardMode,
  ringSeconds: number = DEFAULT_RING_SECONDS,
): MmiCode[] {
  const n = toDialableDid(did);

  if (mode === 'front_line') {
    return [
      {
        label: 'Tous les appels',
        code: `**21*${n}#`,
        hint: 'Votre téléphone ne sonnera plus : l’assistant décroche à votre place.',
      },
    ];
  }

  return [
    {
      label: 'Si personne ne décroche',
      code: `**61*${n}**${ringSeconds}#`,
      hint: `L’assistant prend le relais après ${ringSeconds} secondes.`,
    },
    {
      label: 'Si la ligne est occupée',
      code: `**67*${n}#`,
      hint: 'Le cas le plus fréquent en plein service.',
    },
  ];
}

/** Codes à composer pour rendre la ligne à son fonctionnement normal. */
export function cancellationCodes(mode: ForwardMode): MmiCode[] {
  if (mode === 'front_line') {
    return [{ label: 'Tous les appels', code: '##21#' }];
  }

  return [
    { label: 'Si personne ne décroche', code: '##61#' },
    { label: 'Si la ligne est occupée', code: '##67#' },
  ];
}

/** Filet de sécurité universel, si le restaurateur ne sait plus ce qu'il a activé. */
export const CANCEL_ALL_CODE = '##002#';

/**
 * Lien `tel:` qui compose directement le code MMI depuis le mobile.
 *
 * <p>Seul le `#` est encodé : dans une URI, il ouvrirait sinon un fragment et la
 * partie qui le suit serait perdue. Le `+`, lui, doit rester littéral — c'est le
 * préfixe international, et l'encoder ferait échouer le code.
 *
 * <p>Sur mobile, un tap suffit donc à activer le renvoi : c'est ce qui évite au
 * restaurateur de recopier une suite d'étoiles et de dièses à la main.
 */
export function mmiHref(code: string): string {
  return `tel:${code.replace(/#/g, '%23')}`;
}
