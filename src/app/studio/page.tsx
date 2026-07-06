import { redirect } from "next/navigation";
import { auth } from "@/auth";

/** Protected shell. FABLE-BRIEF M2 ports the full four-stage UI from
 *  reference/ai-use-case-studio.jsx into client components here,
 *  swapping window.storage / in-memory library for the /api/use-cases routes. */
export default async function Studio() {
  const session = await auth();
  if (!session?.user) redirect("/");
  return (
    <main className="p-8">
      <h1 className="text-2xl font-bold">Studio</h1>
      <p className="text-sm mt-2">Signed in as {session.user.email}. UI port lands here (M2).</p>
    </main>
  );
}
