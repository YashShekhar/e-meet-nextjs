import type { ChatMessage } from "./roomChat.ts";

// Tab-memory storage only: no localStorage/sessionStorage/IndexedDB. The UI
// necessarily holds decrypted text while displaying it. Neither survives exit.
export function createEncryptedHistory(limit = 500) {
  let disposed = false;
  let key: CryptoKey | null = null;
  let pending = 0;
  const records: { iv: Uint8Array<ArrayBuffer>; ciphertext: ArrayBuffer }[] = [];
  let queue: Promise<unknown> = Promise.resolve();
  const ready = crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"])
    .then((generated) => { if (!disposed) key = generated; }).catch(() => {});
  return {
    append(message: ChatMessage): Promise<ChatMessage[]> {
      if (disposed || pending >= 32) return Promise.reject(new Error("Chat is closed or overloaded."));
      pending++;
      const operation = queue.then(async () => {
        await ready;
        if (disposed || !key) throw new Error("Chat has been cleared.");
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const plaintext = new TextEncoder().encode(JSON.stringify(message));
        let ciphertext: ArrayBuffer;
        try { ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext); }
        finally { plaintext.fill(0); }
        if (disposed || !key) throw new Error("Chat has been cleared.");
        records.push({ iv, ciphertext });
        while (records.length > limit) new Uint8Array(records.shift()!.ciphertext).fill(0);
        const messages: ChatMessage[] = [];
        for (const record of records) {
          if (disposed || !key) throw new Error("Chat has been cleared.");
          const bytes = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: record.iv }, key, record.ciphertext));
          try { messages.push(JSON.parse(new TextDecoder().decode(bytes))); }
          finally { bytes.fill(0); }
        }
        if (disposed) throw new Error("Chat has been cleared.");
        return messages;
      }).finally(() => { pending--; });
      queue = operation.catch(() => {});
      return operation;
    },
    dispose() {
      disposed = true;
      key = null;
      for (const record of records) new Uint8Array(record.ciphertext).fill(0);
      records.length = 0;
    },
  };
}
