import type { Role } from "@prisma/client";

export const PERMISSIONS = [
  "dashboard.finance",
  "students.read",
  "students.write",
  "academics.read",
  "academics.write",
  "teachers.read",
  "teachers.write",
  "attendance.read",
  "attendance.write",
  "grades.read",
  "grades.write",
  "payments.read",
  "payments.write",
  "payments.cancel",
  "expenses.read",
  "expenses.write",
  "reports.read",
  "payroll.manage",
  "messages.write",
  "users.manage",
  "settings.manage",
  "audit.read",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

// Matrice : voir docs/PROJECT_BLUEPRINT.md §4
const MATRIX: Record<Role, readonly Permission[]> = {
  ADMIN: PERMISSIONS,
  RESPONSABLE: [
    "dashboard.finance", "students.read", "students.write", "academics.read", "academics.write",
    "teachers.read", "teachers.write", "attendance.read", "attendance.write", "grades.read",
    "payments.read", "payments.write", "messages.write", "audit.read",
  ],
  COMPTABLE: [
    "dashboard.finance", "students.read", "teachers.read", "payments.read", "payments.write",
    "payments.cancel", "expenses.read", "expenses.write", "reports.read", "payroll.manage", "messages.write",
  ],
  // Limité à ses groupes (cf. src/server/scope.ts)
  ENSEIGNANT: ["students.read", "academics.read", "attendance.read", "attendance.write", "grades.read", "grades.write"],
  LECTURE: ["students.read", "academics.read", "teachers.read", "attendance.read", "grades.read"],
};

export function can(role: Role, permission: Permission): boolean {
  return MATRIX[role].includes(permission);
}

export function permissionsOf(role: Role): readonly Permission[] {
  return MATRIX[role];
}

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Administrateur",
  RESPONSABLE: "Responsable administratif",
  COMPTABLE: "Comptable",
  ENSEIGNANT: "Enseignant",
  LECTURE: "Lecture seule",
};
