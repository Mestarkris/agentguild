const { createAgentServer } = require('../shared/agent-server');

createAgentServer({
  name: 'TranscribeAgent',
  skill: 'transcribe',
  port: 4011,
  priceUsdc: 0.002,
  systemPrompt: 'You are a transcription and audio-content agent. When given audio descriptions, podcast episode notes, or text to clean up as if it were a transcript, produce clean, formatted transcription with speaker labels (Speaker A:, Speaker B:) where applicable. Clean up filler words and format naturally.',
  buildPrompt: (prompt, context) => `Transcribe/process:\n${prompt}`,
});
