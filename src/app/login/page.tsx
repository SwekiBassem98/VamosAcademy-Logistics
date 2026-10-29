import Image from "next/image";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth";
import { Form, Input, Submit } from "@/components/form";
import { loginAction } from "./actions";

export const metadata = { title: "Connexion" };

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/dashboard");
  return (
    <div className="flex min-h-dvh flex-col bg-white lg:flex-row">
      <div className="relative hidden flex-1 flex-col justify-between overflow-hidden bg-navy p-10 text-white lg:flex">
        <div aria-hidden className="absolute -right-24 -bottom-24 size-96 rounded-full border-[48px] border-white/5" />
        <div className="h-1.5 w-24 rounded bg-brand" />
        <div className="relative">
          <p className="font-display text-3xl font-extrabold leading-tight">Votre avenir commence ici,<br />la réussite commence par un pas.</p>
          <p className="mt-4 text-lg text-white/75" dir="rtl" lang="ar">مستقبلك يبدأ من هنا، والنجاح يبدأ بخطوة</p>
        </div>
        <div className="relative text-sm text-white/70">
          <p>Rue de Gaza, Cité Riadh — Kelibia · <span dir="rtl" lang="ar">نهج غزة، حي الرياض، قليبية</span></p>
          <p>Tél. 20 807 657</p>
        </div>
      </div>
      <div className="h-1.5 bg-brand lg:hidden" />
      <main className="flex flex-1 items-center justify-center px-5 pt-[max(2rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))]">
        <div className="w-full max-w-sm">
          <Image src="/brand/logo.png" alt="VAMOS ACADEMY" width={200} height={105} className="mx-auto" priority />
          <h1 className="mt-6 text-center text-2xl font-extrabold text-navy">Espace de gestion</h1>
          <p className="mt-1 text-center text-sm text-muted">Connectez-vous avec votre compte personnel.</p>
          <Form action={loginAction} className="mt-8 space-y-4">
            <Input label="E-mail" name="email" type="email" inputMode="email" autoComplete="username" autoCapitalize="none" spellCheck={false} required />
            <Input label="Mot de passe" name="password" type="password" autoComplete="current-password" required />
            <Submit size="lg" className="w-full">Se connecter</Submit>
          </Form>
          <p className="mt-8 text-center text-xs text-muted lg:hidden">VAMOS ACADEMY · Kelibia · 20 807 657</p>
        </div>
      </main>
    </div>
  );
}
