import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, PageHeader, Table, Td, Badge, Forbidden, LinkButton, DemoBadge } from "@/components/ui";
import { Form, Input, Select, Submit, Checkbox } from "@/components/form";
import { ConfirmAction } from "@/components/confirm";
import { PrintButton } from "@/components/print-button";
import { pageUser } from "@/server/auth";
import { db } from "@/server/db";
import { canAccessGroup } from "@/server/scope";
import { can } from "@/lib/permissions";
import { formatDate, formatMinutes, formatMoney, minutesInput, WEEKDAYS } from "@/lib/format";
import { GroupFields } from "../../group-fields";
import { saveSlot, deleteSlot, updateGroup } from "../../actions";

export default async function GroupPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await pageUser("academics.read");
  if (!user) return <Forbidden />;
  const { id } = await params;
  if (!(await canAccessGroup(user, id))) return <Forbidden />;
  const g = await db.group.findUnique({
    where: { id },
    include: {
      level: true, subject: true, teacher: true, room: true, schoolYear: true,
      slots: { include: { room: true }, orderBy: [{ weekday: "asc" }, { startMin: "asc" }] },
      enrollments: { where: { status: "ACTIVE" }, include: { student: { include: { guardians: { include: { guardian: true }, orderBy: { isPayer: "desc" }, take: 1 } } } }, orderBy: { student: { lastName: "asc" } } },
    },
  });
  if (!g) notFound();
  const manage = can(user.role, "academics.write");
  const rooms = manage ? await db.room.findMany({ orderBy: { name: "asc" } }) : [];
  const dayOptions = WEEKDAYS.slice(1).map((d, i) => ({ value: String(i + 1), label: d }));
  const roomOptions = rooms.map((r) => ({ value: r.id, label: `${r.name} (${r.capacity} pl.)` }));

  return (
    <>
      <PageHeader
        title={g.name}
        subtitle={`${g.subject.name} · ${g.level.name} · ${g.schoolYear.label} · ${g.teacher ? `${g.teacher.lastName} ${g.teacher.firstName}` : "enseignant à affecter"}`}
        actions={<>
          <PrintButton label="Imprimer la liste" />
          {can(user.role, "grades.read") && <LinkButton variant="secondary" href={`/grades?group=${g.id}`}>Notes</LinkButton>}
          {can(user.role, "attendance.write") && <LinkButton href={`/attendance?group=${g.id}`}>Faire l&apos;appel</LinkButton>}
        </>}
      />
      <div className="mb-6 flex flex-wrap gap-2">
        <Badge tone="blue">{g.enrollments.length}/{g.capacity} élèves</Badge>
        <Badge tone="gray">{formatMoney(g.monthlyFee)} / mois</Badge>
        {g.isDemo && <DemoBadge />}
        {!g.active && <Badge tone="amber">archivé</Badge>}
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2">
          <Card title={`Liste des élèves — ${g.name}`}>
            <Table head={["#", "Élève", "Matricule", "Parent", "Entrée"]} empty={g.enrollments.length === 0}>
              {g.enrollments.map((e, i) => (
                <tr key={e.id}>
                  <Td className="text-muted">{i + 1}</Td>
                  <Td><Link href={`/students/${e.studentId}`} className="font-medium hover:text-brand">{e.student.lastName} {e.student.firstName}</Link></Td>
                  <Td className="font-mono text-xs">{e.student.code}</Td>
                  <Td>{e.student.guardians[0]?.guardian.phone ?? "—"}</Td>
                  <Td>{formatDate(e.startDate)}</Td>
                </tr>
              ))}
            </Table>
            <p className="no-print mt-2 text-xs text-muted">Pour inscrire un élève : ouvrez son dossier → « Nouvelle inscription ».</p>
          </Card>
        </div>
        <Card title="Créneaux hebdomadaires" className="no-print">
          {g.slots.length === 0 && <p className="text-sm text-muted">Aucun créneau.</p>}
          <ul className="space-y-2 text-sm">
            {g.slots.map((s) => (
              <li key={s.id} className="rounded border border-line px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span><strong>{WEEKDAYS[s.weekday]}</strong> {formatMinutes(s.startMin)}–{formatMinutes(s.endMin)} · {s.room.name}</span>
                  {manage && <ConfirmAction action={deleteSlot.bind(null, s.id)} small label="Supprimer" title="Supprimer ce créneau ?" message="Les séances déjà pointées sont conservées." />}
                </div>
                {manage && (
                  <details className="mt-1">
                    <summary className="cursor-pointer text-xs text-brand">Modifier</summary>
                    <Form action={saveSlot} className="mt-2 grid grid-cols-2 gap-2">
                      <input type="hidden" name="groupId" value={g.id} /><input type="hidden" name="slotId" value={s.id} />
                      <Select label="Jour" name="weekday" defaultValue={String(s.weekday)} options={dayOptions} />
                      <Select label="Salle" name="roomId" defaultValue={s.roomId} options={roomOptions} />
                      <Input label="Début" name="start" type="time" step={900} defaultValue={minutesInput(s.startMin)} />
                      <Input label="Fin" name="end" type="time" step={900} defaultValue={minutesInput(s.endMin)} />
                      <Submit variant="secondary">Enregistrer</Submit>
                    </Form>
                  </details>
                )}
              </li>
            ))}
          </ul>
          {manage && (
            <Form action={saveSlot} className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-4" resetOnSuccess>
              <p className="col-span-2 text-sm font-medium text-navy">Ajouter un créneau</p>
              <input type="hidden" name="groupId" value={g.id} />
              <Select label="Jour" name="weekday" options={dayOptions} />
              <Select label="Salle" name="roomId" defaultValue={g.roomId ?? undefined} options={roomOptions} />
              <Input label="Début" name="start" type="time" step={900} defaultValue="14:00" />
              <Input label="Fin" name="end" type="time" step={900} defaultValue="16:00" />
              <Submit variant="secondary">Ajouter</Submit>
            </Form>
          )}
          <p className="mt-3 text-xs text-muted">Contrôles : salle, enseignant et groupe déjà occupés, disponibilités de l&apos;enseignant, capacité de la salle.</p>
        </Card>
      </div>
      {manage && (
        <Card title="Modifier le groupe" className="no-print mt-6">
          <Form action={updateGroup.bind(null, g.id)} className="space-y-4">
            <GroupFields g={g} />
            <Checkbox label="Groupe actif" name="active" defaultChecked={g.active} />
            <Submit />
          </Form>
        </Card>
      )}
    </>
  );
}
