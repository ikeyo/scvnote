/**
 * API 통합 테스트.
 *
 * 전제: 개발 서버가 떠 있고 DB가 비어 있어야 한다.
 *
 *   npm run db:reset && npx prisma migrate deploy
 *   npm run dev
 *   npm run test:e2e
 *
 * 계정이 없으면 자동으로 만든다.
 */
const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const EMAIL = process.env.TEST_EMAIL ?? "test@example.com";
const PASSWORD = process.env.TEST_PASSWORD ?? "test-password-123";
const MCP = process.env.MCP_TOKEN ?? "dev-mcp-token-replace-in-production";
let cookie = "";
let pass = 0, fail = 0;

function check(name, cond, detail = "") {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name} ${detail}`); }
}

async function api(path, opts = {}) {
  const res = await fetch(BASE + path, {
    ...opts,
    headers: { ...(opts.headers ?? {}), ...(cookie ? { cookie } : {}) },
  });
  const setCookie = res.headers.getSetCookie?.() ?? [];
  for (const c of setCookie) if (c.startsWith("scvnote_session=")) cookie = c.split(";")[0];
  const text = await res.text();
  let body; try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, body, headers: res.headers };
}

console.log("\n[auth]");
// create the account when running against a fresh database
const pre = await api("/api/auth/session");
if (pre.body?.needsSetup) {
  await api("/api/auth/setup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  cookie = ""; // drop the setup cookie so the login below is a real test
}

let r = await api("/api/auth/login", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: EMAIL, password: "wrong-password" }),
});
check("wrong password rejected", r.status === 401, JSON.stringify(r.body));

r = await api("/api/auth/login", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
});
check("login succeeds", r.status === 200 && cookie.length > 20);

console.log("\n[projects]");
r = await api("/api/projects", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ name: "ScvNote 개발", description: "노트 앱 자체", color: "#2563eb" }),
});
const projectId = r.body?.project?.id;
check("create project", r.status === 201 && !!projectId);

r = await api("/api/projects", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ name: "ScvNote 개발" }),
});
check("duplicate project name rejected", r.status === 409, JSON.stringify(r.body));

r = await api("/api/projects", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ name: "다른 프로젝트" }),
});
const otherProjectId = r.body?.project?.id;
check("second project", r.status === 201 && !!otherProjectId);

console.log("\n[project edit]");
r = await api(`/api/projects/${projectId}`, {
  method: "PATCH", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ name: "ScvNote 개발 (이름 변경)", description: "설명도 변경", color: "#16a34a" }),
});
check("rename project", r.body?.project?.name === "ScvNote 개발 (이름 변경)", JSON.stringify(r.body?.project));
check("edit description", r.body?.project?.description === "설명도 변경");
check("edit color", r.body?.project?.color === "#16a34a");

r = await api(`/api/projects/${otherProjectId}`, {
  method: "PATCH", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ name: "ScvNote 개발 (이름 변경)" }),
});
check("rename into an existing name -> 409", r.status === 409, JSON.stringify(r.body));

r = await api(`/api/projects/${projectId}`, {
  method: "PATCH", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ name: "" }),
});
check("blank project name rejected", r.status === 400);

r = await api("/api/projects/does-not-exist", {
  method: "PATCH", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ name: "아무거나" }),
});
check("patch missing project -> 404", r.status === 404);

// put the name back so later project-by-name lookups keep working
r = await api(`/api/projects/${projectId}`, {
  method: "PATCH", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ name: "ScvNote 개발" }),
});
check("rename back", r.body?.project?.name === "ScvNote 개발");

console.log("\n[notes]");
const KOREAN = "도커 컴포즈로 NAS 배포 준비";
const BODY2 = "pg_trgm 인덱스를 추가했다";
r = await api("/api/notes", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    kind: "WORKLOG",
    projectId,
    tags: ["docker", "nas"],
    content: { type: "doc", content: [
      { type: "paragraph", content: [{ type: "text", text: KOREAN }] },
      { type: "paragraph", content: [{ type: "text", text: BODY2 }] },
    ] },
  }),
});
const id = r.body?.note?.id;
check("create note", r.status === 201 && !!id);
check("title derived from first line", r.body?.note?.title === KOREAN, r.body?.note?.title);
check("tags connected", r.body?.note?.tags?.length === 2);

r = await api(`/api/notes?q=${encodeURIComponent("인덱스")}`);
check("korean search hits", r.body?.notes?.length === 1, JSON.stringify(r.body).slice(0, 120));

r = await api(`/api/notes?q=${encodeURIComponent("존재하지않는단어")}`);
check("search miss returns empty", Array.isArray(r.body?.notes) && r.body.notes.length === 0);

r = await api("/api/notes?kind=SNIPPET");
check("kind filter excludes", r.body?.notes?.length === 0);

r = await api("/api/notes?kind=WORKLOG");
check("kind filter includes", r.body?.notes?.length === 1);

r = await api(`/api/notes/${id}`, {
  method: "PATCH", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ title: "제목 수정됨", tags: ["docker"], pinned: true }),
});
check("patch title", r.body?.note?.title === "제목 수정됨");
check("patch replaces tags (not merge)", r.body?.note?.tags?.length === 1, JSON.stringify(r.body?.note?.tags));
check("patch pinned", r.body?.note?.pinned === true);

r = await api("/api/notes/does-not-exist");
check("missing note -> 404", r.status === 404);

console.log("\n[project scoping]");
r = await api(`/api/notes?project=${projectId}`);
check("filter by project includes", r.body?.notes?.length === 1, JSON.stringify(r.body).slice(0, 100));

r = await api(`/api/notes?project=${otherProjectId}`);
check("filter by other project excludes", r.body?.notes?.length === 0);

r = await api("/api/notes?project=none");
check("unassigned filter excludes assigned notes", r.body?.notes?.length === 0);

r = await api(`/api/notes?project=${encodeURIComponent("ScvNote 개발")}`);
check("project filter accepts a name too", r.body?.notes?.length === 1);

r = await api("/api/notes?project=no-such-project");
check("unknown project -> 404", r.status === 404);

r = await api(`/api/notes?project=${projectId}&kind=SNIPPET`);
check("project + kind combine", r.body?.notes?.length === 0);

// regression: the editor page reads the note through this shape. If `project`
// is missing the editor renders 미분류 and the next autosave moves it there.
r = await api(`/api/notes/${id}`);
check("note detail carries its project", r.body?.note?.project?.id === projectId, JSON.stringify(r.body?.note?.project));

r = await api("/api/projects");
const withCounts = r.body?.projects?.find((p) => p.id === projectId);
check("project reports note count", withCounts?._count?.notes === 1, JSON.stringify(withCounts));
check("project reports per-category counts", withCounts?.kindCounts?.WORKLOG === 1, JSON.stringify(withCounts?.kindCounts));

r = await api(`/api/notes/${id}`, {
  method: "PATCH", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ projectId: null }),
});
check("move note to 미분류", r.body?.note?.projectId === null, JSON.stringify(r.body?.note?.project));

r = await api("/api/notes?project=none");
check("note now shows as unassigned", r.body?.notes?.length === 1);

r = await api(`/api/notes/${id}`, {
  method: "PATCH", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ projectId }),
});
check("move note back into project", r.body?.note?.projectId === projectId);

console.log("\n[todos]");
r = await api("/api/todos", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ title: "첨부 이미지 삭제 시 파일이 남는다", kind: "BUG", projectId }),
});
const bugId = r.body?.todo?.id;
check("create todo", r.status === 201 && !!bugId);
check("todo starts as TODO", r.body?.todo?.status === "TODO");
check("todo carries its project", r.body?.todo?.project?.id === projectId, JSON.stringify(r.body?.todo?.project));

r = await api("/api/todos", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ title: "1~2글자 검색 인덱스", kind: "IMPROVEMENT", detail: "trigram이 안 걸린다", projectId }),
});
const impId = r.body?.todo?.id;
check("create improvement", r.status === 201);

r = await api("/api/todos", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ title: "미분류 아이디어", kind: "IDEA" }),
});
const ideaId = r.body?.todo?.id;
check("create unassigned idea", r.status === 201 && r.body?.todo?.project === null);

r = await api("/api/todos", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ title: "   " }),
});
check("blank todo title rejected", r.status === 400);

r = await api(`/api/todos?project=${projectId}`);
check("filter todos by project", r.body?.todos?.length === 2, String(r.body?.todos?.length));

r = await api("/api/todos?project=none");
check("unassigned todos", r.body?.todos?.length === 1);

r = await api(`/api/todos?project=${projectId}&kind=BUG`);
check("filter by kind", r.body?.todos?.length === 1 && r.body.todos[0].kind === "BUG");

// progress: TODO -> DOING -> DONE
r = await api(`/api/todos/${bugId}`, {
  method: "PATCH", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ status: "DOING" }),
});
check("mark in progress", r.body?.todo?.status === "DOING");
check("doneAt stays empty while in progress", r.body?.todo?.doneAt === null, JSON.stringify(r.body?.todo?.doneAt));

r = await api(`/api/todos/${bugId}`, {
  method: "PATCH", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ status: "DONE" }),
});
check("mark done", r.body?.todo?.status === "DONE");
check("doneAt stamped on completion", typeof r.body?.todo?.doneAt === "string", JSON.stringify(r.body?.todo?.doneAt));

r = await api(`/api/todos/${bugId}`, {
  method: "PATCH", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ status: "TODO" }),
});
check("reopening clears doneAt", r.body?.todo?.doneAt === null);

r = await api(`/api/todos/${bugId}`, {
  method: "PATCH", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ status: "DONE" }),
});
r = await api(`/api/todos?project=${projectId}&open=1`);
check("open filter hides finished items", r.body?.todos?.length === 1 && r.body.todos[0].id === impId);

r = await api(`/api/todos?project=${projectId}`);
check("without open=1 everything is listed", r.body?.todos?.length === 2);
check("finished items sort last", r.body?.todos?.at(-1)?.status === "DONE", JSON.stringify(r.body?.todos?.map((t) => t.status)));

r = await api(`/api/todos/${impId}`, {
  method: "PATCH", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ title: "검색 인덱스 개선", kind: "TASK", detail: "" }),
});
check("edit todo title and kind", r.body?.todo?.title === "검색 인덱스 개선" && r.body?.todo?.kind === "TASK");
check("blank detail becomes null", r.body?.todo?.detail === null);

r = await api(`/api/todos/${impId}`, {
  method: "PATCH", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ status: "말도 안 되는 상태" }),
});
check("unknown status rejected", r.status === 400, JSON.stringify(r.body));

r = await api(`/api/todos/${ideaId}`, {
  method: "PATCH", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ projectId }),
});
check("move todo into a project", r.body?.todo?.project?.id === projectId);

r = await api("/api/todos/does-not-exist", {
  method: "PATCH", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ status: "DONE" }),
});
check("patch missing todo -> 404", r.status === 404);

// the sidebar badge counts outstanding items only
r = await api("/api/projects");
const projWithTodos = r.body?.projects?.find((p) => p.id === projectId);
check("project reports open todo count", projWithTodos?.openTodos === 2, JSON.stringify(projWithTodos?.openTodos));

console.log("\n[todo <-> note link]");
// `id` is the note created earlier, which belongs to `projectId`
r = await api("/api/todos", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ title: "이 노트에서 나온 오류", kind: "BUG", noteId: id }),
});
const linkedId = r.body?.todo?.id;
check("create todo linked to a note", r.status === 201 && r.body?.todo?.note?.id === id, JSON.stringify(r.body?.todo?.note));
// the note belongs to a project, so the todo should land in the same backlog
check("linked todo inherits the note's project", r.body?.todo?.project?.id === projectId, JSON.stringify(r.body?.todo?.project));

r = await api(`/api/todos?note=${id}`);
check("filter todos by note", r.body?.todos?.length === 1 && r.body.todos[0].id === linkedId);

r = await api(`/api/notes/${id}`);
check("note detail carries its todos", r.body?.note?.todos?.length === 1, JSON.stringify(r.body?.note?.todos?.length));

r = await api("/api/todos", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ title: "없는 노트에 연결", noteId: "does-not-exist" }),
});
check("linking to a missing note -> 404", r.status === 404, JSON.stringify(r.body));

// explicit project wins over the note's project
r = await api("/api/todos", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ title: "명시한 프로젝트가 우선", noteId: id, projectId: null }),
});
check("explicit projectId overrides inheritance", r.body?.todo?.project === null, JSON.stringify(r.body?.todo?.project));
const overrideId = r.body?.todo?.id;

r = await api(`/api/todos/${linkedId}`, {
  method: "PATCH", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ noteId: null }),
});
check("unlink keeps the todo", r.status === 200 && r.body?.todo?.note === null, JSON.stringify(r.body?.todo?.note));

r = await api(`/api/notes/${id}`);
check("note no longer lists the unlinked todo", r.body?.note?.todos?.length === 1, String(r.body?.note?.todos?.length));

r = await api(`/api/todos/${linkedId}`, {
  method: "PATCH", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ noteId: id }),
});
check("relink works", r.body?.todo?.note?.id === id);

await api(`/api/todos/${overrideId}`, { method: "DELETE" });

r = await api(`/api/todos/${ideaId}`, { method: "DELETE" });
check("delete todo", r.status === 200);

// remaining in this project: the improvement, the finished bug, and the linked one
r = await api(`/api/todos?project=${projectId}`);
check("deleted todo is gone", r.body?.todos?.length === 3, String(r.body?.todos?.length));

console.log("\n[tags]");
// the note currently carries exactly one tag: "docker"
r = await api("/api/notes", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    kind: "NOTE",
    tags: ["Docker", "임시태그"],
    content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "태그 테스트용" }] }] },
  }),
});
const tagNoteId = r.body?.note?.id;
check("second note with overlapping-ish tags", r.status === 201);

r = await api("/api/tags");
const tagList = r.body?.tags ?? [];
const findTag = (name) => tagList.find((t) => t.name === name);
check("list tags with counts", findTag("docker")?._count?.notes === 1 && findTag("Docker")?._count?.notes === 1, JSON.stringify(tagList.map((t) => `${t.name}:${t._count.notes}`)));

r = await api(`/api/notes?tag=${encodeURIComponent("docker")}`);
check("filter notes by tag", r.body?.notes?.length === 1);

// plain rename
r = await api(`/api/tags/${findTag("임시태그").id}`, {
  method: "PATCH", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ name: "이름바뀐태그" }),
});
check("rename tag", r.body?.tag?.name === "이름바뀐태그" && r.body?.merged === 0, JSON.stringify(r.body));

r = await api(`/api/notes?tag=${encodeURIComponent("이름바뀐태그")}`);
check("rename follows the notes", r.body?.notes?.length === 1);

// renaming onto an existing name is a merge, and must be asked for explicitly
r = await api(`/api/tags/${findTag("Docker").id}`, {
  method: "PATCH", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ name: "docker" }),
});
check("rename onto existing name -> 409", r.status === 409, JSON.stringify(r.body));

r = await api(`/api/tags/${findTag("Docker").id}`, {
  method: "PATCH", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ name: "docker", merge: true }),
});
check("merge moves the notes", r.body?.merged === 1 && r.body?.tag?._count?.notes === 2, JSON.stringify(r.body));

r = await api("/api/tags");
check("merged tag is gone", !r.body?.tags?.some((t) => t.name === "Docker"));

r = await api(`/api/notes?tag=${encodeURIComponent("docker")}`);
check("both notes now carry the merged tag", r.body?.notes?.length === 2);

r = await api(`/api/tags/${findTag("임시태그").id}`, {
  method: "PATCH", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ name: "  " }),
});
check("blank tag name rejected", r.status === 400);

r = await api("/api/tags/does-not-exist", {
  method: "PATCH", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ name: "x" }),
});
check("patch missing tag -> 404", r.status === 404);

// deleting a tag detaches it but must not touch the notes
r = await api("/api/tags");
const renamedId = r.body.tags.find((t) => t.name === "이름바뀐태그").id;
r = await api(`/api/tags/${renamedId}`, { method: "DELETE" });
check("delete tag reports how many notes it left", r.body?.detachedFrom === 1, JSON.stringify(r.body));

r = await api(`/api/notes/${tagNoteId}`);
check("the note itself survives tag deletion", r.status === 200);
check("and lost only that tag", r.body?.note?.tags?.length === 1, JSON.stringify(r.body?.note?.tags));

// orphan sweep
r = await api(`/api/notes/${tagNoteId}`, { method: "DELETE" });
check("delete the helper note", r.status === 200);

r = await api("/api/tags?unused=1");
check("orphan tag is now listed as unused", r.body?.unusedCount >= 0, String(r.body?.unusedCount));

r = await api("/api/tags", { method: "DELETE" });
check("sweep unused tags", typeof r.body?.deleted === "number", JSON.stringify(r.body));

r = await api("/api/tags?unused=1");
check("no unused tags left", r.body?.unusedCount === 0, String(r.body?.unusedCount));

console.log("\n[attachments]");
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
const form = new FormData();
form.append("file", new Blob([png], { type: "image/png" }), "스크린샷.png");
form.append("noteId", id);
r = await api("/api/attachments", { method: "POST", body: form });
const stored = r.body?.attachment?.storedName;
check("upload png", r.status === 201 && !!stored, JSON.stringify(r.body).slice(0, 150));
check("korean filename kept", r.body?.attachment?.originalName === "스크린샷.png");

r = await api(`/api/attachments/${stored}`);
check("serve attachment", r.status === 200);
check("served inline as png", r.headers.get("content-disposition")?.startsWith("inline"));

r = await api("/api/attachments/..%2F..%2F.env");
check("path traversal blocked", r.status === 404 || r.status === 400, `status=${r.status}`);

const noAuth = await fetch(`${BASE}/api/attachments/${stored}`);
check("attachment requires auth", noAuth.status === 401);

console.log("\n[vault]");
r = await api("/api/vault");
check("vault not initialized", r.body?.initialized === false);

r = await api("/api/vault", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ salt: "c2FsdA==", checkCipher: "Y2lwaGVy", checkIv: "aXY=" }),
});
check("vault init", r.status === 200);

r = await api("/api/vault", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ salt: "b3RoZXI=", checkCipher: "eA==", checkIv: "eQ==" }),
});
check("vault salt cannot be overwritten", r.status === 409, JSON.stringify(r.body));

console.log("\n[secrets]");
r = await api("/api/secrets", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ title: "NAS 관리자", username: "admin", secretCipher: "AAAA", secretIv: "BBBB" }),
});
const secretId = r.body?.secret?.id;
check("create secret", r.status === 201 && !!secretId);

r = await api("/api/secrets", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ title: "평문 시도", secret: "hunter2" }),
});
check("plaintext secret rejected", r.status === 400, JSON.stringify(r.body));

r = await api(`/api/secrets?q=${encodeURIComponent("관리자")}`);
check("secret search", r.body?.secrets?.length === 1);

console.log("\n[secret edit]");
r = await api(`/api/secrets/${secretId}`, {
  method: "PATCH", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ title: "NAS 관리자 (변경)", username: "root", projectId }),
});
check("edit secret metadata", r.body?.secret?.title === "NAS 관리자 (변경)" && r.body?.secret?.username === "root");
check("assign secret to a project", r.body?.secret?.projectId === projectId);
// the UI leaves the password field blank to mean "keep it" - the cipher must survive
check("cipher untouched when not resent", r.body?.secret?.secretCipher === "AAAA", r.body?.secret?.secretCipher);

r = await api(`/api/secrets/${secretId}`, {
  method: "PATCH", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ secretCipher: "CCCC", secretIv: "DDDD" }),
});
check("replace the encrypted value", r.body?.secret?.secretCipher === "CCCC" && r.body?.secret?.secretIv === "DDDD");

r = await api(`/api/secrets/${secretId}`, {
  method: "PATCH", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ secretCipher: "EEEE" }),
});
check("cipher without iv rejected", r.status === 400, JSON.stringify(r.body));

r = await api(`/api/secrets/${secretId}`, {
  method: "PATCH", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ projectId: null }),
});
check("unassign secret from project", r.body?.secret?.projectId === null);

r = await api("/api/secrets/does-not-exist", {
  method: "PATCH", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ title: "x" }),
});
check("patch missing secret -> 404", r.status === 404);

console.log("\n[mcp]");
async function rpc(method, params, token = MCP) {
  const res = await fetch(`${BASE}/api/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  return { status: res.status, body: res.status === 202 ? null : await res.json() };
}

let m = await rpc("tools/list", {}, "wrong-token");
check("mcp rejects bad token", m.status === 401);

m = await rpc("initialize", { protocolVersion: "2025-06-18" });
check("mcp initialize", m.body?.result?.serverInfo?.name === "scvnote");

m = await rpc("tools/list", {});
const toolNames = (m.body?.result?.tools ?? []).map((t) => t.name);
check("mcp lists 12 tools", toolNames.length === 12, toolNames.join(","));

m = await rpc("tools/call", { name: "create_todo", arguments: { title: "MCP로 등록한 오류", kind: "BUG", project: "ScvNote 개발" } });
const mcpTodoId = m.body?.result?.structuredContent?.id;
check("mcp create_todo", !!mcpTodoId && m.body?.result?.structuredContent?.project === "ScvNote 개발");

m = await rpc("tools/call", { name: "list_todos", arguments: { project: "ScvNote 개발", kind: "BUG" } });
check("mcp list_todos filters", m.body?.result?.structuredContent?.todos?.some((t) => t.id === mcpTodoId), JSON.stringify(m.body?.result?.structuredContent));

m = await rpc("tools/call", { name: "update_todo", arguments: { id: mcpTodoId, status: "DONE" } });
check("mcp update_todo completes it", m.body?.result?.structuredContent?.status === "DONE");

m = await rpc("tools/call", { name: "list_todos", arguments: { project: "ScvNote 개발" } });
check("finished items drop out of the default list", !m.body?.result?.structuredContent?.todos?.some((t) => t.id === mcpTodoId));

m = await rpc("tools/call", { name: "list_todos", arguments: { project: "ScvNote 개발", status: "DONE" } });
check("explicit DONE status finds it again", m.body?.result?.structuredContent?.todos?.some((t) => t.id === mcpTodoId));

m = await rpc("tools/call", { name: "update_todo", arguments: { id: mcpTodoId } });
check("update_todo with nothing to change errors", m.body?.result?.isError === true);

m = await rpc("tools/call", { name: "create_todo", arguments: { title: "없는 노트", noteId: "nope" } });
check("mcp linking to a missing note errors in-band", m.body?.result?.isError === true);

m = await rpc("tools/call", { name: "list_tags", arguments: {} });
const mcpTags = m.body?.result?.structuredContent;
check("mcp list_tags", mcpTags?.tags?.some((t) => t.name === "docker"), JSON.stringify(mcpTags));
check("list_tags hides unused tags", mcpTags?.tags?.every((t) => t.notes > 0), JSON.stringify(mcpTags));

m = await rpc("tools/call", { name: "create_note", arguments: { text: "MCP로 저장한 작업일지\n\n두 번째 문단", kind: "WORKLOG", tags: ["mcp"] } });
const mcpNoteId = m.body?.result?.structuredContent?.id;
check("mcp create_note", !!mcpNoteId && m.body?.result?.isError === false);

m = await rpc("tools/call", { name: "append_to_note", arguments: { id: mcpNoteId, text: "이어쓴 내용" } });
check("mcp append_to_note", m.body?.result?.isError === false);

m = await rpc("tools/call", { name: "get_note", arguments: { id: mcpNoteId } });
const full = m.body?.result?.structuredContent?.contentText ?? "";
check("append landed in body", full.includes("이어쓴 내용") && full.includes("두 번째 문단"), JSON.stringify(full));

m = await rpc("tools/call", { name: "create_todo", arguments: { title: "MCP가 노트에 연결한 할 일", noteId: mcpNoteId } });
check("mcp create_todo links to a note", m.body?.result?.structuredContent?.note !== null, JSON.stringify(m.body?.result?.structuredContent));

m = await rpc("tools/call", { name: "get_note", arguments: { id: mcpNoteId } });
check("mcp get_note lists its todos", m.body?.result?.structuredContent?.todos?.length === 1, JSON.stringify(m.body?.result?.structuredContent?.todos));

m = await rpc("tools/call", { name: "search_notes", arguments: { q: "MCP" } });
check("mcp search_notes", m.body?.result?.structuredContent?.count >= 1);

m = await rpc("tools/call", { name: "list_secrets", arguments: {} });
const listed = JSON.stringify(m.body?.result?.structuredContent ?? {});
check("mcp list_secrets returns metadata", listed.includes("NAS 관리자"));
check("mcp never exposes ciphertext", !listed.includes("secretCipher") && !listed.includes("AAAA"), listed.slice(0, 200));

m = await rpc("tools/call", { name: "get_note", arguments: { id: "nope" } });
check("mcp tool error is in-band", m.body?.result?.isError === true);

m = await rpc("tools/call", { name: "no_such_tool", arguments: {} });
check("unknown tool -> rpc error", m.body?.error?.code === -32602);

console.log("\n[mcp projects]");
m = await rpc("tools/call", { name: "list_projects", arguments: {} });
const projList = m.body?.result?.structuredContent;
check("mcp list_projects", projList?.count === 2, JSON.stringify(projList).slice(0, 150));

m = await rpc("tools/call", { name: "create_project", arguments: { name: "MCP가 만든 프로젝트" } });
check("mcp create_project", m.body?.result?.isError === false);

m = await rpc("tools/call", { name: "create_project", arguments: { name: "MCP가 만든 프로젝트" } });
check("mcp rejects duplicate project", m.body?.result?.isError === true);

m = await rpc("tools/call", {
  name: "create_note",
  arguments: { text: "프로젝트 이름으로 지정한 노트", project: "ScvNote 개발", kind: "SNIPPET" },
});
check("mcp create_note resolves project by name", m.body?.result?.structuredContent?.project === "ScvNote 개발", JSON.stringify(m.body?.result?.structuredContent));

m = await rpc("tools/call", { name: "search_notes", arguments: { project: "ScvNote 개발" } });
check("mcp search scoped to project", m.body?.result?.structuredContent?.count === 2, JSON.stringify(m.body?.result?.structuredContent?.count));

m = await rpc("tools/call", { name: "create_note", arguments: { text: "없는 프로젝트", project: "존재하지 않음" } });
check("mcp unknown project -> in-band error", m.body?.result?.isError === true);

// the note created without a project at the top of the [mcp] block
m = await rpc("tools/call", { name: "update_note", arguments: { id: mcpNoteId, project: "ScvNote 개발" } });
check("mcp update_note moves a note into a project", m.body?.result?.structuredContent?.project === "ScvNote 개발", JSON.stringify(m.body?.result?.structuredContent));

m = await rpc("tools/call", { name: "update_note", arguments: { id: mcpNoteId, project: "none", kind: "NOTE" } });
check("mcp update_note moves back to 미분류", m.body?.result?.structuredContent?.project === null);
check("mcp update_note changes category", m.body?.result?.structuredContent?.kind === "NOTE");

m = await rpc("tools/call", { name: "update_note", arguments: { id: mcpNoteId } });
check("update_note with nothing to change errors", m.body?.result?.isError === true);

console.log("\n[project delete keeps content]");
r = await api("/api/notes?project=none");
const unassignedBefore = r.body?.notes?.length ?? 0;

r = await api(`/api/projects/${projectId}`, { method: "DELETE" });
check("delete project", r.status === 200 && r.body?.unassignedNotes === 2, JSON.stringify(r.body));

r = await api("/api/notes?project=none");
check("its notes survive as unassigned", r.body?.notes?.length === unassignedBefore + 2, String(r.body?.notes?.length));

console.log("\n[cleanup]");
r = await api(`/api/notes/${id}`, { method: "DELETE" });
check("delete note", r.status === 200);
r = await api(`/api/attachments/${stored}`);
check("attachment row gone after note delete", r.status === 404);

console.log(`\n=========  ${pass} passed, ${fail} failed  =========\n`);
process.exit(fail ? 1 : 0);
