// Environnement de développement (remplace environment.ts en mode dev).
// useMock=false : on parle au vrai backend Spring Boot lancé en local.
export const environment = {
  production: false,
  // Relatif : ng serve proxifie /api vers le back (voir proxy.config.json), pas de CORS.
  apiUrl: '/api',
  useMock: false,
  restaurantId: '22b60047-3341-4b71-bed8-e22bc08c3603',
};
