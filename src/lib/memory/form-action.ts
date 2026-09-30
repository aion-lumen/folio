/** Keep the current Memory tab, filters and page size during native and enhanced submissions. */
export function memoryFormAction(search: string, action: string): string {
 if (!/^[a-zA-Z]+$/.test(action)) throw Error('Invalid Memory action');
 const params = new URLSearchParams(search);
 for (const key of [...params.keys()]) if (key.startsWith('/')) params.delete(key);
 const query = params.toString();
 return `?${query ? query + '&' : ''}/${action}`;
}
