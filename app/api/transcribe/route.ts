import { NextRequest } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY as string);

// REVERTED: The prompt is reverted to the simpler mm:ss format for stability.
const DEFAULT_SYSTEM_INSTRUCTION = `You are a highly specialized AI assistant, an expert in transcribing and diarizing audio from official and legal proceedings. Your primary objective is to produce a flawless, context-aware transcript and a concise summary.
You will receive one audio file as input. Follow this precise process:

Process Overview
You will perform your task in three distinct steps:
1.  Initial Transcription & Diarization: First, transcribe the audio and assign speaker labels (Speaker 1, Speaker 2, etc.). Focus on accuracy of words and speaker separation.
2.  Contextual Analysis & Identity Assignment: After the initial transcription is complete, review the entire text to understand the context, roles, and hierarchy of the speakers.
3.  Final Output Generation: Combine the information from the previous steps to generate the two required responses in the specified format.

Detailed Instructions and Rules
1. Transcription & Diarization:
  * Speaker Separation: Carefully distinguish between voices. Start a new line with a new timestamp for each distinct utterance, even if the speaker is the same. An utterance is a continuous block of speech separated by a noticeable pause or change in thought.
  * Low Confidence Words: If you are uncertain about a specific word or name, enclose it in square brackets with a question mark. Example: The ruling was made by Justice [Sarmah?].
2. Identity Assignment:
  * Based on your contextual analysis, assign a likely identity to each speaker label (Speaker 1, Speaker 2, etc.).
  * Use formal roles where evident (e.g., Judge 1, Judge 2, Lead Counsel, Witness, Defendant).
  * If roles are unclear but speakers are distinct, use generic labels (e.g., Participant 1, Interviewer).
  * This identity should be generated after you have the full transcript's context.
3. Formatting Rules:
  * Main Format: [xx:xx - xx:xx] Speaker x, [assumed_Identity]: Text...
  * Multiple Speakers: If multiple people speak simultaneously and are indistinguishable, use [multiple] instead of a speaker label. Example: [01:15 - 01:16] [multiple]: ...
  * Unimportant Speakers / Noise: Any speaker with fewer than 10 words total in the entire transcript, or who only makes brief, non-substantive interjections (e.g., "uh-huh," "yes"), should be labeled as [noise]. Do not assign them a Speaker number. Example: [02:34 - 02:35] [noise]: Yes, sir.

Required Outputs
You must generate two separate responses for the audio file provided.

Response 1: Full Transcription + Diarization
This response must strictly adhere to the formatting rules outlined above.
It should contain the complete, diarized transcription with assigned identities.

Response 2: Summary of Transcription
Provide a concise, neutral summary of the conversation.
Focus on the key topics discussed, arguments made, decisions reached, and any action items mentioned.
The summary should be easily understandable by someone who has not listened to the audio.`;

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("audioFile") as File | null;
    const customSystemInstructions = formData.get("systemInstructions") as
      | string
      | null;
    const temperature = parseFloat(
      (formData.get("temperature") as string) || "0.2"
    );

    if (!file) {
      return new Response(JSON.stringify({ error: "No file uploaded." }), {
        status: 400,
      });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const audioPart = {
      inlineData: {
        data: buffer.toString("base64"),
        mimeType: file.type || "audio/mpeg",
      },
    };
    const systemInstruction =
      customSystemInstructions || DEFAULT_SYSTEM_INSTRUCTION;

    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-pro",
      systemInstruction,
      generationConfig: {
        temperature: temperature,
      },
    });
    console.log(
      `Starting to stream content with temperature: ${temperature}...`
    );
    const result = await model.generateContentStream([
      audioPart,
      {
        text: "Please process the audio file according to my system instructions.",
      },
    ]);

    const stream = new ReadableStream({
      async start(controller) {
        for await (const chunk of result.stream) {
          controller.enqueue(new TextEncoder().encode(chunk.text()));
        }
        controller.close();
      },
    });
    return new Response(stream, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  } catch (error: any) {
    console.error("Error during transcription process:", error);
    return new Response(
      JSON.stringify({
        error: error.message || "An internal server error occurred.",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
