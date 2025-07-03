import type { ProcessedAudioData, TranscriptionSegment } from './types';

/**
 * Parses the raw text output from the LLM into a structured ProcessedAudioData object.
 * This acts as our "verification module", ensuring the data conforms to our app's needs.
 * @param rawText - The full string response from the Gemini API.
 * @returns A structured ProcessedAudioData object.
 * @throws An error if the text cannot be parsed into the expected format.
 */
export function parseAndVerifyModelResponse(rawText: string): ProcessedAudioData {
  const summaryMatch = rawText.match(/Response 2: Summary of Transcription([\s\S]*)/);
  const summary = summaryMatch ? summaryMatch[1].trim() : "";

  if (!summary) {
    throw new Error("Could not parse the 'Summary' section from the model's output.");
  }

  const transcriptionMatch = rawText.match(/Response 1: Full Transcription \+ Diarization([\s\S]*?)Response 2:/);
  const transcriptionBlock = transcriptionMatch ? transcriptionMatch[1].trim() : "";

  if (!transcriptionBlock) {
    throw new Error("Could not find the 'Full Transcription + Diarization' block in the output.");
  }
  
  const lines = transcriptionBlock.split('\n').filter(line => line.trim() !== '');
  const transcription: TranscriptionSegment[] = [];

  // This regex is designed to be robust and capture the specified format.
  // Group 1: The timestamp block (e.g., "[xx:xx - xx:xx]")
  // Group 2: The speaker block (e.g., "Speaker x, [Identity]" or "[noise]")
  // Group 3: The actual text content
  const lineRegex = /^(\[.*?\])\s(.*?):\s(.*)$/;

  for (const line of lines) {
    const match = line.match(lineRegex);
    if (match) {
      transcription.push({
        timestamp: match[1].trim(),
        speaker: match[2].trim(),
        text: match[3].trim(),
      });
    } else {
        // This helps debug if the model deviates from the format for a specific line.
        console.warn(`Skipping malformed transcription line: "${line}"`);
    }
  }

  if (transcription.length === 0 && lines.length > 0) {
      throw new Error("Found transcription lines but could not parse any of them. The model's output format may have deviated from the prompt's instructions.");
  }

  return { summary, transcription };
}