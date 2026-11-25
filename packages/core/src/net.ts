import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import http from "node:http";
import https from "node:https";
import { BlockList, isIP, type LookupFunction } from "node:net";
import { brotliDecompressSync, gunzipSync, inflateSync } from "node:zlib";

/**
 * Reading a web page for the model. The address is the model's, and what it has read can steer which address it asks
 * for, so a page may only come from the public internet: nothing on this machine, the local network, a link-local
 * address (where a cloud server answers with its credentials) or any other reserved range. The check is made on the
 * address actually connected to, so a name that resolves to such an address is refused too, and it is made again at
 * every redirect.
 */

const reserved = new BlockList();
// (198.18.0.0/15 is left open: a proxy in fake-IP mode, common where many sites are reached through one, answers every
// name with an address there and makes the real connection itself)
for (const [net, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12],
  ["192.0.0.0", 24], ["192.168.0.0", 16], ["224.0.0.0", 3],
] as const) reserved.addSubnet(net, prefix, "ipv4");
// (an IPv4 address written as IPv6, ::ffff:a.b.c.d, is checked against the IPv4 ranges by the list itself)
for (const [net, prefix] of [["::", 128], ["::1", 128], ["fc00::", 7], ["fe80::", 10], ["ff00::", 8]] as const)
  reserved.addSubnet(net, prefix, "ipv6");

/** Whether an address is one a page may not be read from. */
export function isReservedAddress(address: string): boolean {
  const family = isIP(address);
  return family === 0 || reserved.check(address, family === 6 ? "ipv6" : "ipv4");
}

/** The system's lookup, refusing a name any of whose addresses is reserved. */
const publicLookup: LookupFunction = (host, options, callback) => {
  dnsLookup(host, options, (err, address, family) => {
    if (err) return callback(err, address, family);
    const all: LookupAddress[] = Array.isArray(address) ? address : [{ address, family }];
    if (all.some((a) => isReservedAddress(a.address))) return callback(Object.assign(new Error(`${host} is not a public address`), { code: "EREFUSED" }), "", 0);
    callback(null, address, family);
  });
};

const MAX_BYTES = 5_000_000;
const MAX_REDIRECTS = 5;

type Got = { status: number; type: string; location?: string; body: Buffer };

function get(url: URL, signal: AbortSignal): Promise<Got> {
  const host = url.hostname.replace(/^\[|\]$/g, "");
  // an address written as a number is connected to without a lookup, so it is checked here
  if (isIP(host) && isReservedAddress(host)) return Promise.reject(new Error(`${host} is not a public address`));
  const send = url.protocol === "https:" ? https.request : http.request;
  return new Promise((resolve, reject) => {
    const req = send(url, {
      lookup: publicLookup,
      signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; Kalchas)", Accept: "text/html,text/plain", "Accept-Encoding": "gzip, deflate, br" },
    }, (res) => {
      const status = res.statusCode ?? 0;
      const head = { status, type: String(res.headers["content-type"] ?? ""), location: res.headers.location };
      if (status >= 300 && status < 400) {
        res.resume();
        return resolve({ ...head, body: Buffer.alloc(0) });
      }
      const chunks: Buffer[] = [];
      let size = 0;
      res.on("data", (c: Buffer) => {
        size += c.length;
        if (size > MAX_BYTES) return res.destroy();
        chunks.push(c);
      });
      res.on("close", () => {
        try {
          const raw = Buffer.concat(chunks);
          const enc = String(res.headers["content-encoding"] ?? "").trim().toLowerCase();
          const limit = { maxOutputLength: 4 * MAX_BYTES };
          const body = enc === "gzip" ? gunzipSync(raw, limit) : enc === "deflate" ? inflateSync(raw, limit) : enc === "br" ? brotliDecompressSync(raw, limit) : raw;
          resolve({ ...head, body });
        } catch (err) {
          reject(err);
        }
      });
      res.on("error", reject);
    });
    req.on("error", reject);
    req.end();
  });
}

/** A public page's readable text, or null (many sites refuse plain requests; the search's own excerpt is then all there is). */
export async function readPage(address: string): Promise<string | null> {
  try {
    const signal = AbortSignal.timeout(15_000);
    let url = new URL(address);
    for (let hop = 0; ; hop++) {
      if (url.protocol !== "http:" && url.protocol !== "https:") return null;
      const res = await get(url, signal);
      if (res.status >= 300 && res.status < 400 && res.location && hop < MAX_REDIRECTS) {
        url = new URL(res.location, url);
        continue;
      }
      if (res.status < 200 || res.status >= 300 || !/text|html|json/.test(res.type)) return null;
      const text = res.body
        .toString("utf8")
        .replace(/<(script|style|noscript|svg|nav|footer|header)[\s\S]*?<\/\1>/gi, " ")
        .replace(/<br\s*\/?>|<\/(p|div|li|h\d|tr)>/gi, "\n")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/[ \t]+/g, " ")
        .replace(/\n\s*\n+/g, "\n")
        .trim();
      return text.length > 200 ? text : null;
    }
  } catch {
    return null;
  }
}
