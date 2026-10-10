import { useEffect, useState, type FormEvent } from 'react';
import { QRCodeSVG } from 'qrcode.react';

import { socket } from './socket';
import type { Message } from './types';
import './App.css';

function App() {
  const [auteur, setAuteur] = useState('');
  const [texte, setTexte] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [participants, setParticipants] = useState(0);

  const modeMur = window.location.pathname === '/mur';
  const adresseParticipation = window.location.origin;

  useEffect(() => {
    function recevoirHistorique(historique: Message[]) {
      setMessages(historique);
    }

    function ajouterMessage(message: Message) {
      setMessages((anciensMessages) => [
        ...anciensMessages,
        message,
      ]);
    }

    function recevoirParticipants(nombre: number) {
      setParticipants(nombre);
    }

    socket.on('historique', recevoirHistorique);
    socket.on('message-ajoute', ajouterMessage);
    socket.on('participants', recevoirParticipants);

    return () => {
      socket.off('historique', recevoirHistorique);
      socket.off('message-ajoute', ajouterMessage);
      socket.off('participants', recevoirParticipants);
    };
  }, []);

  function envoyerMessage(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (auteur.trim() === '' || texte.trim() === '') {
      return;
    }

    socket.emit('nouveau-message', {
      auteur,
      texte,
    });

    setTexte('');
  }

  if (modeMur) {
    return (
        <main className="page-mur">
          <header>
            <p>EXPÉRIENCE INTERACTIVE</p>
            <h1>Le Mur vivant</h1>
            <p>{participants} participant(s) connecté(s)</p>
          </header>

          <section className="mur">
            <div className="liste-messages">
              {messages.map((message) => (
                  <article key={message.id}>
                    <strong>{message.auteur}</strong>
                    <p>{message.texte}</p>
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

          <button type="submit">
            Envoyer sur le mur
          </button>
        </form>

        <a className="lien-mur" href="/mur">
          Voir le mur
        </a>
      </main>
  );
}

export default App;