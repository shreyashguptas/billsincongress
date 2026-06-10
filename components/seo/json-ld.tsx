import type { ReactElement } from 'react';

/**
 * Renders a schema.org JSON-LD block from a server component. The payload is
 * JSON.stringify output (never raw HTML) with `<` escaped to `\\u003c`, so
 * third-party text (bill titles, CRS summaries) can never close the script
 * tag and inject markup.
 */
export function JsonLd({ data }: { data: object }): ReactElement {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, '\\u003c'),
      }}
    />
  );
}
