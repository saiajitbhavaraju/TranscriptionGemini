"use client";

import React, { useState, useCallback, useRef } from "react";
import {
  FiUploadCloud,
  FiFileText,
  FiDownload,
  FiXCircle,
  FiCpu,
  FiMessageSquare,
  FiBookOpen,
  FiClock,
  FiTerminal,
  FiDollarSign,
  FiMic,
  FiSquare,
} from "react-icons/fi";
import { parseAndVerifyModelResponse } from "@/lib/parser"; // Import the new parser
import type { ProcessedAudioData, ProcessingStats } from "@/lib/types";

const DEFAULT_SYSTEM_PROMPT = `You are a highly specialized AI assistant, an expert in transcribing and diarizing audio from official and legal proceedings. Your primary objective is to produce a flawless, context-aware transcript and a concise summary.
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

export default function HomePage() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [processedData, setProcessedData] = useState<ProcessedAudioData | null>(
    null
  );
  const [processingStats, setProcessingStats] =
    useState<ProcessingStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState("Processing...");
  const [error, setError] = useState<string | null>(null);
  const [rawErrorText, setRawErrorText] = useState<string | null>(null);
  const [audioPreviewUrl, setAudioPreviewUrl] = useState<string | null>(null);
  const [systemInstructions, setSystemInstructions] = useState<string>(
    DEFAULT_SYSTEM_PROMPT
  );

  // --- ADDED: State for new features ---
  const [temperature, setTemperature] = useState<number>(0.2);
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const [activeSegmentIndex, setActiveSegmentIndex] = useState<number | null>(
    null
  );

  const audioRef = useRef<HTMLAudioElement>(null);
  const segmentRefs = useRef<(HTMLDivElement | null)[]>([]);

  const resetState = () => {
    setProcessedData(null);
    setProcessingStats(null);
    setError(null);
    setRawErrorText(null);
  };

  const handleFileChange = (file: File) => {
    if (file) {
      setSelectedFile(file);
      resetState();
      if (audioPreviewUrl) URL.revokeObjectURL(audioPreviewUrl);
      const url = URL.createObjectURL(file);
      setAudioPreviewUrl(url);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedFile) {
      setError("Please select an audio file.");
      return;
    }
    if (!systemInstructions.trim()) {
      setError("System instructions cannot be empty.");
      return;
    }

    const startTime = performance.now();
    setIsLoading(true);
    setLoadingStatus("Uploading and processing...");
    resetState();

    const formData = new FormData();
    formData.append("audioFile", selectedFile);
    formData.append("systemInstructions", systemInstructions);
    formData.append("temperature", temperature.toString()); // ADDED: Send temperature to API

    try {
      const response = await fetch("/api/transcribe", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.error || `HTTP error! status: ${response.status}`
        );
      }

      setLoadingStatus("Receiving transcription data...");
      const fullResponse = await response.text();

      setLoadingStatus("Parsing and Verifying data...");
      try {
        const data = parseAndVerifyModelResponse(fullResponse);

        const endTime = performance.now();
        const processingTime = parseFloat(
          ((endTime - startTime) / 1000).toFixed(2)
        );
        const inputTokens = Math.round(systemInstructions.length / 4);
        const outputTokens = Math.round(fullResponse.length / 4);
        const INPUT_PRICE_PER_MILLION_TOKENS = 3.5;
        const OUTPUT_PRICE_PER_MILLION_TOKENS = 10.5;
        const inputCost =
          (inputTokens / 1_000_000) * INPUT_PRICE_PER_MILLION_TOKENS;
        const outputCost =
          (outputTokens / 1_000_000) * OUTPUT_PRICE_PER_MILLION_TOKENS;
        const estimatedCost = parseFloat(
          (inputCost + outputCost).toPrecision(4)
        );

        setProcessingStats({
          processingTime,
          inputTokens,
          outputTokens,
          estimatedCost,
        });
        setProcessedData(data);
      } catch (e: any) {
        setError(
          e.message || "Failed to parse or verify the final data stream."
        );
        setRawErrorText(fullResponse);
      }
    } catch (err: any) {
      setError(err.message || "An unknown error occurred.");
    } finally {
      setIsLoading(false);
    }
  };

  // --- ADDED: Live Recording Functions ---
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setIsRecording(true);
      resetState();
      setSelectedFile(null);
      if (audioPreviewUrl) URL.revokeObjectURL(audioPreviewUrl);
      setAudioPreviewUrl(null);

      mediaRecorderRef.current = new MediaRecorder(stream, {
        mimeType: "audio/webm",
      });
      audioChunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorderRef.current.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, {
          type: "audio/webm",
        });
        const audioFile = new File(
          [audioBlob],
          `recording-${Date.now()}.webm`,
          { type: "audio/webm" }
        );

        handleFileChange(audioFile);
        stream.getTracks().forEach((track) => track.stop()); // Stop mic access to turn off indicator
      };

      mediaRecorderRef.current.start();
    } catch (e) {
      console.error("Error starting recording:", e);
      setError(
        "Microphone access was denied. Please enable it in your browser settings."
      );
    }
  };

  const stopRecording = () => {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state === "recording"
    ) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  // --- ADDED: Handler for making text editable ---
  const handleTranscriptChange = (
    segmentIndex: number,
    field: "speaker" | "text",
    value: string
  ) => {
    if (!processedData) return;
    const updatedData = JSON.parse(JSON.stringify(processedData));
    if (field === "speaker") {
      updatedData.transcription[segmentIndex].speaker = value;
    } else {
      updatedData.transcription[segmentIndex].text = value;
    }
    setProcessedData(updatedData);
  };

  // --- UTILITY FUNCTIONS (NOW COMPLETE) ---
  const timeStringToSeconds = (timeStr: string): number => {
    const match = timeStr.match(/(\d{2}):(\d{2})/);
    if (match) {
      const minutes = parseInt(match[1], 10);
      const seconds = parseInt(match[2], 10);
      return minutes * 60 + seconds;
    }
    return 0;
  };

  const seekAudio = (timeStr: string) => {
    if (audioRef.current) {
      audioRef.current.currentTime = timeStringToSeconds(timeStr);
      audioRef.current
        .play()
        .catch((e) => console.warn("Audio play interrupted:", e));
    }
  };

  const handleTimeUpdate = () => {
    if (!audioRef.current || !processedData) return;
    const currentTime = audioRef.current.currentTime;

    let currentSegment = -1;

    for (let i = 0; i < processedData.transcription.length; i++) {
      const segment = processedData.transcription[i];
      // Correctly use the full timestamp string for start time
      const segmentStart = timeStringToSeconds(
        segment.timestamp.split(" - ")[0]
      );
      // Use audio duration for the very last segment's end time
      const segmentEnd =
        i + 1 < processedData.transcription.length
          ? timeStringToSeconds(
              processedData.transcription[i + 1].timestamp.split(" - ")[0]
            )
          : audioRef.current.duration;

      if (currentTime >= segmentStart && currentTime < segmentEnd) {
        currentSegment = i;
        break;
      }
    }

    if (activeSegmentIndex !== currentSegment) {
      setActiveSegmentIndex(currentSegment);
      if (audioRef.current && !audioRef.current.seeking) {
        segmentRefs.current[currentSegment]?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      }
    }
  };

  const downloadFile = (content: string, filename: string) => {
    const blob = new Blob([content], { type: "text/plain;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const getBaseFileName = () => {
    if (!selectedFile) return "download";
    return (
      selectedFile.name.split(".").slice(0, -1).join(".") || selectedFile.name
    );
  };
  const handleFieldChange = (
    segmentIndex: number,
    field: "speaker" | "text",
    value: string
  ) => {
    if (!processedData) return;

    // Create a deep copy to avoid directly mutating the state
    const updatedData = JSON.parse(JSON.stringify(processedData));

    // Update the specific field ('speaker' or 'text') of the correct segment
    if (field === "speaker") {
      updatedData.transcription[segmentIndex].speaker = value;
    } else if (field === "text") {
      updatedData.transcription[segmentIndex].text = value;
    }

    // Set the new state to trigger a re-render with the updated data
    setProcessedData(updatedData);
  };

  return (
    <div className="bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200 min-h-screen font-sans">
      <div className="flex flex-col md:flex-row">
        {/* Left Control Panel */}
        <aside className="w-full md:w-1/3 md:h-screen md:sticky top-0 p-6 md:p-8 border-b md:border-b-0 md:border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col">
          <div className="flex-grow overflow-y-auto pr-4 -mr-4">
            <header className="space-y-1">
              <h1 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-white">
                Gemini Audio
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Verified Transcription & Analysis
              </p>
            </header>
            <form onSubmit={handleSubmit} className="space-y-6 mt-8">
              <div>
                <label
                  htmlFor="system-instructions"
                  className="flex items-center text-base font-semibold text-slate-900 dark:text-white mb-2"
                >
                  <FiCpu className="mr-2 text-indigo-500" />
                  System Instructions
                </label>
                <textarea
                  id="system-instructions"
                  rows={10}
                  className="w-full rounded-lg border-slate-300 dark:border-slate-700 bg-slate-100/50 dark:bg-slate-800/50 p-3 text-xs focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition"
                  value={systemInstructions}
                  onChange={(e) => setSystemInstructions(e.target.value)}
                />
                {/* ADDED: Temperature Slider */}
                <label
                  htmlFor="temperature"
                  className="flex items-center text-sm font-semibold text-slate-900 dark:text-white mt-4 mb-2"
                >
                  Creativity (Temperature)
                </label>
                <input
                  id="temperature"
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={temperature}
                  onChange={(e) => setTemperature(parseFloat(e.target.value))}
                  className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer dark:bg-slate-700"
                />
                <p className="text-xs text-center text-slate-500 dark:text-slate-400">
                  {temperature.toFixed(1)}
                </p>
              </div>

              {/* ADDED: Live Recording Button */}
              <div>
                <label className="flex items-center text-base font-semibold text-slate-900 dark:text-white mb-2">
                  <FiMic className="mr-2 text-indigo-500" />
                  Live Recording
                </label>
                <button
                  type="button"
                  onClick={isRecording ? stopRecording : startRecording}
                  className={`w-full flex items-center justify-center py-2 px-4 rounded-lg text-base font-semibold text-white transition-all shadow-md ${
                    isRecording
                      ? "bg-red-600 hover:bg-red-700"
                      : "bg-green-600 hover:bg-green-700"
                  }`}
                >
                  {isRecording ? (
                    <FiSquare className="mr-2 animate-pulse" />
                  ) : (
                    <FiMic className="mr-2" />
                  )}
                  {isRecording ? "Stop Recording" : "Start Recording"}
                </button>
              </div>

              {/* MODIFIED: Drag and Drop Upload Area */}
              <div>
                <label
                  htmlFor="audio-upload-label"
                  className="flex items-center text-base font-semibold text-slate-900 dark:text-white mb-2"
                >
                  <FiUploadCloud className="mr-2 text-indigo-500" />
                  Or Upload Audio
                </label>
                <div
                  id="audio-upload-label"
                  className="mt-2 flex justify-center rounded-lg border-2 border-dashed border-slate-300 dark:border-slate-700 px-6 py-8"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                      handleFileChange(e.dataTransfer.files[0]);
                    }
                  }}
                >
                  <div className="text-center">
                    <FiUploadCloud className="mx-auto h-10 w-10 text-slate-400" />
                    <div className="mt-4 flex text-sm justify-center">
                      <label
                        htmlFor="audio-upload"
                        className="relative cursor-pointer rounded-md font-semibold text-indigo-600 dark:text-indigo-400 focus-within:outline-none hover:text-indigo-500"
                      >
                        <span>
                          {selectedFile ? "Change file" : "Upload a file"}
                        </span>
                        <input
                          id="audio-upload"
                          name="audioFile"
                          type="file"
                          className="sr-only"
                          onChange={(e) =>
                            e.target.files &&
                            handleFileChange(e.target.files[0])
                          }
                          accept="audio/*"
                        />
                      </label>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      {selectedFile ? selectedFile.name : "MP3, WAV, FLAC, M4A"}
                    </p>
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading || !selectedFile}
                className="w-full flex items-center justify-center py-3 px-4 rounded-lg text-base font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 dark:disabled:bg-indigo-800/50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:ring-offset-slate-900 transition-all shadow-lg hover:shadow-indigo-500/30"
              >
                {isLoading ? loadingStatus : "Process Audio"}
              </button>

              {/* ADDED: Long file warning */}
              <p className="text-xs text-center text-amber-600 dark:text-amber-400">
                Note: Processing files over 5 minutes may be slow or time out on
                this demo platform.
              </p>

              {processingStats && !isLoading && (
                <div className="mt-6 border-t border-slate-200 dark:border-slate-800 pt-6">
                  <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-3">
                    Processing Stats
                  </h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between items-center text-slate-600 dark:text-slate-400">
                      <span className="flex items-center">
                        <FiClock className="mr-2" />
                        Processing Time:
                      </span>
                      <span className="font-mono text-slate-900 dark:text-white">
                        {processingStats.processingTime}s
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-slate-600 dark:text-slate-400">
                      <span className="flex items-center">
                        <FiTerminal className="mr-2" />
                        Input/Output Tokens:
                      </span>
                      <span className="font-mono text-slate-900 dark:text-white">
                        {processingStats.inputTokens} /{" "}
                        {processingStats.outputTokens}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-slate-600 dark:text-slate-400">
                      <span className="flex items-center">
                        <FiDollarSign className="mr-2" />
                        Estimated Cost:
                      </span>
                      <span className="font-mono text-slate-900 dark:text-white">
                        ${processingStats.estimatedCost.toFixed(6)}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </form>
          </div>
        </aside>

        {/* Right Results Panel */}
        <main className="w-full md:w-2/3 md:h-screen md:overflow-y-auto">
          <div className="p-6 md:p-12">
            <div className="sticky top-0 z-10 -mx-6 -mt-6 md:mx-0 md:mt-0 mb-8 p-4 md:p-6 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm border-b border-slate-200 dark:border-slate-800">
              {audioPreviewUrl ? (
                <audio
                  ref={audioRef}
                  controls
                  src={audioPreviewUrl}
                  onTimeUpdate={handleTimeUpdate}
                  className="w-full"
                ></audio>
              ) : (
                <div className="text-center p-4 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                  Upload or record an audio file to begin.
                </div>
              )}
              {processedData && (
                <nav className="mt-4 flex items-center justify-center space-x-6 text-sm font-medium text-slate-600 dark:text-slate-400">
                  <a
                    href="#summary"
                    className="hover:text-indigo-600 dark:hover:text-indigo-400 transition"
                  >
                    Jump to Summary
                  </a>
                  <a
                    href="#transcription"
                    className="hover:text-indigo-600 dark:hover:text-indigo-400 transition"
                  >
                    Jump to Transcription
                  </a>
                </nav>
              )}
            </div>

            {isLoading && (
              <div className="text-center text-lg animate-pulse">
                {loadingStatus}
              </div>
            )}

            {error && (
              <div className="bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700 text-red-700 dark:text-red-200 rounded-lg p-4">
                <p className="font-bold">Error:</p>
                <p>{error}</p>
                {rawErrorText && (
                  <details className="mt-2">
                    <summary className="cursor-pointer">
                      Show Raw Output
                    </summary>
                    <pre className="mt-2 text-xs p-2 rounded bg-slate-200 dark:bg-slate-800 whitespace-pre-wrap">
                      {rawErrorText}
                    </pre>
                  </details>
                )}
              </div>
            )}

            {processedData && (
              <div className="space-y-12">
                <section id="summary">
                  <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center">
                      <FiMessageSquare className="mr-3 text-indigo-500" />
                      Summary
                    </h2>
                    {/* MODIFIED: Dynamic filename for summary download */}
                    <button
                      onClick={() =>
                        downloadFile(
                          processedData.summary,
                          `${getBaseFileName()}_summary.txt`
                        )
                      }
                      className="flex items-center text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-500"
                    >
                      <FiDownload className="mr-1" />
                      Download
                    </button>
                  </div>
                  {/* MODIFIED: Make summary editable */}
                  <textarea
                    value={processedData.summary}
                    onChange={(e) => {
                      if (processedData) {
                        setProcessedData({
                          ...processedData,
                          summary: e.target.value,
                        });
                      }
                    }}
                    className="w-full h-48 p-3 rounded-lg prose prose-slate dark:prose-invert max-w-none bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition"
                  />
                </section>

                <section id="transcription">
                  <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center">
                      <FiBookOpen className="mr-3 text-indigo-500" />
                      Transcription
                    </h2>
                    {/* MODIFIED: Dynamic filename for transcription download */}
                    <button
                      onClick={() => {
                        let content = "";
                        processedData.transcription.forEach(
                          (s) =>
                            (content += `${s.timestamp} ${s.speaker}: ${s.text}\n`)
                        );
                        downloadFile(
                          content,
                          `${getBaseFileName()}_transcription.txt`
                        );
                      }}
                      className="flex items-center text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-500"
                    >
                      <FiDownload className="mr-1" />
                      Download
                    </button>
                  </div>
                  <div className="space-y-4">
                    {/* MODIFIED: Map to editable inputs */}
                    {processedData.transcription.map((segment, segIndex) => (
                      <div
                        key={segIndex}
                        ref={(el) => {
                          if (el) segmentRefs.current[segIndex] = el;
                        }}
                        className={`p-4 rounded-lg transition-all duration-300 ${
                          activeSegmentIndex === segIndex
                            ? "bg-indigo-50 dark:bg-indigo-900/30 ring-2 ring-indigo-500"
                            : "bg-white dark:bg-slate-800 border border-transparent hover:border-slate-200 dark:hover:border-slate-700"
                        }`}
                      >
                        <div className="flex items-center space-x-4 text-sm mb-2">
                          <input
                            value={segment.speaker}
                            onChange={(e) =>
                              handleTranscriptChange(
                                segIndex,
                                "speaker",
                                e.target.value
                              )
                            }
                            className="w-auto p-1 rounded font-bold text-indigo-600 dark:text-indigo-400 bg-slate-100 dark:bg-slate-700 focus:ring-1 focus:ring-indigo-500"
                          />
                          <span
                            onClick={() =>
                              seekAudio(segment.timestamp.split(" - ")[0])
                            }
                            className="font-mono text-slate-500 dark:text-slate-400 cursor-pointer hover:text-indigo-500"
                          >
                            {segment.timestamp}
                          </span>
                        </div>
                        <textarea
                          value={segment.text}
                          onChange={(e) =>
                            handleFieldChange(segIndex, "text", e.target.value)
                          }
                          rows={Math.max(1, segment.text.split("\n").length)}
                          style={{ resize: "none", overflow: "hidden" }}
                          className="w-full text-base leading-relaxed text-slate-700 dark:text-slate-300 bg-transparent p-1 rounded focus:bg-slate-100 dark:focus:bg-slate-700 focus:ring-1 focus:ring-indigo-500"
                        />
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
