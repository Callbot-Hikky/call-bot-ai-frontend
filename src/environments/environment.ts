export const environment = {
  production: true,
  apiUrl: '/api',
  useMock: false,
  // Repli si le backend ne renvoie pas encore de DID. Vide en production :
  // mieux vaut afficher « numéro en cours d'attribution » qu'un mauvais numéro.
  forwardingDid: '',
};
