import { CodeTabs } from "@/components/docs/code-tabs";
import { Endpoint } from "@/components/docs/endpoint";
import { ParamTable } from "@/components/docs/param-table";
import { ResponseExample } from "@/components/docs/response-example";
import { buildSamples } from "@/lib/code-samples";
import type { ApiEndpoint } from "@/lib/openapi-spec";

export function EndpointPage({
  endpoint,
  examplePath,
  description,
}: {
  endpoint: ApiEndpoint;
  /** Path used for the live code samples — usually the spec path with sample values substituted. */
  examplePath: string;
  description?: React.ReactNode;
}) {
  const samples = buildSamples({
    method: endpoint.method,
    path: examplePath,
  });
  return (
    <>
      <p className="label-eyebrow">API reference</p>
      <h1 className="font-serif text-4xl font-semibold tracking-tight">
        {endpoint.summary}
      </h1>
      <p className="lead">{endpoint.description}</p>

      <div className="not-prose my-6">
        <Endpoint method={endpoint.method} path={endpoint.path} />
      </div>

      {description}

      {endpoint.parameters && endpoint.parameters.length > 0 ? (
        <>
          <h2>Parameters</h2>
          <div className="not-prose">
            <ParamTable params={endpoint.parameters} />
          </div>
        </>
      ) : null}

      <h2>Example request</h2>
      <div className="not-prose">
        <CodeTabs samples={samples} />
      </div>

      <h2>Example response</h2>
      <div className="not-prose">
        <ResponseExample value={endpoint.exampleResponse} />
      </div>
    </>
  );
}
