const PRIVATE_AI_SETTINGS = [
    'google_gemini_api_key',
    'openai_api_key',
    'anthropic_claude_api_key'
] as const;

export function sanitizeSettingsRows<T extends { key: string; value: Record<string, unknown> }>(rows: T[]): T[] {
    return rows.map(row => {
        if (row.key !== 'ai_config') return row;
        const value = { ...row.value };
        for (const key of PRIVATE_AI_SETTINGS) delete value[key];
        return { ...row, value };
    });
}
