import { LinkButton } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="rounded-lg border border-line bg-white p-10 text-center">
      <p className="text-lg font-semibold text-navy">Élément introuvable</p>
      <p className="mt-1 text-sm text-muted">Il a peut-être été supprimé ou l&apos;adresse est incorrecte.</p>
      <LinkButton href="/dashboard" className="mt-4">Retour au tableau de bord</LinkButton>
    </div>
  );
}
