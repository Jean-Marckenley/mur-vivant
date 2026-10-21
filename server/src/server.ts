import express from "express";
import cors from "cors";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { createClient } from "redis";

interface MessageEntrant {
    auteur: string;
    texte: string;
    couleur?: string;
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
const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";

const cleMessages = "mur:messages";
const canalMessages = "mur-messages";
const canalReponses = "mur-reponses";

const app = express();
const serveurHttp = createServer(app);

const io = new Server(serveurHttp, {
    cors: {
        origin: "*",
    },
});

const publicationRedis = createClient({
    url: redisUrl,
    socket: { connectTimeout: 3000, reconnectStrategy: false },
});

const abonnementRedis = publicationRedis.duplicate();

const messages: Message[] = [];

let redisDisponible = false;
let participants = 0;

const nomsConnectes = new Map<string, string>();

function diffuserNoms() {
    io.emit("participants-noms", [...nomsConnectes.values()]);
}

publicationRedis.on("error", (erreur) => {
    console.error("Erreur Redis :", erreur.message);
});

abonnementRedis.on("error", (erreur) => {
    console.error("Erreur Redis :", erreur.message);
});

app.use(cors());
app.use(express.json());

app.get("/", (_req, res) => {
    res.status(200).json({
        message: "Serveur du Mur vivant actif",
        verification: "/api/health",
    });
});

app.get("/api/health", (_req, res) => {
    res.status(200).json({
        statut: "ok",
        redis: redisDisponible,
        participants,
        messages: messages.length,
    });
});
const canalSuppressions = "mur-suppressions";
const motDePasseAdmin = process.env.ADMIN_PASSWORD;

interface SuppressionEntrante {
    motDePasse: string;
    id?: number;
}

type ResultatSuppression = {
    ok: boolean;
    erreur?: string;
};

type ConfirmationSuppression = (
    resultat: ResultatSuppression,
) => void;

function appliquerSuppression(id?: number) {
    if (id === undefined) {
        messages.length = 0;
    } else {
        const index = messages.findIndex((message) => message.id === id);

        if (index !== -1) {
            messages.splice(index, 1);
        }
    }

    io.emit("historique", messages);
}
io.on("connection", (socket) => {
    participants++;

    socket.emit("participants-noms", [...nomsConnectes.values()]);

    socket.on("identifier-participant", (valeur: unknown) => {
        if (typeof valeur !== "string") {
            return;
        }

        const nom = valeur.trim();

        if (nom.length > 30) {
            return;
        }

        if (nom === "") {
            nomsConnectes.delete(socket.id);
        } else {
            nomsConnectes.set(socket.id, nom);
        }

        diffuserNoms();
    });

    console.log("Un participant est connecté");
    console.log(`Participants connectés : ${participants}`);

    io.emit("participants", participants);
    socket.emit("historique", messages);
    socket.on("demander-historique", () => {
        socket.emit("historique", messages);
        socket.emit("participants-noms", [...nomsConnectes.values()]);
    });

    socket.on("nouveau-message", async (message: MessageEntrant) => {
        if (
            typeof message?.auteur !== "string" ||
            typeof message?.texte !== "string"
        ) {
            return;
        }

        const auteur = message.auteur.trim();
        const texte = message.texte.trim();

        if (
            auteur === "" ||
            texte === "" ||
            auteur.length > 30 ||
            texte.length > 120
        ) {
            return;
        }

        const nouveauMessage: Message = {
            id: Date.now(),
            auteur,
            texte,
            couleur: ["#fff3b0", "#d9f2dd", "#fce0e8", "#dbeafe", "#ede9fe"].includes(
                message.couleur ?? "",
            )
                ? message.couleur
                : "#fff3b0",
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
            io.emit("message-ajoute", nouveauMessage);
        }
    });

    socket.on("repondre-message", async (donnees: ReponseEntrante) => {
        if (
            typeof donnees?.id !== "number" ||
            typeof donnees?.reponse !== "string"
        ) {
            return;
        }

        const reponse = donnees.reponse.trim();

        if (reponse === "" || reponse.length > 250) {
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
            io.emit("message-modifie", messageModifie);
        }
    });
    async function supprimerMessages(
        donnees: SuppressionEntrante,
        confirmer: ConfirmationSuppression,
        toutSupprimer: boolean,
    ) {
        if (typeof confirmer !== "function") {
            return;
        }

        if (
            !motDePasseAdmin ||
            donnees?.motDePasse !== motDePasseAdmin
        ) {
            confirmer({
                ok: false,
                erreur: "Mot de passe administrateur incorrect.",
            });
            return;
        }

        if (
            !toutSupprimer &&
            !Number.isSafeInteger(donnees?.id)
        ) {
            confirmer({ ok: false, erreur: "Message invalide." });
            return;
        }

        const id = toutSupprimer ? undefined : donnees.id;

        try {
            if (redisDisponible) {
                if (toutSupprimer) {
                    await publicationRedis
                        .multi()
                        .del(cleMessages)
                        .publish(canalSuppressions, JSON.stringify({ tout: true }))
                        .exec();
                } else {
                    const historique = await publicationRedis.lRange(
                        cleMessages,
                        0,
                        -1,
                    );

                    const contenus = historique.filter((contenu) => {
                        try {
                            return (JSON.parse(contenu) as Message).id === id;
                        } catch {
                            return false;
                        }
                    });

                    if (contenus.length === 0) {
                        confirmer({
                            ok: false,
                            erreur: "Ce message n’existe plus.",
                        });
                        return;
                    }

                    const transaction = publicationRedis.multi();

                    for (const contenu of contenus) {
                        transaction.lRem(cleMessages, 0, contenu);
                    }

                    await transaction
                        .publish(canalSuppressions, JSON.stringify({ id }))
                        .exec();
                }
            }

            appliquerSuppression(id);
            confirmer({ ok: true });
        } catch (erreur) {
            console.error("Suppression impossible :", erreur);
            confirmer({
                ok: false,
                erreur: "La suppression a échoué. Réessayez.",
            });
        }
    }

    socket.on(
        "supprimer-message",
        (donnees: SuppressionEntrante, confirmer: ConfirmationSuppression) => {
            void supprimerMessages(donnees, confirmer, false);
        },
    );

    socket.on(
        "vider-mur",
        (donnees: SuppressionEntrante, confirmer: ConfirmationSuppression) => {
            void supprimerMessages(donnees, confirmer, true);
        },
    );
    socket.on("disconnect", () => {
        nomsConnectes.delete(socket.id);
        diffuserNoms();
        participants = Math.max(0, participants - 1);

        console.log("Un participant est déconnecté");
        console.log(`Participants connectés : ${participants}`);

        io.emit("participants", participants);
    });
});

async function demarrerServeur() {
    try {
        await publicationRedis.connect();
        await abonnementRedis.connect();

        const historiqueRedis = await publicationRedis.lRange(cleMessages, 0, -1);

        for (const contenu of historiqueRedis) {
            try {
                const message = JSON.parse(contenu) as Message;
                messages.push(message);
            } catch {
                console.error("Message Redis invalide ignoré");
            }
        }

        await abonnementRedis.subscribe(canalMessages, (contenu) => {
            try {
                const message = JSON.parse(contenu) as Message;

                messages.push(message);

                if (messages.length > 50) {
                    messages.shift();
                }

                io.emit("message-ajoute", message);
            } catch {
                console.error("Message Redis invalide ignoré");
            }
        });

        await abonnementRedis.subscribe(canalReponses, (contenu) => {
            try {
                const messageModifie = JSON.parse(contenu) as Message;

                const indexMessage = messages.findIndex(
                    (message) => message.id === messageModifie.id,
                );

                if (indexMessage !== -1) {
                    messages[indexMessage] = messageModifie;
                }

                io.emit("message-modifie", messageModifie);
            } catch {
                console.error("Réponse Redis invalide ignorée");
            }
        });

        redisDisponible = true;

        console.log(
            `Connexion Redis réussie : ${messages.length} message(s) chargé(s)`,
        );
    } catch (erreur) {
        console.error("Redis indisponible, fonctionnement sans Redis", erreur);
    }

    serveurHttp.listen(port, "0.0.0.0", () => {
        console.log(`Serveur démarré sur http://localhost:${port}`);
    });
}

void demarrerServeur();
