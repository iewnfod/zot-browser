export const debounce = (func: Function, wait: number) => {
  let timeout: NodeJS.Timeout;
  return (...args: any[]) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
};

export function normalizeUrl(input: string): string {
  const trimmedInput = input.trim();

  if (!trimmedInput) {
    return 'https://www.google.com';
  }

  const specialProtocols = ['http:', 'https:', 'file:', 'ftp:', 'chrome:', 'about:'];
  const hasKnownProtocol = specialProtocols.some(protocol =>
    trimmedInput.toLowerCase().startsWith(protocol)
  );

  if (hasKnownProtocol) {
    try {
      const url = new URL(trimmedInput);
      return url.href;
    } catch (e) {
      console.log(`Generate URL Failed: ${e}`);
    }
  }

  if (trimmedInput.includes('\\') ||
    trimmedInput.startsWith('/') ||
    trimmedInput.startsWith('./') ||
    trimmedInput.startsWith('../') ||
    /^[a-zA-Z]:[\\/]/.test(trimmedInput)) {
    return `file:///${trimmedInput.replace(/\\/g, '/')}`;
  }

  const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  if (domainRegex.test(trimmedInput) &&
    !trimmedInput.includes(' ') &&
    trimmedInput.length > 1) {
    try {
      const url = new URL(`https://${trimmedInput}`);
      return url.href;
    } catch (e) {
      console.log(`Invalid URL: ${e}`);
    }
  }

  const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
  if (ipRegex.test(trimmedInput)) {
    return `http://${trimmedInput}`;
  }

  const encodedQuery = encodeURIComponent(trimmedInput);
  return `https://www.google.com/search?q=${encodedQuery}`;
}
