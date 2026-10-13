export interface Message {
    id: number;
    auteur: string;
    texte: string;
    date: string;
    reponse?: string;
}