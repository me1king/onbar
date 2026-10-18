export async function readJsonResponse<T>(response: Response, endpointLabel: string): Promise<T> {
    const body = await response.text();
    if (!body.trim()) {
        throw new Error(`${endpointLabel} returned an empty response (HTTP ${response.status}).`);
    }

    try {
        return JSON.parse(body) as T;
    } catch {
        throw new Error(`${endpointLabel} returned invalid JSON (HTTP ${response.status}).`);
    }
}
