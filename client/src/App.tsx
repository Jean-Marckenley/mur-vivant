import { useEffect, useState, type FormEvent } from 'react';
import { QRCodeSVG } from 'qrcode.react';

import { socket } from './socket';
import type { Message } from './types';
import './App.css';

const couleurs = [
    { valeur: '#fff3b0', nom: 'Jaune' },
    { valeur: '#d9f2dd', nom: 'Vert' },
    { valeur: '#fce0e8', nom: 'Rose' },
    { valeur: '#dbeafe', nom: 'Bleu' },
    { valeur: '#ede9fe', nom: 'Violet' },
];

function ContenuNote({ message }: { message: Message }) {
    return (
        <>
            <strong>{message.auteur}</strong>
            <p>{message.texte}</p>

            {message.reponse && (
                <div className="reponse-animateur">
                    <strong>Réponse de l’animateur</strong>
                    <p>{message.reponse}</p>
                </div>
            )}
        </>
    );
}

function App() {
    const [auteur, setAuteur] = useState('');
    const [texte, setTexte] = useState('');
    const [couleur, setCouleur] = useState('#fff3b0');
    const [messages, setMessages] = useState<Message[]>([]);
    const [participants, setParticipants] = useState<string[]>([]);
    const [reponses, setReponses] = useState<Record<number, string>>({});

    const chemin = window.location.pathname;
    const modeMur = chemin === '/mur';
    const modeAdmin = chemin === '/admin';
    const adresseParticipation = window.location.origin;

    const nomsParticipants = participants.length > 0
        ? `En ligne : ${participants.join(', ')}`
        : 'Aucun participant identifié';

    useEffect(() => {
        function recevoirHistorique(historique: Message[]) {
            setMessages(historique);
        }

        function ajouterMessage(message: Message) {
            setMessages((anciens) => [
                ...anciens.filter((ancien) => ancien.id !== message.id),
                message,
            ].slice(-50));
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

        function synchroniser() {
            socket.emit('demander-historique');
        }

        socket.on('historique', recevoirHistorique);
        socket.on('message-ajoute', ajouterMessage);
        socket.on('message-modifie', modifierMessage);
        socket.on('participants-noms', recevoirParticipants);
        socket.on('connect', synchroniser);

        if (socket.connected) {
            synchroniser();
        }

        return () => {
            socket.off('historique', recevoirHistorique);
            socket.off('message-ajoute', ajouterMessage);
            socket.off('message-modifie', modifierMessage);
            socket.off('participants-noms', recevoirParticipants);
            socket.off('connect', synchroniser);
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

        if (!auteur.trim() || !texte.trim()) {
            return;
        }

        socket.emit('identifier-participant', auteur.trim());

        socket.emit('nouveau-message', {
            auteur: auteur.trim(),
            texte: texte.trim(),
            couleur,
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

        socket.emit('repondre-message', { id, reponse });

        setReponses((anciennes) => ({
            ...anciennes,
            [id]: '',
        }));
    }

    if (modeAdmin) {
        return (
            <main className="page-admin">
                <header>
                    <p>ESPACE ANIMATEUR</p>
                    <h1>Répondre aux participants</h1>
                    <p>{nomsParticipants}</p>
                </header>

                <section className="liste-messages-admin">
                    {messages.length === 0 && (
                        <p>Aucun message pour le moment.</p>
                    )}

                    {messages.map((message) => (
                        <article
                            key={message.id}
                            style={{
                                backgroundColor: message.couleur ?? '#fff3b0',
                            }}
                        >
                            <ContenuNote message={message} />

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
                        </article>
                    ))}
                </section>

                <a className="lien-mur" href="/mur">
                    Voir le mur
                </a>
            </main>
        );
    }

    if (modeMur) {
        return (
            <main className="page-mur">
                <header>
                    <p>EXPÉRIENCE INTERACTIVE</p>
                    <h1>Le Mur vivant</h1>
                    <p>{nomsParticipants}</p>
                </header>

                <section className="mur">
                    <div className="liste-messages">
                        {messages.length === 0 && (
                            <p>Aucun message pour le moment.</p>
                        )}

                        {messages.map((message) => (
                            <article
                                key={message.id}
                                style={{
                                    backgroundColor: message.couleur ?? '#fff3b0',
                                }}
                            >
                                <ContenuNote message={message} />
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

    return (
        <main className="page-participation">
            <header>
                <p>EXPÉRIENCE INTERACTIVE</p>
                <h1>Le Mur vivant</h1>
                <p>Écrivez un message et affichez-le en direct.</p>
            </header>

            <form onSubmit={envoyerMessage}>
                <h2>Participer</h2>

                <label htmlFor="auteur">Votre nom</label>

                <input
                    id="auteur"
                    type="text"
                    maxLength={30}
                    value={auteur}
                    onChange={(e) => setAuteur(e.target.value)}
                    required
                />

                <label htmlFor="message">Votre message</label>

                <textarea
                    id="message"
                    maxLength={120}
                    value={texte}
                    onChange={(e) => setTexte(e.target.value)}
                    required
                />

                <p>{texte.length}/120 caractères</p>

                <fieldset className="choix-couleur">
                    <legend>Couleur de votre note</legend>

                    {couleurs.map((option) => (
                        <label
                            key={option.valeur}
                            style={{ backgroundColor: option.valeur }}
                        >
                            <input
                                type="radio"
                                name="couleur"
                                value={option.valeur}
                                checked={couleur === option.valeur}
                                onChange={() => setCouleur(option.valeur)}
                            />
                            <span>{option.nom}</span>
                        </label>
                    ))}
                </fieldset>

                <button type="submit">
                    Envoyer sur le mur
                </button>
            </form>

            <section className="messages-participation">
                <h2>Messages et réponses</h2>

                <div
                    className="notes-defilantes"
                    role="region"
                    aria-label="Notes et réponses"
                    tabIndex={0}
                >
                    {messages.length === 0 && (
                        <p>Aucun message pour le moment.</p>
                    )}

                    {messages.map((message) => (
                        <article
                            key={message.id}
                            style={{
                                backgroundColor: message.couleur ?? '#fff3b0',
                            }}
                        >
                            <ContenuNote message={message} />
                        </article>
                    ))}
                </div>
            </section>

            <a className="lien-mur" href="/mur">
                Voir le mur
            </a>
        </main>
    );
}

export default App;