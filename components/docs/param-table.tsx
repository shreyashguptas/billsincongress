import type { ApiParameter } from "@/lib/openapi-spec";

export function ParamTable({ params }: { params: ApiParameter[] }) {
  if (params.length === 0) return null;
  return (
    <div className="border border-border rounded-md overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-secondary/40 text-left">
            <th className="px-3 py-2 font-medium text-xs uppercase tracking-wider text-muted-foreground">
              Parameter
            </th>
            <th className="px-3 py-2 font-medium text-xs uppercase tracking-wider text-muted-foreground">
              Type
            </th>
            <th className="px-3 py-2 font-medium text-xs uppercase tracking-wider text-muted-foreground">
              Description
            </th>
          </tr>
        </thead>
        <tbody>
          {params.map((p) => (
            <tr key={p.name} className="border-b border-border last:border-0">
              <td className="px-3 py-2 align-top">
                <code className="font-mono text-[12px]">{p.name}</code>
                {p.in === "path" || p.required ? (
                  <span className="ml-1 text-[10px] uppercase tracking-wider text-rose-700 dark:text-rose-300">
                    required
                  </span>
                ) : null}
                {p.in === "query" ? (
                  <span className="ml-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                    query
                  </span>
                ) : null}
              </td>
              <td className="px-3 py-2 align-top">
                <code className="font-mono text-[12px] text-muted-foreground">
                  {p.schema.type}
                </code>
              </td>
              <td className="px-3 py-2 align-top text-sm">{p.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
