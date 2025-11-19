import https from 'node:https';
import http from 'node:http';
import { Buffer } from 'node:buffer';

const faviconCache = new Map<string, string>();

export async function getFaviconBase64(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const cache = faviconCache.get(url);
    if (cache) {
      resolve(cache);
      return;
    }
    const protocol = url.startsWith('https') ? https : http;
    protocol.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to fetch favicon. ${url} \nHTTP status code ${response.statusCode}`));
        return;
      }
      const chunks: any[] = [];
      response.on('data', (chunk) => {chunks.push(chunk);});
      response.on('end', () => {
        const buffer = Buffer.concat(chunks);
        const contentType = response.headers['content-type'] || 'image/x-icon';
        const dataUrl = `data:${contentType};base64,${buffer.toString('base64')}`;
        faviconCache.set(url, dataUrl);
        resolve(dataUrl);
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
}
