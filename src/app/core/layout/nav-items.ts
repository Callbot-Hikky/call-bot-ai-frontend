export interface NavItem {
  icon: string;
  label: string;
  route: string;
  // Sous-entrees affichees « en escalier » sous le parent (sidebar). Le parent
  // d'un groupe n'est pas un lien : ce sont les enfants qui naviguent.
  children?: NavItem[];
}

// Source unique de la navigation principale (sidebar desktop + drawer mobile).
export const NAV_ITEMS: NavItem[] = [
  { icon: 'lucideLayoutDashboard', label: 'Tableau de bord', route: '/dashboard' },
  {
    icon: 'lucideCalendar',
    label: 'Réservations',
    route: '/reservations',
    children: [
      { icon: 'lucideList', label: 'Liste du jour', route: '/reservations' },
      { icon: 'lucideGrid2x2', label: 'Plan de salle', route: '/plan' },
    ],
  },
  { icon: 'lucidePhone', label: 'Appels', route: '/appels' },
  { icon: 'lucideStore', label: 'Mon restaurant', route: '/mon-restaurant' },
  { icon: 'lucideSettings', label: 'Paramètres', route: '/parametres' },
];

// Navigation A PLAT (drawer mobile) : les groupes sont remplaces par leurs
// enfants - sur mobile, pas de hierarchie, chaque ecran est une entree directe.
export const FLAT_NAV_ITEMS: NavItem[] = NAV_ITEMS.flatMap((item) => item.children ?? [item]);
