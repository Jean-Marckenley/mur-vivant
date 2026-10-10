# Le Mur vivant

Application interactive permettant aux participants d’envoyer un message depuis leur téléphone et de le voir apparaître instantanément sur un grand écran.

## Technologies

- React
- TypeScript
- Express
- Socket.io
- Redis Pub/Sub
- Docker Compose
- QR Code

## Fonctionnalités

- Envoi de messages en temps réel
- Compteur de participants connectés
- QR code pour accéder au formulaire
- Mur d’affichage séparé
- Conservation des 50 derniers messages dans Redis
- Serveur Express et Redis conteneurisés

## Structure

```text
mur-vivant/
├── client/
├── server/
├── docker-compose.yml
├── .gitignore
└── README.md
```

## Installation du client

```powershell
cd client
npm install
npm run dev -- --host
```

## Démarrage du serveur et de Redis

Depuis la racine du projet :

```powershell
docker compose up -d --build
docker compose ps
```

## Adresses locales

- Formulaire : `http://localhost:5173/`
- Mur : `http://localhost:5173/mur`
- Santé du serveur : `http://localhost:3001/api/health`

Pour utiliser un téléphone, ouvrir l’adresse réseau affichée par Vite. Le téléphone et l’ordinateur doivent utiliser le même réseau.

## Compilation

Client :

```powershell
cd client
npm run build
```

Serveur :

```powershell
cd server
npm run build
```

## Arrêt

Depuis la racine :

```powershell
docker compose down
```

Le volume Docker `redisdata` conserve les messages Redis.