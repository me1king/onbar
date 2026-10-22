BEGIN;

UPDATE public.settings
SET
    value = value
        - 'google_gemini_api_key'
        - 'openai_api_key'
        - 'anthropic_claude_api_key',
    updated_at = now()
WHERE key = 'ai_config'
  AND value ?| ARRAY[
      'google_gemini_api_key',
      'openai_api_key',
      'anthropic_claude_api_key'
  ];

COMMIT;
