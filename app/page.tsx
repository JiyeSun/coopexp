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

const shortHelpPromptTexts = [
  "Do you want me to help you? Tell me which question you are trying to solve.",
  "One more hint?",
  "Any help?",
];

const QUALTRICS_RETURN_URL = "https://iu.co1.qualtrics.com/jfe/form/SV_2tvhb3IQU4w77Om";
const GOOGLE_APPS_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbzeCOeL06qEoF8QOlnJ6w67x-t8TCJuWTGkS24bYtSG-XNcZjrIkvZOaLrYXOP9DsUr/exec";

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

  trigger_source?: "manual" | "auto";
  prompt_type?: "long" | "short";
  trigger_index?: number;
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

  const currentTrialRef = useRef<TrialRecord | null>(null);
  const trialCommittedRef = useRef(false);
  const trialsRef = useRef<TrialRecord[]>([]);
  const chatlogRef = useRef<ChatLogRecord[]>([]);
  const saveLockRef = useRef(false);
  
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const assistantTriggerCountRef = useRef(0); 
  const wrongSinceLastPromptRef = useRef(0); 
  const hasShownLongPromptRef = useRef(false);
  
  function appendChatLog(
    role: "user" | "assistant",
    text: string,
    extra?: Partial<ChatLogRecord>
  ) {
    chatlogRef.current.push({
      rid,
      timestamp: new Date().toISOString(),
      role,
      text,
      ...extra,
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
      wrongSinceLastPromptRef.current += 1;
      
      if (assistantTriggerCountRef.current >= 4) {
        return;
      }
    
      if (!hasShownLongPromptRef.current) {
        pendingWrongPromptQuestionRef.current = current + 1;
        hasShownLongPromptRef.current = true;
        assistantTriggerCountRef.current += 1;
        wrongSinceLastPromptRef.current = 0;
      } 
      else if (wrongSinceLastPromptRef.current >= 2) {
        pendingWrongPromptQuestionRef.current = current + 1;
        assistantTriggerCountRef.current += 1;
        wrongSinceLastPromptRef.current = 0;
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
    const text = message.trim().toLowerCase();
  
    // why
    if (text === "why") {
      const responses = [
        "Don’t ask why. I’ll just help you cut out some wrong options. You don’t have that much time.",
        "No time for ‘why’. I’ll help you eliminate a few wrong ones.",
        "Skip the why. Let’s narrow it down fast.",
        "I won’t explain everything. I’ll just remove some bad options for you."
      ];
      return responses[Math.floor(Math.random() * responses.length)];
    }
  
    // ok / okay
    if (["ok", "okay"].includes(text.replace(/[^a-z]/g, ""))) {
      return null;
    }
  
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
  
    appendChatLog("user", text);
  
    if (botText === null) {
      setMessages((prev) => [...prev, userMessage]);
      setInput("");
      return;
    }
  
    const botReply: Message = { sender: "bot", text: botText };
  
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

  async function saveAndReturnToQualtrics() {
    if (saveLockRef.current) return;
    saveLockRef.current = true;
    setIsSubmitting(true);

    try {
      if (autoReturnTimerRef.current) {
        clearTimeout(autoReturnTimerRef.current as ReturnType<typeof setTimeout>);
        autoReturnTimerRef.current = null;
      }

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

      await postToGoogleSheet({
        rid,
        summary_json: JSON.stringify(summary),
        trials_json: JSON.stringify(trialsRef.current),
        chatlog_json: JSON.stringify(chatlogRef.current),
      });

      window.location.href = QUALTRICS_RETURN_URL;
    } catch (error) {
      console.error(error);
      alert("Saving data failed. Please try again.");
      saveLockRef.current = false;
      setIsSubmitting(false);
    }
  }

  useEffect(() => {
    if (!started || current >= questions.length) return;
    if (!experimentStartTime) return;

    const interval = setInterval(() => {
      setTotalTime(Math.floor((Date.now() - experimentStartTime) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [started, experimentStartTime, current]);
  
  useEffect(() => {
    if (showChat) {
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, showChat]);

  useEffect(() => {
    if (!started) return;
    if (current >= questions.length) return;
  
    const shouldShowAutoPrompt =
      pendingWrongPromptQuestionRef.current === current;
  
    if (shouldShowAutoPrompt) {
      pendingWrongPromptQuestionRef.current = null;
      
      let promptText;

      if (assistantTriggerCountRef.current === 1) {
        promptText = originalHelpPromptText;
      } else if (assistantTriggerCountRef.current === 2) {
        // 第二次仍用原来的短提示（可选，看你设计）
        promptText = shortHelpPromptTexts[0];
      } else {
        // 第三、第四次随机
        const randomIndex = Math.floor(Math.random() * (shortHelpPromptTexts.length - 1)) + 1;
        promptText = shortHelpPromptTexts[randomIndex];
      }
  
      setShowChat(true);
      setMessages((prev) => [...prev, { sender: "bot", text: promptText }]);
      appendChatLog("assistant", promptText, {
        trigger_source: "auto",
        prompt_type: assistantTriggerCountRef.current === 1 ? "long" : "short",
        trigger_index: assistantTriggerCountRef.current,
      });
    }
  }, [current, started]);

  useEffect(() => {
    if (!started || current >= questions.length) return;

    clearTimer(countdownRef);
    clearTimer(advanceRef);
    clearTimer(answerTimeoutRef);

    answerLockRef.current = false;
    advanceLockRef.current = false;

    setTimeLeft(30);
    questionStartTimeRef.current = Date.now();
    setSelectedIndex(null);
    setIsCorrectSelection(null);

    initCurrentTrial();

    countdownRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearTimer(countdownRef);
          handleTimeout();
          return 30;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      clearTimer(countdownRef);
      clearTimer(advanceRef);
      clearTimer(answerTimeoutRef);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, started]);

  useEffect(() => {
    if (!started) return;
    if (current < questions.length) return;
  
    void saveAndReturnToQualtrics();
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

              setTimeout(() => {
                setShowStartButton(true);
              }, 25000);
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
        <div className="bg-black/70 backdrop-blur-xl border border-cyan-400 text-white rounded-3xl shadow-[0_0_40px_rgba(0,255,255,0.2)] max-w-2xl p-12 text-center">
          <div className="text-center">
            <div className="text-4xl font-bold mb-4">
              <p>RULES</p>
            </div>

            <div className="mt-6 space-y-2 text-lg text-white text-left pl-6">
              <p>
                There will be 14 matrix reasoning problems. You will have 30 seconds for each question.
                Each correct answer is worth 1 point.
              </p>
              <p>
                The upper left corner shows the question number. The upper right corner shows the countdown
                timer and your score. An ASSISTANT button is available in the lower left corner. You are
                encouraged to use the assistant if you need help with a question.
              </p>
              <p>
                A green check mark indicates a correct answer, and a red cross mark indicates an incorrect
                answer. The AI agent’s responses and feedback are shown on the same screen.
              </p>
              <p>Please solve as many problems as you can.</p>
            </div>
          </div>

          <div className="flex flex-col items-center mt-6">
            {!showStartButton && <p className="text-gray-500 animate-pulse mb-4">Preparing challenge...</p>}

            {showStartButton && (
              <button
                onClick={() => {
                  hasManuallyOpenedAssistantRef.current = false;
                  pendingWrongPromptQuestionRef.current = null;
                  wrongAnswerCountRef.current = 0;
                  assistantTriggerCountRef.current = 0;
                  wrongSinceLastPromptRef.current = 0;
                  hasShownLongPromptRef.current = false;

                  setMessages([]);
                  setInput("");
                  setShowChat(false);

                  setStarted(true);
                  setExperimentStartTime(Date.now());
                }}
                className="px-10 py-4 bg-black/80 backdrop-blur-md text-cyan-400 rounded-2xl border border-cyan-400 shadow-[0_0_20px_rgba(0,255,255,0.3)] tracking-widest text-lg hover:bg-cyan-400 hover:text-black transition-all duration-300"
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
    const minutes = Math.floor(totalTime / 60);
    const seconds = totalTime % 60;

    return (
      <div className="min-h-screen bg-black flex items-center justify-center px-6">
        <div className="bg-black/70 backdrop-blur-xl border border-cyan-400 text-white rounded-3xl shadow-[0_0_40px_rgba(0,255,255,0.2)] max-w-xl px-16 py-14 text-center">
          <h1 className="text-3xl font-semibold mb-6 tracking-wide">Experiment completed.</h1>

          <p className="text-lg text-gray-400 mt-4">
            Total time:{" "}
            <span className="text-cyan-400 font-semibold">
              {minutes}m {seconds}s
            </span>
          </p>

          <p className="text-xl text-gray-300">
            Your score: <span className="text-cyan-400 font-semibold">{score}</span>
          </p>

          <div className="mt-8 flex flex-col items-center gap-4">
            <div className="flex items-center gap-3 text-cyan-400">
              <div className="w-5 h-5 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
              <span className="text-lg font-medium tracking-wide">
                Saving your data...
              </span>
            </div>
          
            <p className="text-sm text-gray-400">
              Please wait, you will be redirected automatically.
            </p>
          </div>
        </div>
        
      </div>
    );
  }

  const question = questions[current];
  const wrongCount = Math.max(0, current - score);

  return (
    <div className="h-screen flex flex-col items-center justify-center relative">
      <div className="absolute top-4 left-4 bg-black/80 backdrop-blur-md text-white px-6 py-3 rounded-2xl shadow-2xl border border-cyan-400">
        <div className="text-center">
          <p className="text-xs tracking-widest text-cyan-400">QUESTION</p>
          <p className="text-2xl font-bold">
            {current + 1}
            <span className="text-sm text-gray-300 ml-2">/ {questions.length}</span>
          </p>
        </div>
      </div>

      <div className="absolute top-4 right-4 bg-black/80 backdrop-blur-md text-white px-6 py-3 rounded-2xl shadow-2xl flex gap-8 items-center border border-cyan-400">
        <div className="text-center">
          <p className="text-xs tracking-widest text-cyan-400">WRONG</p>
          <p className="text-2xl font-bold text-red-400">{wrongCount}</p>
        </div>

        <div className="text-center">
          <p className="text-xs tracking-widest text-cyan-400">SCORE</p>
          <p className="text-2xl font-bold text-green-400">{score}</p>
        </div>

        <div className="text-center">
          <p className="text-xs tracking-widest text-cyan-400">TIME</p>
          <p className={`text-2xl font-bold ${timeLeft <= 10 ? "text-red-500 animate-pulse" : "text-white"}`}>
            {timeLeft}s
          </p>
        </div>
      </div>

      <img src={`/images/q${question.id}.png`} alt="question" className="mb-6 max-w-xl" />

      <div className="grid grid-cols-6 gap-6">
        {generateOptions(question.id).map((option, index) => (
          <div key={index} className="relative">
            <img
              src={option}
              alt="option"
              onClick={() => handleAnswer(index)}
              className={`w-24 h-24 object-contain transition duration-200
                ${
                  selectedIndex === index
                    ? "ring-4 ring-cyan-400 shadow-[0_0_20px_rgba(0,255,255,0.9)] scale-110"
                    : ""
                }
                ${
                  selectedIndex === null
                    ? "cursor-pointer hover:scale-105"
                    : ""
                }
              `}
            />

            {selectedIndex === index && isCorrectSelection === true && (
              <div className="absolute inset-0 bg-green-500/30 flex items-center justify-center rounded">
                <span className="text-green-400 text-5xl font-bold">✓</span>
              </div>
            )}

            {selectedIndex === index && isCorrectSelection === false && (
              <div className="absolute inset-0 bg-red-500/30 flex items-center justify-center rounded">
                <span className="text-red-500 text-5xl font-bold">✖</span>
              </div>
            )}
          </div>
        ))}
      </div>

      <button
        onClick={() => {
          setShowChat(true);

          if (!hasShownLongPromptRef.current && assistantTriggerCountRef.current < 4) {
            hasManuallyOpenedAssistantRef.current = true;
            hasShownLongPromptRef.current = true;
            assistantTriggerCountRef.current += 1;
            wrongSinceLastPromptRef.current = 0;

            pendingWrongPromptQuestionRef.current = null;
          
            setMessages((prev) => [
              ...prev,
              {
                sender: "bot",
                text: originalHelpPromptText,
              },
            ]);
          
            appendChatLog("assistant", originalHelpPromptText, {
              trigger_source: "manual",
              prompt_type: "long",
              trigger_index: assistantTriggerCountRef.current,
            });
          }
        }}
        className="fixed bottom-6 left-6 bg-black/80 backdrop-blur-md text-cyan-400 px-6 py-3 rounded-2xl border border-cyan-400 shadow-2xl tracking-widest text-sm hover:bg-cyan-400 hover:text-black transition-all duration-300"
      >
        ASSISTANT
      </button>

      {showChat && (
        <div className="fixed bottom-24 left-8 w-[480px] h-[560px] bg-white shadow-2xl rounded-3xl border border-gray-200 flex flex-col">
          <div className="px-6 py-4 border-b flex justify-between items-center">
            <p className="text-xs tracking-widest text-black">ASSISTANT</p>
            <button onClick={() => setShowChat(false)} className="text-gray-400 hover:text-black text-sm">
              ✕
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            {messages.map((msg, index) => (
              <div
                key={index}
                className={`flex items-end gap-2 ${msg.sender === "user" ? "justify-end" : "justify-start"}`}
              >
                {msg.sender === "bot" && <img src="/images/bot.png" alt="bot" className="w-8 h-8 rounded-full" />}

                <div
                  className={`max-w-[75%] px-4 py-2 rounded-2xl text-sm whitespace-pre-line ${
                    msg.sender === "user" ? "bg-black text-white" : "bg-white text-black border border-black"
                  }`}
                >
                  {msg.text}
                </div>

                {msg.sender === "user" && <img src="/images/user.png" alt="user" className="w-8 h-8 rounded-full" />}
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          <div className="border-t px-5 py-4 flex gap-3">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendMessage()}
              className="flex-1 border border-gray-300 rounded-xl px-4 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-cyan-400"
              placeholder="Ask about a question..."
            />
            <button
              onClick={sendMessage}
              className="px-5 bg-gray-900 text-white rounded-xl text-sm hover:bg-black transition"
            >
              Send
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
