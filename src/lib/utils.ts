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

  const specialProtocols = ['http:', 'https:', 'file:', 'ftp:', 'chrome:', 'about:', 'mailto:'];
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

  if (/^\d+$/.test(trimmedInput)) {
    return googleSearch(trimmedInput);
  }

  if (!trimmedInput.includes('.') &&
    !trimmedInput.includes(':') &&
    trimmedInput.toLowerCase() !== 'localhost') {
    return googleSearch(trimmedInput);
  }

  if (!trimmedInput.includes(' ')) {
    try {
      let protocol = 'https://';
      const ipRegex = /^(\d{1,3}\.){3}\d{1,3}(:\d+)?$|^\[[\da-fA-F:]+\](:\d+)?$/;
      if (ipRegex.test(trimmedInput) || trimmedInput.toLowerCase().startsWith('localhost')) {
        protocol = 'http://';
      }
      const url = new URL(`${protocol}${trimmedInput}`);
      if (url.hostname.includes('.') ||
        url.hostname === 'localhost' ||
        ipRegex.test(url.hostname)) {
        return url.href;
      }
    } catch (e) {
      console.log(`Invalid URL: ${e}`);
    }
  }
  return googleSearch(trimmedInput);
}

function googleSearch(query: string): string {
  const encodedQuery = encodeURIComponent(query);
  return `https://www.google.com/search?q=${encodedQuery}`;
}
