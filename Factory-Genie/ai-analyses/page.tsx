"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

type AnalysisSource = {
  source: string;
  ok: boolean;
  error: string | null;
  count: number;
};

type AnalysisPlan = {
  date_start: string;
  date_end: string;
  rationale?: string;
  storage_dates?: string[];
};

type TokenUsage = {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
};

type PromptUpdate = {
  summary: string;
  previous_prompt: string;
  updated_prompt: string;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  status?: string | null;
  plan?: AnalysisPlan | null;
  sources?: AnalysisSource[];
  usage?: TokenUsage | null;
  isStreaming?: boolean;
  error?: string | null;
  promptUpdate?: PromptUpdate | null;
};

type PersistedChatMessage = {
  id?: string;
  role?: "user" | "assistant";
  content?: string;
  plan?: AnalysisPlan | null;
  sources?: AnalysisSource[];
  usage?: TokenUsage | null;
  error?: string | null;
};

const exampleQuestions = [
  "Which machine had the highest worktime today?",
  "Why was output lower yesterday?",
  "Which device had the most downtime in the last 3 days?",
];

const createId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export default function AIAnalysesPage() {
  const [input, setInput] = useState("");
  const [deviceNumbers, setDeviceNumbers] = useState<number[]>([]);
  const [userId, setUserId] = useState<string>("");
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: createId(),
      role: "assistant",
      content:
        "Ask about Factory Genie live-status data. I will choose the needed date range, fetch live-status data, and answer while streaming.",
      usage: null,
      promptUpdate: null,
    },
  ]);
  const [loading, setLoading] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);

  useEffect(() => {
    try {
      const userRaw = localStorage.getItem("user");
      const directUserId = localStorage.getItem("userId");
      const directDeviceNo = localStorage.getItem("deviceNo");
      const nextDeviceNumbers: number[] = [];
      let nextUserId = "";

      if (userRaw) {
        const user = JSON.parse(userRaw);
        if (user?._id) {
          nextUserId = String(user._id);
        }
        if (Array.isArray(user.deviceNo)) {
          user.deviceNo.forEach((value: unknown) => {
            const parsed = parseInt(String(value), 10);
            if (!Number.isNaN(parsed)) {
              nextDeviceNumbers.push(parsed);
            }
          });
        } else if (user.deviceNo !== undefined && user.deviceNo !== null) {
          const parsed = parseInt(String(user.deviceNo), 10);
          if (!Number.isNaN(parsed)) {
            nextDeviceNumbers.push(parsed);
          }
        }
      }

      if (!nextUserId && directUserId) {
        nextUserId = String(directUserId);
      }

      if (directDeviceNo) {
        directDeviceNo.split(",").forEach((value) => {
          const parsed = parseInt(value.trim(), 10);
          if (!Number.isNaN(parsed)) {
            nextDeviceNumbers.push(parsed);
          }
        });
      }

      setDeviceNumbers(Array.from(new Set(nextDeviceNumbers)));
      setUserId(nextUserId);
    } catch {
      setDeviceNumbers([]);
      setUserId("");
    }
  }, []);

  useEffect(() => {
    if (!userId) {
      return;
    }

    let cancelled = false;

    const loadMemory = async () => {
      try {
        const response = await fetch("/api/factory-genie/ai-analyses/memory", {
          headers: {
            "x-user-id": userId,
          },
        });

        const payload = await response.json().catch(() => null);
        if (!response.ok || cancelled) {
          return;
        }

        const persistedMessages = Array.isArray(payload?.data)
          ? payload.data
              .map((message: PersistedChatMessage) => ({
                id: String(message?.id || createId()),
                role: message?.role === "user" ? "user" : "assistant",
                content: String(message?.content || ""),
                plan: message?.plan || null,
                sources: [],
                usage: message?.usage || null,
                error: message?.error || null,
                isStreaming: false,
              }))
              .filter((message: ChatMessage) => message.content.trim())
          : [];

        if (persistedMessages.length === 0) {
          return;
        }

        setMessages((current) => (current.length > 1 ? current : [current[0], ...persistedMessages]));
      } catch {
        // Ignore memory hydration failures and keep the page usable.
      }
    };

    loadMemory();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const history = useMemo(
    () =>
      messages
        .filter((message) => (message.role === "user" || message.role === "assistant") && message.content.trim())
        .map((message) => ({ role: message.role, content: message.content })),
    [messages]
  );

  const updateAssistantMessage = (messageId: string, updater: (message: ChatMessage) => ChatMessage) => {
    setMessages((current) =>
      current.map((message) => (message.id === messageId ? updater(message) : message))
    );
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const question = input.trim();
    if (!question || loading || deviceNumbers.length === 0 || !userId) {
      return;
    }

    setInput("");
    setLoading(true);
    setPageError(null);

    const userMessage: ChatMessage = {
      id: createId(),
      role: "user",
      content: question,
    };
    const assistantMessageId = createId();
    const assistantMessage: ChatMessage = {
      id: assistantMessageId,
      role: "assistant",
      content: "",
      status: "Starting analysis...",
      plan: null,
      sources: [],
      usage: null,
      isStreaming: true,
      error: null,
      promptUpdate: null,
    };

    const nextHistory = [...history, { role: "user" as const, content: question }];
    setMessages((current) => [...current, userMessage, assistantMessage]);

    try {
      const planResponse = await fetch("/api/factory-genie/ai-analyses/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          history: nextHistory.slice(-8),
        }),
      });

      const planPayload = await planResponse.json().catch(() => null);
      if (!planResponse.ok) {
        throw new Error(planPayload?.error || "Failed to plan analysis");
      }

      updateAssistantMessage(assistantMessageId, (message) => ({
        ...message,
        plan: planPayload?.plan || null,
        usage: planPayload?.usage || null,
        status: "Fetching live-status data...",
      }));

      const dataResponse = await fetch("/api/factory-genie/ai-analyses/data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          deviceNumbers,
          plan: planPayload?.plan,
        }),
      });

      const dataPayload = await dataResponse.json().catch(() => null);
      if (!dataResponse.ok) {
        throw new Error(dataPayload?.error || "Failed to fetch analysis data");
      }

      updateAssistantMessage(assistantMessageId, (message) => ({
        ...message,
        sources: [],
        status: "Preparing the analysis...",
      }));

      if (!Array.isArray(dataPayload?.data) || dataPayload.data.length === 0) {
        throw new Error("No live-status data was available for the selected date range");
      }

      const response = await fetch("/api/factory-genie/ai-analyses/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": userId,
        },
        body: JSON.stringify({
          question,
          history: nextHistory.slice(-8),
          plan: planPayload?.plan,
          sources: dataPayload?.sources || [],
          data: dataPayload?.data || [],
          baseUsage: planPayload?.usage || null,
        }),
      });

      if (!response.ok || !response.body) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || "Failed to analyse data");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) {
            continue;
          }

          const eventPayload = JSON.parse(trimmed);
          if (eventPayload.type === "status") {
            updateAssistantMessage(assistantMessageId, (message) => ({
              ...message,
              status: String(eventPayload.value || ""),
            }));
          } else if (eventPayload.type === "plan") {
            updateAssistantMessage(assistantMessageId, (message) => ({
              ...message,
              plan: eventPayload.value || null,
              status: "Using the chosen date range...",
            }));
          } else if (eventPayload.type === "sources") {
            updateAssistantMessage(assistantMessageId, (message) => ({
              ...message,
              sources: [],
              status: "Preparing the analysis...",
            }));
          } else if (eventPayload.type === "usage") {
            updateAssistantMessage(assistantMessageId, (message) => ({
              ...message,
              usage: eventPayload.value || null,
            }));
          } else if (eventPayload.type === "prompt_update") {
            updateAssistantMessage(assistantMessageId, (message) => ({
              ...message,
              promptUpdate: eventPayload.value || null,
              status: "Updated your stored prompt...",
            }));
          } else if (eventPayload.type === "answer_delta") {
            updateAssistantMessage(assistantMessageId, (message) => ({
              ...message,
              content: `${message.content}${String(eventPayload.value || "")}`,
              status: "Typing...",
            }));
          } else if (eventPayload.type === "error") {
            updateAssistantMessage(assistantMessageId, (message) => ({
              ...message,
              error: String(eventPayload.value || "Failed to analyse data"),
              status: null,
              isStreaming: false,
            }));
          } else if (eventPayload.type === "done") {
            updateAssistantMessage(assistantMessageId, (message) => ({
              ...message,
              content: eventPayload.value?.answer || message.content,
              plan: eventPayload.value?.plan || message.plan,
              sources: [],
              usage: eventPayload.value?.usage || message.usage,
              promptUpdate: eventPayload.value?.promptUpdate || message.promptUpdate,
              status: null,
              isStreaming: false,
            }));
          }
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to analyse data";
      setPageError(message);
      updateAssistantMessage(assistantMessageId, (assistantMessageState) => ({
        ...assistantMessageState,
        error: message,
        status: null,
        isStreaming: false,
      }));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto flex h-[calc(100vh-96px)] max-w-screen-2xl flex-col p-4 md:p-6 2xl:p-10">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <h2 className="text-title-md2 font-semibold text-black dark:text-white">Factory Genie</h2>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
            Chat with your Factory Genie live-status data.
          </p>
        </div>
        <div className="rounded-full border border-stroke px-3 py-1 text-xs text-gray-600 dark:border-strokedark dark:text-gray-300">
          Devices: {deviceNumbers.length > 0 ? deviceNumbers.join(", ") : "Not found"}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
        <div className="flex-1 overflow-y-auto bg-[radial-gradient(circle_at_top,_rgba(17,24,39,0.05),_transparent_35%),linear-gradient(180deg,_rgba(248,250,252,1)_0%,_rgba(255,255,255,1)_28%,_rgba(248,250,252,1)_100%)] p-4 dark:bg-[linear-gradient(180deg,_rgba(10,14,23,1)_0%,_rgba(17,24,39,1)_100%)] md:p-6">
          <div className="mx-auto flex max-w-4xl flex-col gap-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-3 shadow-sm ${
                    message.role === "user"
                      ? "bg-gray-900 text-white"
                      : "border border-stroke bg-white text-gray-800 dark:border-strokedark dark:bg-gray-900 dark:text-gray-100"
                  }`}
                >
                  <div className="mb-1 text-[11px] font-medium uppercase tracking-[0.18em] text-gray-400">
                    {message.role === "user" ? "You" : "Factory Genie"}
                  </div>

                  {message.plan && (
                    <div className="mb-3 rounded-xl bg-gray-100 px-3 py-2 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                      Data window: {message.plan.date_start} to {message.plan.date_end}
                      {message.plan.rationale ? ` • ${message.plan.rationale}` : ""}
                    </div>
                  )}

                  {message.promptUpdate && (
                    <div className="mb-3 rounded-xl border border-blue-200 bg-blue-50 px-3 py-3 text-xs text-blue-800 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200">
                      <div className="font-medium">{message.promptUpdate.summary}</div>
                      <div className="mt-2 whitespace-pre-wrap">
                        <strong>Previous prompt</strong>
                        {"\n"}
                        {message.promptUpdate.previous_prompt}
                      </div>
                      <div className="mt-2 whitespace-pre-wrap">
                        <strong>Updated prompt</strong>
                        {"\n"}
                        {message.promptUpdate.updated_prompt}
                      </div>
                    </div>
                  )}

                  <div className="whitespace-pre-wrap text-sm leading-6">
                    {message.content || (message.isStreaming ? " " : "")}
                    {message.isStreaming && (
                      <span className="ml-1 inline-block h-4 w-2 animate-pulse rounded-sm bg-current align-middle opacity-60" />
                    )}
                  </div>

                  {message.status && (
                    <div className="mt-3 text-xs text-gray-500 dark:text-gray-400">{message.status}</div>
                  )}

                  {message.usage && (
                    <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-gray-500 dark:text-gray-400">
                      <span className="rounded-full bg-gray-100 px-2.5 py-1 dark:bg-gray-800">
                        Input: {message.usage.input_tokens}
                      </span>
                      <span className="rounded-full bg-gray-100 px-2.5 py-1 dark:bg-gray-800">
                        Output: {message.usage.output_tokens}
                      </span>
                      <span className="rounded-full bg-gray-100 px-2.5 py-1 dark:bg-gray-800">
                        Total: {message.usage.total_tokens}
                      </span>
                    </div>
                  )}

                  {message.error && (
                    <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300">
                      {message.error}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {pageError && (
              <div className="mx-auto w-full max-w-2xl rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
                {pageError}
              </div>
            )}

            <div ref={bottomRef} />
          </div>
        </div>

        <div className="border-t border-stroke bg-white p-4 dark:border-strokedark dark:bg-boxdark md:p-5">
          <div className="mx-auto max-w-4xl">
            <div className="mb-3 flex flex-wrap gap-2">
              {exampleQuestions.map((example) => (
                <button
                  key={example}
                  type="button"
                  onClick={() => setInput(example)}
                  className="rounded-full border border-stroke px-3 py-1 text-xs text-gray-700 hover:bg-gray-100 dark:border-strokedark dark:text-gray-300 dark:hover:bg-gray-800"
                >
                  {example}
                </button>
              ))}
            </div>

            <form ref={formRef} onSubmit={handleSubmit} className="flex items-end gap-3">
              <div className="flex-1">
                <textarea
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      formRef.current?.requestSubmit();
                    }
                  }}
                  rows={3}
                  placeholder="Ask a question about worktime, downtime, runtime load, or machine performance..."
                  className="w-full rounded-2xl border border-stroke px-4 py-3 text-sm focus:border-gray-900 focus:outline-none dark:border-strokedark dark:bg-gray-900 dark:text-white"
                  disabled={loading || deviceNumbers.length === 0 || !userId}
                />
              </div>
              <button
                type="submit"
                disabled={loading || !input.trim() || deviceNumbers.length === 0 || !userId}
                className="rounded-2xl bg-gray-900 px-5 py-3 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? "Thinking..." : "Send"}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
