import type { PublicEndpoint } from './types';

export type Lang = 'curl' | 'javascript' | 'python' | 'php';

function example(p: PublicEndpoint['params'][number]) {
  if (p.example !== undefined) return String(p.example);
  return p.type === 'integer' || p.type === 'number' ? '1' : p.type === 'boolean' ? 'true' : `your-${p.name}`;
}

export function buildRequest(baseUrl: string, productSlug: string, e: PublicEndpoint, values: Record<string, string> = {}) {
  let path = e.path;
  for (const p of e.params.filter((x) => x.in === 'path')) path = path.replace(`{${p.name}}`, encodeURIComponent(values[p.name] ?? example(p)));
  const qs = new URLSearchParams();
  for (const p of e.params.filter((x) => x.in === 'query')) {
    const v = values[p.name] ?? (p.required ? example(p) : undefined);
    if (v !== undefined && v !== '') qs.set(p.name, v);
  }
  const bodyParams = e.params.filter((x) => x.in === 'body');
  let body: Record<string, unknown> | undefined;
  if (bodyParams.length) {
    body = {};
    for (const p of bodyParams) {
      const v = values[p.name] ?? (p.required ? example(p) : undefined);
      if (v !== undefined && v !== '') body[p.name] = p.type === 'integer' || p.type === 'number' ? Number(v) : p.type === 'boolean' ? v === 'true' : v;
    }
  } else if (e.requestBodyExample && e.method !== 'GET') body = e.requestBodyExample as Record<string, unknown>;
  const url = `${baseUrl}/v1/${productSlug}${path === '/' ? '' : path}${qs.toString() ? `?${qs}` : ''}`;
  return { url, body, method: e.method };
}

export function snippet(lang: Lang, req: { url: string; method: string; body?: unknown }, key = 'YOUR_API_KEY') {
  const body = req.body ? JSON.stringify(req.body, null, 2) : null;
  switch (lang) {
    case 'curl':
      return [`curl -X ${req.method} "${req.url}" \\`, `  -H "Authorization: Bearer ${key}"${body ? ' \\' : ''}`, ...(body ? [`  -H "Content-Type: application/json" \\`, `  -d '${JSON.stringify(req.body)}'`] : [])].join('\n');
    case 'javascript':
      return `const res = await fetch("${req.url}", {\n  method: "${req.method}",\n  headers: {\n    Authorization: "Bearer ${key}",${body ? '\n    "Content-Type": "application/json",' : ''}\n  },${body ? `\n  body: JSON.stringify(${body.replace(/\n/g, '\n  ')}),` : ''}\n});\nif (!res.ok) throw new Error((await res.json()).error.message);\nconst data = await res.json();\nconsole.log(data);`;
    case 'python':
      return `import requests\n\nresp = requests.request(\n    "${req.method}",\n    "${req.url}",\n    headers={"Authorization": "Bearer ${key}"},${body ? `\n    json=${body.replace(/\n/g, '\n    ').replace(/true/g, 'True').replace(/false/g, 'False').replace(/null/g, 'None')},` : ''}\n    timeout=30,\n)\nresp.raise_for_status()\nprint(resp.json())`;
    case 'php':
      return `<?php\n$ch = curl_init("${req.url}");\ncurl_setopt_array($ch, [\n    CURLOPT_CUSTOMREQUEST => "${req.method}",\n    CURLOPT_RETURNTRANSFER => true,\n    CURLOPT_HTTPHEADER => [\n        "Authorization: Bearer ${key}",${body ? '\n        "Content-Type: application/json",' : ''}\n    ],${body ? `\n    CURLOPT_POSTFIELDS => json_encode(${JSON.stringify(req.body)}),` : ''}\n]);\n$response = curl_exec($ch);\n$status = curl_getinfo($ch, CURLINFO_HTTP_CODE);\ncurl_close($ch);\necho $status, PHP_EOL, $response;`;
  }
}
