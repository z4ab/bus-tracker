const API_BASE_URL = import.meta.env.VITE_API_BASE_URL as string | undefined;

const joinUrl = (base: string, path: string) => {
  const trimmedBase = base.replace(/\/$/, "");
  const trimmedPath = path.replace(/^\//, "");
  return `${trimmedBase}/${trimmedPath}`;
};

const buildApiUrl = (path: string) => {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }
  if (!API_BASE_URL) {
    return path;
  }
  return joinUrl(API_BASE_URL, path);
};

async function apiRequest<T>(path: string, method: string): Promise<T> {
  const url = buildApiUrl(path);
  const response = await fetch(url, {
    method,
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`API request failed (${response.status}): ${details || response.statusText}`);
  }

  return (await response.json()) as T;
}

export async function apiGet<T>(path: string): Promise<T> {
  return apiRequest<T>(path, "GET");
}

export async function apiPost<T>(path: string): Promise<T> {
  return apiRequest<T>(path, "POST");
}
