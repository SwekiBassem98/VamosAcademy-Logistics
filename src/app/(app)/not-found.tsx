import { SearchX } from "lucide-react";
import { EmptyState, LinkButton } from "@/components/ui";

export default function NotFound() {
  return (
    <EmptyState icon={<SearchX />} title="Élément introuvable" text="Il a peut-être été supprimé ou l'adresse est incorrecte."
      action={<LinkButton href="/dashboard">Retour au tableau de bord</LinkButton>} />
  );
}
