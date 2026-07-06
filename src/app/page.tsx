import Link from "next/link";
import { auth, signIn } from "@/auth";

export default async function Home() {
  const session = await auth();
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-3xl font-bold">AI Use-Case Studio</h1>
      <p className="max-w-md text-center text-sm opacity-80">
        From raw idea to a defensible build / refine / park decision — with the
        architecture, workflow, data plan and test plan to back it.
      </p>
      {session?.user ? (
        <Link href="/studio" className="underline">Open your studio →</Link>
      ) : (
        <form action={async () => { "use server"; await signIn("google", { redirectTo: "/studio" }); }}>
          <button className="border px-4 py-2" type="submit">Sign in with Google</button>
        </form>
      )}
    </main>
  );
}
