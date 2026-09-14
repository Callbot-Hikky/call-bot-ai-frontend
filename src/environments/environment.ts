export const environment = {
  production: true,
  apiUrl: '/api',
  useMock: false,
  // DID Telnyx du pilote, en dur tant que la table `phone_numbers` et
  // `GET /api/telephony/forwarding` n'existent pas. Le `+` est obligatoire :
  // Bouygues refuse le format national dans un code MMI.
  // Un seul numéro pour tous les restaurants — à remplacer par l'endpoint
  // dès qu'un deuxième restaurant arrive, sinon leurs appels se mélangent.
  forwardingDid: '+33974067183',
};
