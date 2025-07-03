export interface TranscriptionSegment {
  speaker: string; // e.g., "Speaker 1, [Judge 1]" or "[noise]"
  timestamp: string; // e.g., "[00:01 - 00:05]"
  text: string;
}

export interface ProcessedAudioData {
  summary: string;
  transcription: TranscriptionSegment[];
}

export interface ApiErrorResponse {
  error: string;
  rawText?: string;
}
export interface ProcessingStats {
  processingTime: number; // in seconds
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number; // in USD
}