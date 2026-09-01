import { userIdForMcpToken } from "@/lib/auth";
import { MCP_TOOLS } from "@/lib/mcp-tools";

export const dynamic = "force-dynamic";

const PROTOCOL_VERSION = "2025-06-18";
const SUPPORTED_VERSIONS = new Set([PROTOCOL_VERSION, "2025-03-26", "2024-11-05"]);

type JsonRpcRequest = {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
};

function rpcResult(id: JsonRpcRequest["id"], result: unknown) {
  return Response.json({ jsonrpc: "2.0", id, result });
}

function rpcError(id: JsonRpcRequest["id"], code: number, message: string, status = 200) {
  return Response.json({ jsonrpc: "2.0", id, error: { code, message } }, { status });
}

/**
 * Each user has their own MCP token (issued from the web UI, hashed at rest -
 * see `hashMcpToken`). Resolving it here, on every request, ties every tool
 * call below to that specific user's visibility - the same rule the web UI
 * follows: their own unassigned items, plus anything in a project they belong
 * to. There's no shared/admin MCP token that sees everything.
 */
async function authenticate(req: Request): Promise<string | null> {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return null;
  return userIdForMcpToken(token);
}

export async function POST(req: Request) {
  const userId = await authenticate(req);
  if (!userId) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: {
        "Content-Type": "application/json",
        "WWW-Authenticate": 'Bearer realm="scvnote-mcp"',
      },
    });
  }

  let body: JsonRpcRequest;
  try {
    body = (await req.json()) as JsonRpcRequest;
  } catch {
    return rpcError(null, -32700, "Parse error", 400);
  }

  const { id = null, method, params = {} } = body;

  switch (method) {
    case "initialize": {
      const requested = String((params as { protocolVersion?: string }).protocolVersion ?? "");
      return rpcResult(id, {
        protocolVersion: SUPPORTED_VERSIONS.has(requested) ? requested : PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "scvnote", version: "0.2.0" },
        instructions:
          "ScvNote는 여러 사용자가 프로젝트 단위로 공유하는 작업일지/노트 저장소다. 저장은 create_note, " +
          "이어쓰기는 append_to_note, 찾기는 search_notes를 쓴다. 모든 결과는 이 토큰의 주인이 볼 수 있는 " +
          "것으로만 한정된다 - 자신이 만든 미분류 항목과, 멤버로 속한 프로젝트의 항목. 비밀번호 값은 읽을 수 없다.",
      });
    }

    // notifications carry no id and expect no result
    case "notifications/initialized":
    case "notifications/cancelled":
      return new Response(null, { status: 202 });

    case "ping":
      return rpcResult(id, {});

    case "tools/list":
      return rpcResult(id, {
        tools: MCP_TOOLS.map(({ name, title, description, inputSchema }) => ({
          name,
          title,
          description,
          inputSchema,
        })),
      });

    case "tools/call": {
      const { name, arguments: args = {} } = params as {
        name?: string;
        arguments?: Record<string, unknown>;
      };
      const tool = MCP_TOOLS.find((t) => t.name === name);
      if (!tool) return rpcError(id, -32602, `Unknown tool: ${name}`);

      try {
        const output = await tool.run(args, userId);
        return rpcResult(id, {
          content: [{ type: "text", text: JSON.stringify(output, null, 2) }],
          structuredContent: output,
          isError: false,
        });
      } catch (err) {
        // tool failures are reported in-band so the model can react to them
        const message = err instanceof Error ? err.message : String(err);
        return rpcResult(id, {
          content: [{ type: "text", text: `오류: ${message}` }],
          isError: true,
        });
      }
    }

    default:
      return rpcError(id, -32601, `Method not found: ${method}`);
  }
}

/** No server-initiated stream: this server only answers POSTed requests. */
export async function GET() {
  return new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST" } });
}
