import { TodoBoard } from "@/components/TodoBoard";

export const dynamic = "force-dynamic";

export default async function TodosPage({ searchParams }: PageProps<"/todos">) {
  const params = await searchParams;
  const project = typeof params.project === "string" ? params.project : undefined;
  return <TodoBoard initialProject={project} />;
}
