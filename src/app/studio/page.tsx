import { redirect } from "next/navigation";
import { auth } from "@/auth";
import StudioApp from "./components/StudioApp";

export default async function Studio() {
  const session = await auth();
  if (!session?.user) redirect("/");
  return <StudioApp />;
}
