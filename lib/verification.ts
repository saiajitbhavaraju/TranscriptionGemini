import { NextRequest } from 'next/server';
import { GoogleGenerativeAI, GenerationConfig } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY as string);

const DEFAULT_SYSTEM_INSTRUCTION = `You are a highly specialized AI assistant, an expert in transcribing and diarizing audio from official and legal proceedings. Your primary objective is to produce a flawless, context-aware transcript and a concise summary, formatted as a single JSON object.

Process Overview:
Follow these steps:
1.  Initial Transcription & Diarization: Transcribe the audio, assigning speaker labels (Speaker 1, etc.).
2.  Contextual Analysis: Review the full transcript to assign identities (Judge 1, etc.).
3.  Final JSON Generation: Create a single JSON object with the results.

Detailed Instructions and Rules:
1.  Transcription & Diarization:
    * Speaker Separation: Start a new transcription object for each distinct utterance, even if by the same speaker. An utterance is a continuous block of speech separated by a noticeable pause.
    * Low Confidence Words: If uncertain about a word, enclose it in square brackets with a question mark. Example: "Justice [Sarmah?]".
2.  Identity Assignment:
    * Based on context, assign a likely identity to each speaker label.
    * Use formal roles where evident (e.g., Judge 1, Lead Counsel).
    * If roles are unclear, use generic labels (e.g., Participant 1).
3.  Formatting Rules for JSON values:
    * The "speaker" value should follow the format: "Speaker x, [assumed_Identity]".
    * For multiple speakers: use "[multiple]".
    * For unimportant noise/speakers: use "[noise]".
    * The "timestamp" value should follow the format: "[xx:xx - xx:xx]".

Required Output Structure:
Your entire response MUST be a single, valid JSON object. Do not include any text, explanations, or markdown formatting before or after the JSON object. The JSON object must have this exact structure:
{
  "summary": "A concise, neutral summary of the conversation...",
  "transcription": [
    {
      "timestamp": "[xx:xx - xx:xx]",
      "speaker": "Speaker x, [assumed_Identity] OR [multiple] OR [noise]",
      "text": "The transcribed text for this segment..."
    }
  ]
}`;


export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('audioFile') as File | null;
    const customSystemInstructions = formData.get('systemInstructions') as string | null;

    if (!file) {
      return new Response(JSON.stringify({ error: 'No file uploaded.' }), { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const audioPart = {
      inlineData: {
        data: buffer.toString("base64"),
        mimeType: file.type || "audio/mpeg",
      },
    };
    
    const systemInstruction = customSystemInstructions || DEFAULT_SYSTEM_INSTRUCTION;

    // This configuration enforces a streamed JSON response, preventing timeouts and parsing errors.
    const generationConfig: GenerationConfig = {
        responseMimeType: 'application/json',
        maxOutputTokens: 8192,
    };

    const model = genAI.getGenerativeModel({
      model: 'gemini-1.5-pro-latest',
      systemInstruction,
      generationConfig,
    });
    
    console.log('Starting to stream content in JSON mode...');
    const result = await model.generateContentStream([
      audioPart,
      { text: "Please process the audio file according to my system instructions." }
    ]);

    // Pipe the model's streamed response directly to the client.
    const stream = new ReadableStream({
        async start(controller) {
            for await (const chunk of result.stream) {
                controller.enqueue(new TextEncoder().encode(chunk.text()));
            }
            controller.close();
        }
    });
    
    return new Response(stream, {
        headers: { 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('Error during transcription process:', error);
    return new Response(JSON.stringify({ error: error.message || 'An internal server error occurred.' }), { status: 500, headers: {'Content-Type': 'application/json'} });
  }
}