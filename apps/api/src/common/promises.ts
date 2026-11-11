export async function settleInOrder<T extends readonly unknown[]>(
  ...tasks: { [K in keyof T]: Promise<T[K]> }
): Promise<T> {
  const results = await Promise.allSettled(tasks);
  const values: unknown[] = [];
  for (const result of results) {
    if (result.status === "rejected") throw result.reason;
    values.push(result.value);
  }
  return values as unknown as T;
}
