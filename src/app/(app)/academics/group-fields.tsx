import type { Group } from "@prisma/client";
import { Input, Select } from "@/components/form";
import { db } from "@/server/db";
import { moneyInput } from "@/lib/format";
import { levelOptions } from "../students/student-fields";

export async function GroupFields({ g }: { g?: Group }) {
  const [levels, subjects, teachers, rooms] = await Promise.all([
    levelOptions(db),
    db.subject.findMany({ orderBy: { name: "asc" } }),
    db.teacher.findMany({ where: { active: true }, orderBy: { lastName: "asc" } }),
    db.room.findMany({ orderBy: { name: "asc" } }),
  ]);
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Input label="Nom du groupe *" name="name" placeholder="Maths 9e — G1" defaultValue={g?.name} wrapperClass="lg:col-span-2" />
      <Select label="Niveau *" name="levelId" placeholder="Choisir…" defaultValue={g?.levelId} options={levels} />
      <Select label="Matière *" name="subjectId" placeholder="Choisir…" defaultValue={g?.subjectId} options={subjects.map((s) => ({ value: s.id, label: s.name }))} />
      <Select label="Enseignant" name="teacherId" placeholder="—" defaultValue={g?.teacherId ?? ""} options={teachers.map((t) => ({ value: t.id, label: `${t.lastName} ${t.firstName}` }))} />
      <Select label="Salle par défaut" name="roomId" placeholder="—" defaultValue={g?.roomId ?? ""} options={rooms.map((r) => ({ value: r.id, label: `${r.name} (${r.capacity} pl.)` }))} />
      <Input label="Capacité *" name="capacity" type="number" min={1} defaultValue={g?.capacity ?? 12} />
      <Input label="Mensualité (DT)" name="monthlyFee" inputMode="decimal" placeholder="selon la grille" defaultValue={g ? moneyInput(g.monthlyFee) : ""} hint={g ? undefined : "Vide : tarif de la grille tarifaire"} />
      <Input label="Frais d'inscription (DT)" name="registrationFee" inputMode="decimal" placeholder="selon la grille" defaultValue={g ? moneyInput(g.registrationFee) : ""} />
    </div>
  );
}
