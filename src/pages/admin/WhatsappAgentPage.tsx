// WhatsappAgentPage.tsx — Supervision de l'agent commercial + support WhatsApp.
//
// Page en LECTURE SEULE côté messages : on ne répond jamais aux clients depuis
// BarTender. La réponse manuelle se fait via l'app/Business Suite WhatsApp de
// l'éditeur (décision produit — pas de centralisation de la messagerie ici).
// Seules actions possibles : "Rendre au bot" (mode → bot) et changer le statut
// CRM d'un lead. Pas de Realtime en V1 (rechargement manuel) pour rester sobre
// en egress — le volume de cette page est de toute façon faible (usage éditeur
// seul, texte).

import { useState, useEffect, useCallback } from 'react';
import { MessageCircle, Users, RotateCcw, AlertTriangle, User, Store } from 'lucide-react';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Alert } from '../../components/ui/Alert';
import { Modal } from '../../components/ui/Modal';
import { AdminPanelErrorBoundary } from '../../components/AdminPanelErrorBoundary';
import { AdminPanelSkeleton } from '../../components/AdminPanelSkeleton';
import { useWhatsappAgent } from '../../hooks/useWhatsappAgent';
import type { WaConversation, WaLead, WaMode, WaLeadStatut } from '../../services/supabase/whatsappAgent.service';
import { formatRelativeTime } from '../../utils/formatRelativeTime';

const MODE_BADGE: Record<WaMode, { variant: 'success' | 'warning' | 'danger'; label: string }> = {
  bot: { variant: 'success', label: 'Bot actif' },
  escalade_pending: { variant: 'danger', label: 'À traiter' },
  humain: { variant: 'warning', label: 'Pris en main' },
};

const PROFIL_LABEL: Record<string, string> = {
  prospect: 'Prospect', client: 'Client', inconnu: 'Non identifié',
};

const LEAD_STATUT_OPTIONS: { value: WaLeadStatut; label: string }[] = [
  { value: 'nouveau', label: 'Nouveau' },
  { value: 'contacte', label: 'Contacté' },
  { value: 'demo_donnee', label: 'Démo donnée' },
  { value: 'converti', label: 'Converti' },
  { value: 'perdu', label: 'Perdu' },
];

const INTERET_BADGE: Record<string, 'danger' | 'warning' | 'success'> = {
  chaud: 'danger', tiede: 'warning', froid: 'success',
};

type Tab = 'conversations' | 'leads';

export default function WhatsappAgentPage() {
  const { listConversations, resumeBot, listLeads, updateLeadStatut, isMutating } = useWhatsappAgent();

  const [tab, setTab] = useState<Tab>('conversations');
  const [conversations, setConversations] = useState<WaConversation[]>([]);
  const [conversationFilter, setConversationFilter] = useState<'a_traiter' | 'all'>('a_traiter');
  const [leads, setLeads] = useState<WaLead[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<WaConversation | null>(null);

  const loadConversations = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      setConversations(await listConversations(conversationFilter));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors du chargement des conversations');
    } finally {
      setLoading(false);
    }
  }, [listConversations, conversationFilter]);

  const loadLeads = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      setLeads(await listLeads('all'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors du chargement des leads');
    } finally {
      setLoading(false);
    }
  }, [listLeads]);

  useEffect(() => {
    if (tab === 'conversations') loadConversations();
    else loadLeads();
  }, [tab, loadConversations, loadLeads]);

  const handleResumeBot = async (conv: WaConversation) => {
    try {
      await resumeBot(conv.id);
      setSelected(null);
      await loadConversations();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la reprise du bot');
    }
  };

  const handleLeadStatut = async (lead: WaLead, statut: WaLeadStatut) => {
    try {
      await updateLeadStatut(lead.id, statut);
      setLeads((prev) => prev.map((l) => (l.id === lead.id ? { ...l, statut } : l)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la mise à jour du lead');
      await loadLeads(); // resynchroniser en cas d'échec de la mise à jour optimiste
    }
  };

  const attentionCount = conversations.filter((c) => c.mode !== 'bot').length;

  return (
    <div className="max-w-6xl mx-auto">
      <AdminPanelErrorBoundary fallbackTitle="Erreur dans la supervision WhatsApp">
        <div className="bg-gradient-to-r from-purple-600 to-indigo-600 p-4 md:p-6 text-white rounded-t-2xl">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <MessageCircle className="w-8 h-8" />
              <div>
                <h1 className="text-xl md:text-2xl font-bold">Agent WhatsApp</h1>
                <p className="text-purple-100 text-sm">
                  Supervision des conversations et des leads. Réponses via WhatsApp — pas depuis cette page.
                </p>
              </div>
            </div>
            {tab === 'conversations' && conversationFilter === 'a_traiter' && attentionCount > 0 && (
              <Badge variant="danger" dot>{attentionCount} à traiter</Badge>
            )}
          </div>
        </div>

        <div className="border-b bg-card px-3 sm:px-6 flex gap-1">
          <button
            onClick={() => setTab('conversations')}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              tab === 'conversations'
                ? 'border-purple-600 text-purple-700 dark:text-purple-400'
                : 'border-transparent text-foreground/60 hover:text-foreground'
            }`}
          >
            <MessageCircle className="w-4 h-4" /> Conversations
          </button>
          <button
            onClick={() => setTab('leads')}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              tab === 'leads'
                ? 'border-purple-600 text-purple-700 dark:text-purple-400'
                : 'border-transparent text-foreground/60 hover:text-foreground'
            }`}
          >
            <Users className="w-4 h-4" /> Leads
          </button>
        </div>

        {error && (
          <div className="p-4 border-b bg-card rounded-none">
            <Alert variant="destructive" title="Erreur de chargement">
              <div className="flex items-center justify-between">
                <span>{error}</span>
                <button
                  onClick={tab === 'conversations' ? loadConversations : loadLeads}
                  className="ml-4 px-3 py-1 text-sm bg-red-100 hover:bg-red-200 rounded-md font-medium transition-colors"
                >
                  Réessayer
                </button>
              </div>
            </Alert>
          </div>
        )}

        {tab === 'conversations' ? (
          <>
            <div className="p-3 md:p-4 border-b bg-card rounded-none flex gap-2">
              <Button
                size="sm"
                variant={conversationFilter === 'a_traiter' ? 'default' : 'outline'}
                onClick={() => setConversationFilter('a_traiter')}
              >
                À traiter
              </Button>
              <Button
                size="sm"
                variant={conversationFilter === 'all' ? 'default' : 'outline'}
                onClick={() => setConversationFilter('all')}
              >
                Toutes
              </Button>
            </div>

            <div className="bg-muted">
              {loading ? (
                <AdminPanelSkeleton count={4} type="card" />
              ) : conversations.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <MessageCircle className="w-16 h-16 mx-auto mb-4 text-muted-foreground/60" />
                  <p className="text-lg font-semibold">
                    {conversationFilter === 'a_traiter' ? 'Rien à traiter' : 'Aucune conversation'}
                  </p>
                  <p className="text-sm">
                    {conversationFilter === 'a_traiter' && 'Le bot gère tout tout seul pour le moment.'}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4 p-3 sm:p-4 md:p-6">
                  {conversations.map((conv) => {
                    const badge = MODE_BADGE[conv.mode];
                    const lastMsg = conv.messages[conv.messages.length - 1];
                    return (
                      <button
                        key={conv.id}
                        onClick={() => setSelected(conv)}
                        className={`text-left bg-card rounded-lg p-4 border-2 ${
                          conv.mode !== 'bot' ? 'border-red-200' : 'border-border'
                        } hover:shadow-lg transition-shadow`}
                      >
                        <div className="flex justify-between items-start mb-2 gap-2">
                          <div className="min-w-0 flex-1">
                            <h4 className="font-bold text-base text-foreground truncate">
                              {conv.waName || conv.phone}
                            </h4>
                            <p className="text-xs text-muted-foreground truncate">
                              {conv.phone} · {PROFIL_LABEL[conv.profil]}
                            </p>
                          </div>
                          <Badge variant={badge.variant} dot className="flex-shrink-0">{badge.label}</Badge>
                        </div>
                        {lastMsg && (
                          <p className="text-sm text-foreground/70 line-clamp-2 mb-2">
                            {lastMsg.role === 'assistant' ? '↩ ' : ''}{lastMsg.content}
                          </p>
                        )}
                        {conv.escalade && (
                          <p className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1 mb-1">
                            <AlertTriangle className="w-3 h-3 flex-shrink-0" /> {conv.escalade.resume}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          {conv.lastMessageAt ? formatRelativeTime(conv.lastMessageAt) : '—'}
                        </p>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="bg-muted">
            {loading ? (
              <AdminPanelSkeleton count={4} type="card" />
            ) : leads.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Users className="w-16 h-16 mx-auto mb-4 text-muted-foreground/60" />
                <p className="text-lg font-semibold">Aucun lead pour le moment</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4 p-3 sm:p-4 md:p-6">
                {leads.map((lead) => (
                  <div key={lead.id} className="bg-card rounded-lg p-4 border-2 border-border hover:shadow-lg transition-shadow">
                    <div className="flex justify-between items-start mb-2 gap-2">
                      <div className="min-w-0 flex-1">
                        <h4 className="font-bold text-base text-foreground truncate flex items-center gap-1.5">
                          {lead.nomBar ? <Store className="w-4 h-4 flex-shrink-0" /> : <User className="w-4 h-4 flex-shrink-0" />}
                          {lead.nomBar || lead.nomContact || lead.phone}
                        </h4>
                        <p className="text-xs text-muted-foreground truncate">
                          {lead.phone}{lead.ville ? ` · ${lead.ville}` : ''}
                        </p>
                      </div>
                      <Badge variant={INTERET_BADGE[lead.niveauInteret]} dot className="flex-shrink-0">
                        {lead.niveauInteret}
                      </Badge>
                    </div>

                    <div className="space-y-1 text-xs mb-3 text-foreground/70">
                      {lead.nomContact && lead.nomBar && <p><span className="font-semibold">Contact :</span> {lead.nomContact}</p>}
                      {lead.role && lead.role !== 'inconnu' && <p><span className="font-semibold">Rôle :</span> {lead.role}</p>}
                      {lead.tailleEquipe && <p><span className="font-semibold">Équipe :</span> {lead.tailleEquipe} pers.</p>}
                      {lead.volumeActivite && <p><span className="font-semibold">Activité :</span> {lead.volumeActivite}</p>}
                      {lead.besoinPrincipal && <p><span className="font-semibold">Besoin :</span> {lead.besoinPrincipal}</p>}
                      <p className="text-muted-foreground">{formatRelativeTime(lead.createdAt)}</p>
                    </div>

                    <select
                      value={lead.statut}
                      onChange={(e) => handleLeadStatut(lead, e.target.value as WaLeadStatut)}
                      disabled={isMutating}
                      className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-card focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all disabled:opacity-50"
                    >
                      {LEAD_STATUT_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {selected && (
          <Modal
            open
            onClose={() => setSelected(null)}
            title={selected.waName || selected.phone}
            description={`${selected.phone} · ${PROFIL_LABEL[selected.profil]}`}
            size="lg"
            footer={
              selected.mode !== 'bot' ? (
                <Button onClick={() => handleResumeBot(selected)} disabled={isMutating} className="w-full">
                  <RotateCcw className="w-4 h-4 mr-2" /> Rendre la main au bot
                </Button>
              ) : undefined
            }
          >
            {selected.escalade && (
              <Alert variant="destructive" title={`Motif : ${selected.escalade.motif}`} className="mb-4">
                {selected.escalade.resume}
              </Alert>
            )}
            <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
              {selected.messages.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">Aucun message.</p>
              ) : (
                selected.messages.map((m, i) => (
                  <div
                    key={m.wamid ?? i}
                    className={`flex ${m.role === 'user' ? 'justify-start' : 'justify-end'}`}
                  >
                    <div
                      className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                        m.role === 'user'
                          ? 'bg-muted text-foreground'
                          : 'bg-purple-100 dark:bg-purple-950/40 text-purple-900 dark:text-purple-200'
                      }`}
                    >
                      <p className="whitespace-pre-wrap">{m.content}</p>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {formatRelativeTime(m.ts)}
                        {m.delivered === false && ' · non délivré'}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Modal>
        )}
      </AdminPanelErrorBoundary>
    </div>
  );
}
