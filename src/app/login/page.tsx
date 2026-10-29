import Image from "next/image";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth";
import { Form, Input, Submit } from "@/components/form";
import { loginAction } from "./actions";

export const metadata = { title: "Connexion" };

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/dashboard");
  return (
    <div className="flex min-h-screen">
      <div className="hidden flex-1 flex-col justify-between bg-navy p-10 text-white lg:flex">
        <div className="h-1.5 w-24 rounded bg-brand" />
        <div>
          <p className="text-3xl font-bold leading-tight">Votre avenir commence ici,<br />la réussite commence par un pas.</p>
          <p className="mt-4 text-white/70" dir="rtl" lang="ar">مستقبلك يبدأ من هنا، والنجاح يبدأ بخطوة</p>
        </div>
        <div className="text-sm text-white/60">
          <p>Rue de Gaza, Cité Riadh — Kelibia · <span dir="rtl" lang="ar">نهج غزة، حي الرياض، قليبية</span></p>
          <p>Tél. 20 807 657</p>
        </div>
      </div>
      <div className="flex flex-1 items-center justify-center bg-white p-6">
        <div className="w-full max-w-sm">
          <Image src="/brand/logo.png" alt="VAMOS ACADEMY" width={200} height={105} className="mx-auto" priority />
          <h1 className="mt-6 text-center text-xl font-bold text-navy">Espace de gestion</h1>
          <p className="mt-1 text-center text-sm text-muted">Connectez-vous avec votre compte personnel.</p>
          <Form action={loginAction} className="mt-8 space-y-4">
            <Input label="E-mail" name="email" type="email" autoComplete="username" required />
            <Input label="Mot de passe" name="password" type="password" autoComplete="current-password" required />
            <Submit className="w-full">Se connecter</Submit>
          </Form>
        </div>
      </div>
    </div>
  );
}
