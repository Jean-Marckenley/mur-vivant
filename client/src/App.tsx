import {
    useEffect,
    useState,
    type FormEvent,
} from 'react';
import { QRCodeSVG } from 'qrcode.react';

import { socket } from './socket';
import type { Message } from './types';
import './App.css';

function App() {
    const [auteur, setAuteur] = useState('');
    const [texte, setTexte] = useState('');
    const [messages, setMessages] = useState<Message[]>([]);
    const [participants, setParticipants] = useState<string[]>([]);
    const [reponses, setReponses] = useState<Record<number, string>>({});
    const [suppressionEnCours, setSuppressionEnCours] = useState(false);

    const chemin = window.location.pathname;
    const modeMur = chemin === '/mur';
    const modeAdmin = chemin === '/admin';
    const adresseParticipation = window.location.origin;

    useEffect(() => {
        function recevoirHistorique(historique: Message[]) {
            setMessages(historique);
        }

        function ajouterMessage(message: Message) {
            setMessages((anciens) => [
                ...anciens.filter((ancien) => ancien.id !== message.id),
                message,
            ]);
        }

        function modifierMessage(messageModifie: Message) {
            setMessages((anciens) =>
                anciens.map((message) =>
                    message.id === messageModifie.id
                        ? messageModifie
                        : message,
                ),
            );
        }

        function recevoirParticipants(noms: string[]) {
            setParticipants(noms);
        }

        function demanderHistorique() {
            socket.emit('demander-historique');
        }

        socket.on('historique', recevoirHistorique);
        socket.on('message-ajoute', ajouterMessage);
        socket.on('message-modifie', modifierMessage);
        socket.on('participants-noms', recevoirParticipants);
        socket.on('connect', demanderHistorique);

        if (socket.connected) {
            demanderHistorique();
        }

        return () => {
            socket.off('historique', recevoirHistorique);
            socket.off('message-ajoute', ajouterMessage);
            socket.off('message-modifie', modifierMessage);
            socket.off('participants-noms', recevoirParticipants);
            socket.off('connect', demanderHistorique);
        };
    }, []);

    useEffect(() => {
        if (modeMur || modeAdmin) {
            return;
        }

        function identifierParticipant() {
            socket.emit('identifier-participant', auteur.trim());
        }

        socket.on('connect', identifierParticipant);

        const delai = window.setTimeout(() => {
            if (socket.connected) {
                identifierParticipant();
            }
        }, 500);

        return () => {
            window.clearTimeout(delai);
            socket.off('connect', identifierParticipant);
        };
    }, [auteur, modeMur, modeAdmin]);

    function envoyerMessage(e: FormEvent<HTMLFormElement>) {
        e.preventDefault();

        const nom = auteur.trim();
        const contenu = texte.trim();

        if (!nom || !contenu) {
            return;
        }

        socket.emit('identifier-participant', nom);

        socket.emit('nouveau-message', {
            auteur: nom,
            texte: contenu,
        });

        setTexte('');
    }

    function envoyerReponse(
        e: FormEvent<HTMLFormElement>,
        id: number,
    ) {
        e.preventDefault();

        const reponse = reponses[id]?.trim();

        if (!reponse) {
            return;
        }

        socket.emit('repondre-message', {
            id,
            reponse,
        });

        setReponses((anciennes) => ({
            ...anciennes,
            [id]: '',
        }));
    }

    function supprimerMessage(id?: number) {
        if (suppressionEnCours) {
            return;
        }

        if (!socket.connected) {
            window.alert('Le serveur est déconnecté. Réessayez après la reconnexion.');
            return;
        }

        const accepter = window.confirm(
            id === undefined
                ? 'Supprimer définitivement tous les messages et leurs réponses ?'
                : 'Supprimer définitivement ce message et sa réponse ?',
        );

        if (!accepter) {
            return;
        }

        const motDePasse = window.prompt(
            'Mot de passe administrateur :',
        );

        if (!motDePasse) {
            return;
        }

        setSuppressionEnCours(true);

        socket.timeout(8000).emit(
            id === undefined ? 'vider-mur' : 'supprimer-message',
            { id, motDePasse },
            (
                erreur: Error | null,
                resultat?: { ok: boolean; erreur?: string },
            ) => {
                setSuppressionEnCours(false);

                if (erreur) {
                    window.alert(
                        'Pas de confirmation du serveur. Vérifiez le mur avant de réessayer.',
                    );
                    return;
                }

                if (!resultat?.ok) {
                    window.alert(
                        resultat?.erreur ?? 'Suppression impossible.',
                    );
                }
            },
        );
    }

    const nomsParticipants = participants.length > 0
        ? `${participants.length} participant(s) en ligne : ${participants.join(', ')}`
        : 'Aucun participant en ligne';

    /* Espace administrateur */

    if (modeAdmin) {
        return (
            <main className="page-admin">
                <header>
                    <p>ESPACE ANIMATEUR</p>
                    <h1>Répondre aux participants</h1>
                    <p>{nomsParticipants}</p>
                </header>

                <button
                    type="button"
                    className="bouton-danger"
                    onClick={() => supprimerMessage()}
                    disabled={messages.length === 0 || suppressionEnCours}
                >
                    {suppressionEnCours
                        ? 'Suppression en cours…'
                        : 'Vider tout le mur'}
                </button>

                <section className="liste-messages-admin">
                    {messages.length === 0 && (
                        <p>Aucun message pour le moment.</p>
                    )}

                    {messages.map((message) => (
                        <article key={message.id}>
                            <strong>{message.auteur}</strong>
                            <p>{message.texte}</p>

                            {message.reponse && (
                                <div className="reponse-animateur">
                                    <strong>Réponse de l’animateur</strong>
                                    <p>{message.reponse}</p>
                                </div>
                            )}

                            <form
                                className="form-reponse"
                                onSubmit={(e) => envoyerReponse(e, message.id)}
                            >
                                <label htmlFor={`reponse-${message.id}`}>
                                    Votre réponse
                                </label>

                                <textarea
                                    id={`reponse-${message.id}`}
                                    maxLength={250}
                                    value={reponses[message.id] ?? ''}
                                    onChange={(e) =>
                                        setReponses((anciennes) => ({
                                            ...anciennes,
                                            [message.id]: e.target.value,
                                        }))
                                    }
                                    required
                                />

                                <p>
                                    {(reponses[message.id] ?? '').length}/250 caractères
                                </p>

                                <button type="submit">
                                    Envoyer la réponse
                                </button>
                            </form>

                            <button
                                type="button"
                                className="bouton-danger"
                                onClick={() => supprimerMessage(message.id)}
                                disabled={suppressionEnCours}
                            >
                                Supprimer ce message
                            </button>
                        </article>
                    ))}
                </section>

                <a className="lien-mur" href="/mur">
                    Voir le mur
                </a>
            </main>
        );
    }

    /* Mur de projection */

    if (modeMur) {
        return (
            <main className="page-mur">
                <header>
                    <p>EXPÉRIENCE INTERACTIVE</p>
                    <h1>Le Mur vivant</h1>
                    <p className="participants-en-ligne">
                        {nomsParticipants}
                    </p>
                </header>

                <section className="mur">
                    <div className="liste-messages">
                        {messages.length === 0 && (
                            <p>Aucun message pour le moment.</p>
                        )}

                        {messages.map((message) => (
                            <article key={message.id}>
                                <strong>{message.auteur}</strong>
                                <p>{message.texte}</p>

                                {message.reponse && (
                                    <div className="reponse-animateur">
                                        <strong>Réponse de l’animateur</strong>
                                        <p>{message.reponse}</p>
                                    </div>
                                )}
                            </article>
                        ))}
                    </div>

                    <div className="qr-code">
                        <QRCodeSVG
                            value={adresseParticipation}
                            size={150}
                            bgColor="#ffffff"
                            fgColor="#070b18"
                            level="H"
                        />

                        <strong>Scannez pour participer</strong>
                    </div>
                </section>
            </main>
        );
    }

    /* Formulaire de participation */

    return (
        <main className="page-participation">
            <header>
                <p>EXPÉRIENCE INTERACTIVE</p>
                <h1>Le Mur vivant</h1>
                <p className="participants-en-ligne">
                    {nomsParticipants}
                </p>
                <p>Écrivez un message et affichez-le en direct.</p>
            </header>

            <form onSubmit={envoyerMessage}>
                <h2>Participer</h2>

                <label htmlFor="auteur">
                    Votre nom
                </label>

                <input
                    id="auteur"
                    type="text"
                    maxLength={30}
                    value={auteur}
                    onChange={(e) => setAuteur(e.target.value)}
                    required
                />

                <label htmlFor="message">
                    Votre message
                </label>

                <textarea
                    id="message"
                    maxLength={120}
                    value={texte}
                    onChange={(e) => setTexte(e.target.value)}
                    required
                />

                <p>{texte.length}/120 caractères</p>

                <button type="submit">
                    Envoyer sur le mur
                </button>
            </form>

            <section className="messages-participation">
                <h2>Messages et réponses</h2>

                {messages.length === 0 && (
                    <p>Aucun message pour le moment.</p>
                )}

                {messages.map((message) => (
                    <article key={message.id}>
                        <strong>{message.auteur}</strong>
                        <p>{message.texte}</p>

                        {message.reponse && (
                            <div className="reponse-animateur">
                                <strong>Réponse de l’animateur</strong>
                                <p>{message.reponse}</p>
                            </div>
                        )}
                    </article>
                ))}
            </section>

            <a className="lien-mur" href="/mur">
                Voir le mur
            </a>
        </main>
    );
}

export default App;