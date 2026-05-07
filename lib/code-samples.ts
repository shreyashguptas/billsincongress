/**
 * Generate code samples for one API call across the languages we document.
 * Used by every reference page so adding a language is a one-place change.
 *
 * The samples favor:
 *  - The standard library where possible (fetch, requests, net/http) over
 *    third-party clients we'd then have to install in the docs.
 *  - The shortest correct request — error handling is shown in the
 *    Quickstart, not duplicated everywhere.
 *  - A real-looking authorization header so a copy-paste only needs the
 *    user to swap their token in.
 */

import type { CodeSample } from "@/components/docs/code-tabs";
import { API_BASE_URL } from "@/lib/openapi-spec";

export interface SampleArgs {
  method: "GET";
  path: string; // path including any sample query string
}

const ENV_VAR = "BIC_TOKEN";
const TOKEN_PLACEHOLDER = "$BIC_TOKEN"; // shells expand this; others sub it.

export function buildSamples({ path }: SampleArgs): CodeSample[] {
  const url = `${API_BASE_URL}${path}`;
  const urlForShell = url; // base + path
  return [
    {
      lang: "curl",
      id: "curl",
      code: `curl -s "${urlForShell}" \\
  -H "Authorization: Bearer ${TOKEN_PLACEHOLDER}"`,
    },
    {
      lang: "JavaScript",
      id: "js",
      code: `const res = await fetch("${url}", {
  headers: { Authorization: \`Bearer \${process.env.${ENV_VAR}}\` },
});
const json = await res.json();
console.log(json);`,
    },
    {
      lang: "TypeScript",
      id: "ts",
      code: `const res = await fetch("${url}", {
  headers: { Authorization: \`Bearer \${process.env.${ENV_VAR}}\` },
});
const json: unknown = await res.json();
console.log(json);`,
    },
    {
      lang: "Python",
      id: "python",
      code: `import os, requests

res = requests.get(
    "${url}",
    headers={"Authorization": f"Bearer {os.environ['${ENV_VAR}']}"},
    timeout=30,
)
res.raise_for_status()
print(res.json())`,
    },
    {
      lang: "Ruby",
      id: "ruby",
      code: `require "net/http"
require "json"

uri = URI("${url}")
req = Net::HTTP::Get.new(uri)
req["Authorization"] = "Bearer #{ENV['${ENV_VAR}']}"
res = Net::HTTP.start(uri.hostname, uri.port, use_ssl: true) { |http| http.request(req) }
puts JSON.parse(res.body)`,
    },
    {
      lang: "Go",
      id: "go",
      code: `package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
)

func main() {
	req, _ := http.NewRequest("GET", "${url}", nil)
	req.Header.Set("Authorization", "Bearer "+os.Getenv("${ENV_VAR}"))
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		panic(err)
	}
	defer res.Body.Close()
	var body any
	_ = json.NewDecoder(res.Body).Decode(&body)
	fmt.Printf("%+v\\n", body)
}`,
    },
    {
      lang: "PHP",
      id: "php",
      code: `<?php
$ch = curl_init("${url}");
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
  "Authorization: Bearer " . getenv("${ENV_VAR}"),
]);
$body = curl_exec($ch);
echo $body;`,
    },
    {
      lang: "Rust",
      id: "rust",
      code: `// Cargo.toml: reqwest = { version = "0.12", features = ["json", "blocking"] }
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let token = std::env::var("${ENV_VAR}")?;
    let body = reqwest::blocking::Client::new()
        .get("${url}")
        .bearer_auth(token)
        .send()?
        .json::<serde_json::Value>()?;
    println!("{:#?}", body);
    Ok(())
}`,
    },
    {
      lang: "Java",
      id: "java",
      code: `// java.net.http (JDK 11+)
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;

public class Example {
  public static void main(String[] args) throws Exception {
    var client = HttpClient.newHttpClient();
    var req = HttpRequest.newBuilder(URI.create("${url}"))
        .header("Authorization", "Bearer " + System.getenv("${ENV_VAR}"))
        .build();
    var res = client.send(req, HttpResponse.BodyHandlers.ofString());
    System.out.println(res.body());
  }
}`,
    },
  ];
}
