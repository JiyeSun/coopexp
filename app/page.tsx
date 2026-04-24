"use client";

import { useEffect, useRef, useState } from "react";

const questions = [
  { id: 1, correct: 0 },
  { id: 2, correct: 3 },
  { id: 3, correct: 4 },
  { id: 4, correct: 5 },
  { id: 5, correct: 3 },
  { id: 6, correct: 3 },
  { id: 7, correct: 0 },
  { id: 8, correct: 5 },
  { id: 9, correct: 5 },
  { id: 10, correct: 4 },
  { id: 11, correct: 2 },
  { id: 12, correct: 5 },
  { id: 13, correct: 3 },
  { id: 14, correct: 1 },
];

const originalHelpPromptText =
  "Do you want me to help you?\n\n" +
  "If you need help solving a question, just ask me. Tell me which question you are struggling with and let's solve it together. I can help you with up to 10 questions. For example, you can ask: 'Help me on Question 1.'";

const shortHelpPromptText = "Do you want me to help you? Tell me which question you are trying to solve.";

const QUALTRICS_RETURN_URL = "https://iu.co1.qualtrics.com/jfe/form/SV_2tvhb3IQU4w77Om";
const GOOGLE_APPS_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbzpncarcbv8Ji22y8kHJdmg-wLbn4nlbDHUIH6781WwC8DZXO_DcdIoDL6hmvu1heaP/exec";

type Message = { sender: "user" | "bot"; text: string };

type TrialRecord = {
  rid: string;
  question_number: number;
  chosen_option: number | null;
  correct_option: number;
  rt_seconds: number;
  ended_by_timeout: boolean;
  saved_at: string;
};

type SummaryRecord = {
  rid: string;
  total_score: number;
  total_time_seconds: number;
  n_trials: number;
  saved_at: string;
};

type ChatLogRecord = {
  rid: string;
  timestamp: string;
  role: "user" | "assistant";
  text: string;
};

type TimerHandle = ReturnType<typeof setTimeout> | ReturnType<typeof setInterval> | null;

export default function Home() {
  const [current, setCurrent] = useState<number>(0);
  const [score, setScore] = useState<number>(0);
  const [timeLeft, setTimeLeft] = useState<number>(30);
  const [totalTime, setTotalTime] = useState<number>(0);
  const [experimentStartTime, setExperimentStartTime] = useState<number | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [isCorrectSelection, setIsCorrectSelection] = useState<boolean | null>(null);
  const [started, setStarted] = useState<boolean>(false);
  const [showChat, setShowChat] = useState<boolean>(false);
  const [showCover, setShowCover] = useState(true);
  const [showStartButton, setShowStartButton] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const [rid] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get("rid") ?? "";
  });

  const countdownRef = useRef<TimerHandle>(null);
  const advanceRef = useRef<TimerHandle>(null);
  const answerTimeoutRef = useRef<TimerHandle>(null);
  const autoReturnTimerRef = useRef<TimerHandle>(null);

  const answerLockRef = useRef(false);
  const advanceLockRef = useRef(false);

  const questionStartTimeRef = useRef<number>(0);

  const wrongAnswerCountRef = useRef(0);
  const pendingWrongPromptQuestionRef = useRef<number | null>(null);

  const hasManuallyOpenedAssistantRef = useRef(false);
  const autoHelpPromptShownRef = useRef(false);

  const currentTrialRef = useRef<TrialRecord | null>(null);
  const trialCommittedRef = useRef(false);
  const trialsRef = useRef<TrialRecord[]>([]);
  const chatlogRef = useRef<ChatLogRecord[]>([]);
  const saveLockRef = useRef(false);

  function appendChatLog(role: "user" | "assistant", text: string) {
    chatlogRef.current.push({
      rid,
      timestamp: new Date().toISOString(),
      role,
      text,
    });
  }

  function clearTimer(ref: { current: TimerHandle }) {
    if (ref.current) {
      clearTimeout(ref.current as ReturnType<typeof setTimeout>);
      clearInterval(ref.current as ReturnType<typeof setInterval>);
      ref.current = null;
    }
  }

  function generateOptions(id: number) {
    return Array.from({ length: 6 }, (_, i) => `/images/q${id}_a${i + 1}.png`);
  }

  function initCurrentTrial() {
    const q = questions[current];
    currentTrialRef.current = {
      rid,
      question_number: current + 1,
      chosen_option: null,
      correct_option: q.correct,
      rt_seconds: 0,
      ended_by_timeout: false,
      saved_at: "",
    };
    trialCommittedRef.current = false;
  }

  function updateCurrentTrial(chosenOption: number | null, endedByTimeout: boolean, rtSeconds?: number) {
    if (!currentTrialRef.current) return;

    currentTrialRef.current.chosen_option = chosenOption;
    currentTrialRef.current.correct_option = questions[current].correct;
    currentTrialRef.current.ended_by_timeout = endedByTimeout;
    currentTrialRef.current.rt_seconds = Number(
      (rtSeconds ?? Math.max(0, (Date.now() - questionStartTimeRef.current) / 1000)).toFixed(3)
    );
  }

  function commitCurrentTrial() {
    if (trialCommittedRef.current) return;
    if (!currentTrialRef.current) return;

    trialsRef.current = [
      ...trialsRef.current,
      {
        ...currentTrialRef.current,
        saved_at: new Date().toISOString(),
      },
    ];
    trialCommittedRef.current = true;
  }

  function goNextQuestion(delayMs: number) {
    if (advanceLockRef.current) return;
    advanceLockRef.current = true;

    clearTimer(answerTimeoutRef);
    clearTimer(countdownRef);
    clearTimer(advanceRef);

    advanceRef.current = setTimeout(() => {
      setSelectedIndex(null);
      setIsCorrectSelection(null);
      setCurrent((prev) => (prev >= questions.length - 1 ? questions.length : prev + 1));
      setTimeout(() => {
        advanceLockRef.current = false;
      }, 0);
    }, delayMs);
  }

  function handleTimeout() {
    if (answerLockRef.current || selectedIndex !== null || advanceLockRef.current) return;

    answerLockRef.current = true;

    updateCurrentTrial(null, true);
    commitCurrentTrial();

    goNextQuestion(0);

    answerLockRef.current = false;
  }

  function handleAnswer(index: number) {
    if (!started) return;
    if (current >= questions.length) return;
    if (answerLockRef.current || selectedIndex !== null || advanceLockRef.current) return;

    answerLockRef.current = true;

    const isCorrect = index === questions[current].correct;
    const rtSeconds = Math.max(0, (Date.now() - questionStartTimeRef.current) / 1000);

    setSelectedIndex(index);
    setIsCorrectSelection(isCorrect);

    updateCurrentTrial(index, false, rtSeconds);
    commitCurrentTrial();

    if (isCorrect) {
      setScore((prev) => prev + 1);
    } else {
      wrongAnswerCountRef.current += 1;

      if (wrongAnswerCountRef.current === 2) {
        pendingWrongPromptQuestionRef.current = current + 1;
      }
    }

    goNextQuestion(1500);

    answerLockRef.current = false;
  }

  function parseQuestionNumber(message: string): number | null {
    const text = message.toLowerCase();

    const ordinalWordMap: Record<string, number> = {
      first: 1,
      second: 2,
      third: 3,
      fourth: 4,
      fifth: 5,
      sixth: 6,
      seventh: 7,
      eighth: 8,
      ninth: 9,
      tenth: 10,
      eleventh: 11,
      twelfth: 12,
      thirteenth: 13,
      fourteenth: 14,
    };

    const ordinalNumberMatch = text.match(/\b(\d+)(st|nd|rd|th)\b/);
    if (ordinalNumberMatch) {
      return parseInt(ordinalNumberMatch[1], 10);
    }

    const digitMatch = text.match(/\d+/);
    if (digitMatch) {
      return parseInt(digitMatch[0], 10);
    }

    for (const [word, num] of Object.entries(ordinalWordMap)) {
      if (text.includes(word)) return num;
    }

    return null;
  }

  function generateReply(message: string) {
    const questionNumber = parseQuestionNumber(message);

    if (questionNumber) {
      const question = questions.find((q) => q.id === questionNumber);
      if (!question) return "I couldn't find that question number.";

      const correctIndex = question.correct;
      const allIndices = [0, 1, 2, 3, 4, 5];
      const wrongIndices = allIndices.filter((i) => i !== correctIndex);

      for (let i = wrongIndices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [wrongIndices[i], wrongIndices[j]] = [wrongIndices[j], wrongIndices[i]];
      }

      const picked = wrongIndices.slice(0, 2);
      const letters = picked.map((i) => String.fromCharCode(65 + i));

      const responses = [
        `It is not option ${letters[0]} or ${letters[1]}.`,
        `You can eliminate ${letters[0]} and ${letters[1]}.`,
        `${letters[0]} and ${letters[1]} are definitely incorrect.`,
        `Try avoiding ${letters[0]} and ${letters[1]}.`,
        `I would rule out ${letters[0]} and ${letters[1]}.`,
      ];

      return responses[Math.floor(Math.random() * responses.length)];
    }

    return "Type a question number (e.g., 1, q1, 1st, or first) to get help.";
  }

  function sendMessage() {
    const text = input.trim();
    if (!text) return;

    const userMessage: Message = { sender: "user", text };
    const botText = generateReply(text);
    const botReply: Message = { sender: "bot", text: botText };

    appendChatLog("user", text);
    appendChatLog("assistant", botText);

    setMessages((prev) => [...prev, userMessage, botReply]);
    setInput("");
  }

  function postToGoogleSheet(payload: Record<string, string>) {
    return new Promise<void>((resolve, reject) => {
      const iframeName = `gs-submit-frame-${Date.now()}`;

      const iframe = document.createElement("iframe");
      iframe.name = iframeName;
      iframe.style.display = "none";

      const form = document.createElement("form");
      form.method = "POST";
      form.action = GOOGLE_APPS_SCRIPT_URL;
      form.target = iframeName;
      form.style.display = "none";

      Object.entries(payload).forEach(([key, value]) => {
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = key;
        input.value = value;
        form.appendChild(input);
      });

      let submitted = false;

      const cleanup = () => {
        window.clearTimeout(timeoutId);
        form.remove();
        iframe.remove();
      };

      const timeoutId = window.setTimeout(() => {
        cleanup();
        reject(new Error("Google Sheets submission timed out"));
      }, 15000);

      iframe.onload = () => {
        if (!submitted) return;
        cleanup();
        resolve();
      };

      document.body.appendChild(iframe);
      document.body.appendChild(form);

      submitted = true;
      form.submit();
    });
  }

  async function submitWithRetry(payload: Record<string, string>, retries = 3) {
    for (let i = 0; i < retries; i++) {
      try {
        await postToGoogleSheet(payload);
        return true;
      } catch {
        if (i === retries - 1) return false;
        await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
      }
    }
    return false;
  }

  async function saveAndReturnToQualtrics() {
    if (saveLockRef.current) return;
    saveLockRef.current = true;
    setIsSubmitting(true);

    try {
      const finalTotalTime =
        experimentStartTime !== null
          ? Math.floor((Date.now() - experimentStartTime) / 1000)
          : totalTime;

      const summary: SummaryRecord = {
        rid,
        total_score: score,
        total_time_seconds: finalTotalTime,
        n_trials: trialsRef.current.length,
        saved_at: new Date().toISOString(),
      };

      const backup = {
        summary,
        trials: trialsRef.current,
        chatlog: chatlogRef.current,
      };
      localStorage.setItem(`backup_${rid}`, JSON.stringify(backup));

      const success = await submitWithRetry({
        rid,
        summary_json: JSON.stringify(summary),
        trials_json: JSON.stringify(trialsRef.current),
        chatlog_json: JSON.stringify(chatlogRef.current),
      });

      if (!success) {
        alert("Submission failed. Please click again.");
        saveLockRef.current = false;
        setIsSubmitting(false);
        return;
      }

      localStorage.removeItem(`backup_${rid}`);
      window.location.href = QUALTRICS_RETURN_URL;
    } catch (error) {
      alert("Saving failed.");
      saveLockRef.current = false;
      setIsSubmitting(false);
    }
  }

  useEffect(() => {
    const backup = localStorage.getItem(`backup_${rid}`);
    if (backup) {
      console.warn("Found unsent backup data");
    }
  }, [rid]);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (current >= questions.length && isSubmitting) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [current, isSubmitting]);

  useEffect(() => {
    if (!started || current >= questions.length) return;
    if (!experimentStartTime) return;

    const interval = setInterval(() => {
      setTotalTime(Math.floor((Date.now() - experimentStartTime) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [started, experimentStartTime, current]);

  useEffect(() => {
    if (!started) return;
    if (current < questions.length) return;

    autoReturnTimerRef.current = setTimeout(() => {
      void saveAndReturnToQualtrics();
    }, 2000);

    return () => {
      if (autoReturnTimerRef.current) {
        clearTimeout(autoReturnTimerRef.current as ReturnType<typeof setTimeout>);
        autoReturnTimerRef.current = null;
      }
    };
  }, [current, started]);

  if (showCover) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-white text-center">
          <h1 className="text-4xl font-bold mb-8">Pattern Reasoning Challenge</h1>
          <button
            onClick={() => {
              setShowCover(false);
              setShowStartButton(false);
              setTimeout(() => setShowStartButton(true), 25000);
            }}
            className="px-10 py-4 border border-cyan-400 text-cyan-400 rounded-2xl hover:bg-cyan-400 hover:text-black transition"
          >
            BEGIN
          </button>
        </div>
      </div>
    );
  }

  if (!started) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center px-6">
        <div className="bg-black/70 backdrop-blur-xl border border-cyan-400 text-white rounded-3xl shadow max-w-2xl p-12 text-center">
          <h1 className="text-4xl font-bold mb-4">RULES</h1>
          <div className="mt-6 space-y-2 text-lg text-left">
            <p>14 questions, 30s each.</p>
            <p>Use assistant if needed.</p>
          </div>
          <div className="mt-6">
            {showStartButton && (
              <button
                onClick={() => {
                  setStarted(true);
                  setExperimentStartTime(Date.now());
                }}
                className="px-10 py-4 bg-black text-cyan-400 border border-cyan-400 rounded-2xl"
              >
                READY!
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (current >= questions.length) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <button onClick={() => void saveAndReturnToQualtrics()} disabled={isSubmitting}>
          {isSubmitting ? "Saving..." : "Back to Questionnaire"}
        </button>
      </div>
    );
  }

  return <div />;
}
