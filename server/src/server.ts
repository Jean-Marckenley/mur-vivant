import express from 'express';
import cors from 'cors';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { createClient } from 'redis';

interface MessageEntrant {
    auteur: string;
    texte: string;
}

interface ReponseEntrante {
    id: number;
    reponse: string;
}

interface Message extends MessageEntrant {
    id: number;
    date: string;
    reponse?: string;
}

const port = Number(process.env.PORT ?? 3001);
const redisUrl =
    process.env.REDIS_URL ?? 'redis://localhost:6379';

const cleMessages = 'mur:messages';
const canalMessages = 'mur-messages';
const canalReponses = 'mur-reponses';

const app = express();
const serveurHttp = createServer(app);

const io = new Server(serveurHttp, {
    cors: {
        origin: '*',
    },
});

const publicationRedis = createClient({
    url: redisUrl,
});

const abonnementRedis = publicationRedis.duplicate();

const messages: Message[] = [];

let redisDisponible = false;
let participants = 0;

publicationRedis.on('error', (erreur) => {
    console.error('Erreur Redis :', erreur.message);
});

abonnementRedis.on('error', (erreur) => {
    console.error('Erreur Redis :', erreur.message);
});

app.use(cors());
app.use(express.json());

app.get('/', (_req, res) => {
    res.status(200).json({
        message: 'Serveur du Mur vivant actif',
        verification: '/api/health',
    });
});

app.get('/api/health', (_req, res) => {
    res.status(200).json({
        statut: 'ok',
        redis: redisDisponible,
        participants,
        messages: messages.length,
    });
});

io.on('connection', (socket) => {
    participants++;

    console.log('Un participant est connecté');
    console.log(`Participants connectés : ${participants}`);

    io.emit('participants', participants);
    socket.emit('historique', messages);

    socket.on(
        'nouveau-message',
        async (message: MessageEntrant) => {
            if (
                typeof message?.auteur !== 'string' ||
                typeof message?.texte !== 'string'
            ) {
                return;
            }

            const auteur = message.auteur.trim();
            const texte = message.texte.trim();

            if (
                auteur === '' ||
                texte === '' ||
                auteur.length > 30 ||
                texte.length > 120
            ) {
                return;
            }

            const nouveauMessage: Message = {
                id: Date.now(),
                auteur,
                texte,
                date: new Date().toISOString(),
            };

            if (redisDisponible) {
                const messageJson = JSON.stringify(nouveauMessage);

                await publicationRedis
                    .multi()
                    .rPush(cleMessages, messageJson)
                    .lTrim(cleMessages, -50, -1)
                    .publish(canalMessages, messageJson)
                    .exec();
            } else {
                messages.push(nouveauMessage);
                io.emit('message-ajoute', nouveauMessage);
            }
        },
    );

    socket.on(
        'repondre-message',
        async (donnees: ReponseEntrante) => {
            if (
                typeof donnees?.id !== 'number' ||
                typeof donnees?.reponse !== 'string'
            ) {
                return;
            }

            const reponse = donnees.reponse.trim();

            if (reponse === '' || reponse.length > 250) {
                return;
            }

            const indexMessage = messages.findIndex(
                (message) => message.id === donnees.id,
            );

            if (indexMessage === -1) {
                return;
            }

            const messageActuel = messages[indexMessage];

            if (!messageActuel) {
                return;
            }

            const messageModifie: Message = {
                ...messageActuel,
                reponse,
            };

            messages[indexMessage] = messageModifie;

            if (redisDisponible) {
                const messageJson = JSON.stringify(messageModifie);

                await publicationRedis
                    .multi()
                    .lSet(cleMessages, indexMessage, messageJson)
                    .publish(canalReponses, messageJson)
                    .exec();
            } else {
                io.emit('message-modifie', messageModifie);
            }
        },
    );

    socket.on('disconnect', () => {
        participants = Math.max(0, participants - 1);

        console.log('Un participant est déconnecté');
        console.log(`Participants connectés : ${participants}`);

        io.emit('participants', participants);
    });
});

async function demarrerServeur() {
    try {
        await publicationRedis.connect();
        await abonnementRedis.connect();

        const historiqueRedis =
            await publicationRedis.lRange(cleMessages, 0, -1);

        for (const contenu of historiqueRedis) {
            try {
                const message = JSON.parse(contenu) as Message;
                messages.push(message);
            } catch {
                console.error('Message Redis invalide ignoré');
            }
        }

        await abonnementRedis.subscribe(
            canalMessages,
            (contenu) => {
                try {
                    const message = JSON.parse(contenu) as Message;

                    messages.push(message);

                    if (messages.length > 50) {
                        messages.shift();
                    }

                    io.emit('message-ajoute', message);
                } catch {
                    console.error('Message Redis invalide ignoré');
                }
            },
        );

        await abonnementRedis.subscribe(
            canalReponses,
            (contenu) => {
                try {
                    const messageModifie =
                        JSON.parse(contenu) as Message;

                    const indexMessage = messages.findIndex(
                        (message) =>
                            message.id === messageModifie.id,
                    );

                    if (indexMessage !== -1) {
                        messages[indexMessage] = messageModifie;
                    }

                    io.emit('message-modifie', messageModifie);
                } catch {
                    console.error('Réponse Redis invalide ignorée');
                }
            },
        );

        redisDisponible = true;

        console.log(
            `Connexion Redis réussie : ${messages.length} message(s) chargé(s)`,
        );
    } catch (erreur) {
        console.error(
            'Redis indisponible, fonctionnement sans Redis',
            erreur,
        );
    }

    serveurHttp.listen(port, '0.0.0.0', () => {
        console.log(`Serveur démarré sur http://localhost:${port}`);
    });
}

void demarrerServeur();