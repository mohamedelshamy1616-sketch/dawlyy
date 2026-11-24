/** Keep one unresolved write per resource. Reads do not change its retry identity. */
export function createMutationAttempts(newKey: () => string = () => crypto.randomUUID()) {
  const pending = new Map<string, { signature: string; key: string }>();
  return {
    begin(resource: string, signature: string) {
      const previous = pending.get(resource);
      if (previous?.signature === signature) return previous.key;
      const key = newKey();
      pending.set(resource, { signature, key });
      return key;
    },
    succeeded(resource: string) {
      pending.delete(resource);
    },
    refused(resource: string, key: string) {
      if (pending.get(resource)?.key === key) pending.delete(resource);
    },
  };
}
