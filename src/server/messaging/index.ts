import "server-only";
import type { MessageChannel } from "@prisma/client";

/**
 * Architecture d'envoi des messages.
 *
 * Aujourd'hui, seul le canal MANUEL est actif : l'application PRÉPARE les messages (texte en français, destinataire,
 * téléphone) ; un membre de l'équipe les envoie lui-même (copier-coller, lien WhatsApp qu'il ouvre) puis marque
 * le message « envoyé ». AUCUN envoi automatique n'est effectué.
 *
 * Pour brancher un fournisseur (SMS tunisien, API WhatsApp Business, e-mail) plus tard :
 *   1. implémenter `ChannelProvider` dans ce dossier (ex. sms-provider.ts) ;
 *   2. l'enregistrer dans `PROVIDERS` ;
 *   3. l'activer explicitement par variable d'environnement (ex. MESSAGING_SMS_ENABLED=true + identifiants),
 *      après accord de la direction. Sans cette configuration, `send()` refuse l'envoi.
 */
export interface ChannelProvider {
  channel: MessageChannel;
  label: string;
  /** true seulement si le fournisseur est configuré ET explicitement autorisé. */
  enabled(): boolean;
  send(msg: { to: string; body: string }): Promise<{ ok: true; providerId?: string } | { ok: false; error: string }>;
}

const manual: ChannelProvider = {
  channel: "MANUEL",
  label: "Envoi manuel (copier / WhatsApp ouvert par l'utilisateur)",
  enabled: () => true,
  // Le canal manuel n'envoie rien : l'utilisateur confirme l'envoi qu'il a fait lui-même.
  send: async () => ({ ok: true }),
};

/** Emplacement réservé : aucun fournisseur n'est implémenté, le canal reste donc désactivé quelle que soit la configuration. */
function notConfigured(channel: MessageChannel, label: string): ChannelProvider {
  return {
    channel,
    label,
    enabled: () => false,
    send: async () => ({ ok: false, error: `${label} : canal non configuré. Aucun message n'a été envoyé.` }),
  };
}

export const PROVIDERS: Record<MessageChannel, ChannelProvider> = {
  MANUEL: manual,
  SMS: notConfigured("SMS", "SMS"),
  WHATSAPP_API: notConfigured("WHATSAPP_API", "WhatsApp Business API"),
  EMAIL: notConfigured("EMAIL", "E-mail"),
};

export function availableChannels() {
  return Object.values(PROVIDERS).map((p) => ({ channel: p.channel, label: p.label, enabled: p.enabled() }));
}
