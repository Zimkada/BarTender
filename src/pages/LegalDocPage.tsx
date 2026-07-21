import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
// Les fichiers Markdown à la racine du dépôt sont la source unique de vérité :
// importés en texte brut (Vite ?raw) et rendus ici, pas dupliqués.
import privacyContent from '../../POLITIQUE_CONFIDENTIALITE.md?raw';
import termsContent from '../../CGU_CGV.md?raw';

type LegalSlug = 'confidentialite' | 'cgu';

const DOCS: Record<LegalSlug, { title: string; content: string }> = {
  confidentialite: { title: 'Politique de confidentialité', content: privacyContent },
  cgu: { title: 'Conditions Générales (CGU/CGV)', content: termsContent },
};

// Styling du Markdown via le design system (pas de plugin Tailwind typography).
const markdownComponents: Components = {
  h1: ({ children }) => <h1 className="text-2xl font-bold text-foreground mt-8 mb-4 first:mt-0">{children}</h1>,
  h2: ({ children }) => <h2 className="text-xl font-bold text-foreground mt-8 mb-3">{children}</h2>,
  h3: ({ children }) => <h3 className="text-lg font-semibold text-foreground mt-6 mb-2">{children}</h3>,
  p: ({ children }) => <p className="text-foreground/80 leading-relaxed mb-4 text-justify">{children}</p>,
  ul: ({ children }) => <ul className="list-disc pl-6 mb-4 space-y-1 text-foreground/80">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal pl-6 mb-4 space-y-1 text-foreground/80">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed text-justify">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
  a: ({ href, children }) => (
    <a href={href} className="text-brand-primary underline hover:text-brand-primary/80">{children}</a>
  ),
  hr: () => <hr className="my-6 border-border" />,
  table: ({ children }) => (
    <div className="overflow-x-auto mb-4">
      <table className="w-full text-sm border-collapse">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border border-border bg-brand-subtle px-3 py-2 text-left font-semibold text-foreground">{children}</th>
  ),
  td: ({ children }) => <td className="border border-border px-3 py-2 text-foreground/80">{children}</td>,
};

export const LegalDocPage: React.FC = () => {
  const navigate = useNavigate();
  const { slug } = useParams<{ slug: LegalSlug }>();

  const doc = slug ? DOCS[slug] : undefined;

  if (!doc) {
    return (
      <div className="min-h-screen bg-brand-subtle flex items-center justify-center p-4">
        <div className="bg-card rounded-2xl shadow-xl p-8 w-full max-w-md text-center">
          <p className="text-foreground/70">Document introuvable.</p>
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="btn-brand mt-4 px-4 py-2 rounded-lg font-semibold"
          >
            Retour
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-brand-subtle py-8 px-4">
      <div className="max-w-3xl mx-auto">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-2 text-brand-primary hover:text-brand-primary/80 mb-6 bg-transparent border-none cursor-pointer"
        >
          <ArrowLeft size={18} />
          Retour
        </button>

        <article className="bg-card rounded-2xl shadow-xl p-6 sm:p-10">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
            {doc.content}
          </ReactMarkdown>
        </article>
      </div>
    </div>
  );
};

export default LegalDocPage;
