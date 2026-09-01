"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  KIND_LABEL,
  KIND_ORDER,
  UNASSIGNED,
  type KindCounts,
  type ProjectSummary,
  type SessionInfo,
} from "@/lib/types";

/**
 * Projects are the top level of navigation; note kinds (작업일지 / 코드 스니펫 /
 * 일반 노트) hang underneath the project that is currently open.
 */
export function Sidebar() {
  const pathname = usePathname();
  const params = useSearchParams();
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [unassigned, setUnassigned] = useState<KindCounts>({ NOTE: 0, WORKLOG: 0, SNIPPET: 0 });
  const [unassignedTodos, setUnassignedTodos] = useState(0);
  const [session, setSession] = useState<SessionInfo | null>(null);

  const currentProject = params.get("project");
  const onTodos = pathname.startsWith("/todos");
  const currentTag = params.get("tag");
  const currentKind = params.get("kind");
  const onNotes = pathname.startsWith("/notes");

  // reload whenever the route changes, so counts stay honest after edits
  useEffect(() => {
    void fetch("/api/projects")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        setProjects(d.projects);
        setUnassigned(d.unassignedKindCounts);
        setUnassignedTodos(d.unassignedOpenTodos ?? 0);
      });
  }, [pathname, params]);

  useEffect(() => {
    void fetch("/api/auth/session")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setSession(d));
  }, []);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  function renderProject(
    key: string,
    label: string,
    color: string | null,
    counts: KindCounts,
    todoCount: number,
  ) {
    const open = (onNotes || onTodos) && currentProject === key;
    const total = counts.NOTE + counts.WORKLOG + counts.SNIPPET;

    return (
      <div key={key}>
        <NavLink href={`/notes?project=${key}`} active={open && !currentKind} count={total}>
          <span
            aria-hidden
            className="size-2 shrink-0 rounded-full"
            style={{ background: color ?? "var(--border)" }}
          />
          <span className="truncate">{label}</span>
        </NavLink>

        {open && (
          <div className="ml-3 border-l border-[var(--border)] pl-2">
            {KIND_ORDER.map((kind) => (
              <NavLink
                key={kind}
                href={`/notes?project=${key}&kind=${kind}`}
                active={currentKind === kind}
                count={counts[kind]}
                small
              >
                <span className="truncate">{KIND_LABEL[kind]}</span>
              </NavLink>
            ))}
            <NavLink href={`/todos?project=${key}`} active={onTodos} count={todoCount} small>
              <span className="truncate">할 일</span>
            </NavLink>
          </div>
        )}
      </div>
    );
  }

  return (
    <aside className="flex w-56 shrink-0 flex-col overflow-y-auto border-r border-[var(--border)] bg-[var(--surface)] p-3">
      <Link href="/notes" className="px-2 py-1 text-lg font-bold">
        ScvNote
      </Link>

      <div className="mt-5 flex items-center justify-between px-2">
        <span className="text-xs font-medium tracking-wide text-[var(--muted)]">프로젝트</span>
        <Link href="/projects" className="text-xs text-[var(--muted)] hover:text-[var(--accent)]">
          관리
        </Link>
      </div>

      <nav className="mt-1 flex flex-col gap-0.5">
        {projects.map((p) => renderProject(p.id, p.name, p.color, p.kindCounts, p.openTodos))}

        {/* the default bucket - always visible, even when empty */}
        {renderProject(UNASSIGNED, "미분류", null, unassigned, unassignedTodos)}

        <Link
          href="/projects"
          className="rounded-md px-2 py-1.5 text-sm text-[var(--muted)] hover:bg-[var(--background)]"
        >
          + 프로젝트 만들기
        </Link>
      </nav>

      <div className="mt-6 flex flex-col gap-0.5 border-t border-[var(--border)] pt-3">
        <NavLink href="/notes" active={onNotes && !currentProject && !currentTag}>
          <span className="truncate">전체 노트</span>
        </NavLink>
        <NavLink href="/todos" active={onTodos && !currentProject}>
          <span className="truncate">할 일 전체</span>
        </NavLink>
        <NavLink href="/tags" active={pathname.startsWith("/tags")}>
          <span className="truncate">태그</span>
        </NavLink>
        <NavLink href="/secrets" active={pathname.startsWith("/secrets")}>
          <span className="truncate">비밀번호</span>
        </NavLink>
      </div>

      <div className="mt-auto flex flex-col gap-0.5 border-t border-[var(--border)] pt-3">
        {session?.isAdmin && (
          <NavLink href="/admin" active={pathname.startsWith("/admin")}>
            <span className="truncate">관리자</span>
          </NavLink>
        )}
        <NavLink href="/settings" active={pathname.startsWith("/settings")}>
          <span className="truncate">설정{session?.email ? ` · ${session.email}` : ""}</span>
        </NavLink>
        <button
          onClick={logout}
          className="rounded-md px-2 py-1.5 text-left text-sm text-[var(--muted)] hover:bg-[var(--background)]"
        >
          로그아웃
        </button>
      </div>
    </aside>
  );
}

function NavLink({
  href,
  active,
  count,
  small,
  children,
}: {
  href: string;
  active: boolean;
  count?: number;
  small?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-2 rounded-md px-2 transition ${
        small ? "py-1 text-[13px]" : "py-1.5 text-sm"
      } ${
        active
          ? "bg-[var(--background)] font-medium"
          : "text-[var(--muted)] hover:bg-[var(--background)]"
      }`}
    >
      {children}
      {count !== undefined && count > 0 && (
        <span className="ml-auto shrink-0 text-xs text-[var(--muted)]">{count}</span>
      )}
    </Link>
  );
}
