import { NoteBrowser } from "@/components/NoteBrowser";

export const dynamic = "force-dynamic";

export default async function NotesPage({ searchParams }: PageProps<"/notes">) {
  const params = await searchParams;
  const pick = (key: string) => (typeof params[key] === "string" ? params[key] : undefined);

  return (
    <NoteBrowser
      initialKind={pick("kind")}
      initialQuery={pick("q")}
      initialProject={pick("project")}
      initialTag={pick("tag")}
    />
  );
}
