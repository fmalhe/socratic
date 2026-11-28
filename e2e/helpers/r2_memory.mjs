import crypto from "node:crypto";

async function toUint8Array(value) {
  if (value === null || value === undefined) {
    return new Uint8Array(0);
  }
  if (value instanceof Uint8Array) {
    return new Uint8Array(value);
  }
  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value.slice(0));
  }
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength));
  }
  if (typeof value === "string") {
    return new TextEncoder().encode(value);
  }
  if (typeof value.arrayBuffer === "function") {
    return new Uint8Array(await value.arrayBuffer());
  }
  if (typeof value.getReader === "function") {
    const reader = value.getReader();
    const chunks = [];
    let total = 0;
    while (true) {
      const { value: chunk, done } = await reader.read();
      if (done) break;
      if (chunk) {
        chunks.push(chunk);
        total += chunk.byteLength;
      }
    }
    const merged = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return merged;
  }
  throw new Error("Unsupported R2 put value type");
}

function bytesToStream(bytes) {
  return new ReadableStream({
    start(controller) {
      if (bytes.byteLength > 0) {
        controller.enqueue(bytes);
      }
      controller.close();
    },
  });
}

function makeWriteHttpMetadata(httpMetadata = {}) {
  return (headers) => {
    if (httpMetadata.contentType) {
      headers.set("Content-Type", httpMetadata.contentType);
    }
    if (httpMetadata.contentLanguage) {
      headers.set("Content-Language", httpMetadata.contentLanguage);
    }
    if (httpMetadata.contentDisposition) {
      headers.set("Content-Disposition", httpMetadata.contentDisposition);
    }
    if (httpMetadata.contentEncoding) {
      headers.set("Content-Encoding", httpMetadata.contentEncoding);
    }
    if (httpMetadata.cacheControl) {
      headers.set("Cache-Control", httpMetadata.cacheControl);
    }
    if (httpMetadata.cacheExpiry) {
      headers.set("Expires", new Date(httpMetadata.cacheExpiry).toUTCString());
    }
  };
}

export function createR2Memory() {
  const store = new Map();

  function buildMetaObject(entry) {
    return {
      key: entry.key,
      version: entry.version,
      size: entry.bytes.byteLength,
      etag: entry.etag,
      httpEtag: entry.httpEtag,
      uploaded: entry.uploaded,
      httpMetadata: { ...entry.httpMetadata },
      customMetadata: { ...entry.customMetadata },
      writeHttpMetadata: makeWriteHttpMetadata(entry.httpMetadata),
    };
  }

  return {
    async put(key, value, options = {}) {
      const bytes = await toUint8Array(value);
      const etag = crypto.createHash("md5").update(bytes).digest("hex");
      const entry = {
        key,
        version: crypto.randomUUID(),
        bytes,
        etag,
        httpEtag: `"${etag}"`,
        uploaded: new Date(),
        httpMetadata: options.httpMetadata ? { ...options.httpMetadata } : {},
        customMetadata: options.customMetadata ? { ...options.customMetadata } : {},
      };
      store.set(key, entry);
      return buildMetaObject(entry);
    },

    async head(key) {
      const entry = store.get(key);
      if (!entry) return null;
      return buildMetaObject(entry);
    },

    async get(key, options = {}) {
      const entry = store.get(key);
      if (!entry) return null;

      const total = entry.bytes.byteLength;
      let slice = entry.bytes;
      let rangeInfo;

      if (options && options.range) {
        const r = options.range;
        if (typeof r.suffix === "number") {
          const start = Math.max(0, total - r.suffix);
          const length = total - start;
          slice = entry.bytes.slice(start, total);
          rangeInfo = { offset: start, length };
        } else if (typeof r.offset === "number") {
          const start = Math.max(0, r.offset);
          const end = typeof r.length === "number" ? Math.min(total, start + r.length) : total;
          slice = start >= total ? new Uint8Array(0) : entry.bytes.slice(start, end);
          rangeInfo = { offset: start, length: slice.byteLength };
        }
      }

      const meta = buildMetaObject(entry);
      return {
        ...meta,
        range: rangeInfo,
        body: bytesToStream(slice),
        bodyUsed: false,
        async arrayBuffer() {
          return slice.buffer.slice(slice.byteOffset, slice.byteOffset + slice.byteLength);
        },
        async text() {
          return new TextDecoder().decode(slice);
        },
        async json() {
          return JSON.parse(new TextDecoder().decode(slice));
        },
        async blob() {
          return new Blob([slice]);
        },
      };
    },

    async delete(keys) {
      if (Array.isArray(keys)) {
        for (const k of keys) store.delete(k);
      } else {
        store.delete(keys);
      }
    },

    async list(options = {}) {
      const prefix = options.prefix ?? "";
      const limit = options.limit ?? 1000;
      const objects = [];
      for (const entry of store.values()) {
        if (prefix && !entry.key.startsWith(prefix)) continue;
        objects.push(buildMetaObject(entry));
        if (objects.length >= limit) break;
      }
      return {
        objects,
        truncated: false,
        delimitedPrefixes: [],
      };
    },

    // Harness inspection helpers
    listKeys(prefix = "") {
      const keys = [];
      for (const k of store.keys()) {
        if (!prefix || k.startsWith(prefix)) keys.push(k);
      }
      return keys.sort();
    },

    getRaw(key) {
      const entry = store.get(key);
      if (!entry) return null;
      return {
        key: entry.key,
        bytes: new Uint8Array(entry.bytes),
        size: entry.bytes.byteLength,
        httpMetadata: { ...entry.httpMetadata },
        customMetadata: { ...entry.customMetadata },
      };
    },

    clear() {
      store.clear();
    },
  };
}
