export type FreeshowConfig = {
  enabled: boolean;
  url: string;
  method: 'GET' | 'POST';
  payloadTemplate: string;
};

export const defaultFreeshowConfig: FreeshowConfig = {
  enabled: false,
  url: "http://localhost:5506/api/action",
  method: "POST",
  payloadTemplate: "{\n  \"action\": \"trigger\",\n  \"value\": \"{{book}} {{chapter}}:{{verse}}\"\n}"
};

export async function sendToFreeshow(config: FreeshowConfig, reference: any) {
  if (!config.enabled || !config.url) return;
  
  let body = config.payloadTemplate || "";
  if (config.method === 'POST') {
      body = body.replace(/\{\{book\}\}/g, reference.book)
                 .replace(/\{\{chapter\}\}/g, reference.chapters[0])
                 .replace(/\{\{verse\}\}/g, reference.verses?.[0]?.[0] || '');
  }

  let finalUrl = config.url;
  if (config.method === 'GET') {
      finalUrl = finalUrl.replace('%7B%7Bbook%7D%7D', encodeURIComponent(reference.book))
         .replace('%7B%7Bchapter%7D%7D', encodeURIComponent(reference.chapters[0]))
         .replace('%7B%7Bverse%7D%7D', encodeURIComponent(reference.verses?.[0]?.[0] || ''));
  }
  
  return fetch(finalUrl, {
    method: config.method,
    headers: config.method === 'POST' ? { 'Content-Type': 'application/json' } : undefined,
    body: config.method === 'POST' ? body : undefined
  });
}
