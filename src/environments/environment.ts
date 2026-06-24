// Environnement de production (utilisé par défaut au build et par les tests).
// useMock=true : les services renvoient les données de test (pas d'appel réseau).
export const environment = {
  production: true,
  apiUrl: 'https://api.callbot.example.com',
  useMock: true,
  restaurantId: '',
  // Auto-login de dev uniquement (l'authentification réelle est gérée ailleurs).
  devAuth: null as { email: string; password: string } | null,
};
