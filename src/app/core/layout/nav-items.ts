export interface NavItem {
  icon: string;
  label: string;
  route: string;
}

// Source unique de la navigation principale (sidebar desktop + drawer mobile).
export const NAV_ITEMS: NavItem[] = [
  { icon: 'lucideLayoutDashboard', label: 'Tableau de bord', route: '/dashboard' },
  { icon: 'lucideCalendar', label: 'Réservations', route: '/reservations' },
  { icon: 'lucidePhone', label: 'Appels', route: '/appels' },
  { icon: 'lucideSettings', label: 'Paramètres', route: '/parametres' },
];
