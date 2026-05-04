"use client";

import { useEffect, useRef, useState } from "react";

const questions = [
  { id: 1, correct: 1 },
  { id: 2, correct: 3 },
  { id: 3, correct: 4 },
  { id: 4, correct: 3 },
  { id: 5, correct: 3 },
  { id: 6, correct: 0 },
  { id: 7, correct: 5 },
  { id: 8, correct: 5 },
  { id: 9, correct: 4 },
  { id: 10, correct: 2 },
];

const originalHelpPromptText =
  "Hi there! We’re on the same team!\n\nI'm here to help you if you get stuck.\n\nJust type the question number you're working on (e.g., '1'), and I'll narrow it down to two options for you.";

const shortHelpPromptTexts = [
  "That one was a bit tough—want a hint? Just tell me the question number.",
  "Hey, \nNo worries — we can get the next one together.",
  "That one was tricky. Let’s figure this one out together.",
  "Any help?",
];

const encouragementMessages = [
  "Good job!",
  "Excellent work!",
  "Well done!",
  "Nice one!",
  "You got it!",
  "Great answer!",
];

const commu = [
  {id:1, time: 5, hint:"This one is relatively simple， you got this!"},
  {id:2, time: 10, hint:"Hmm, this one’s tough.\n\nMaybe try tracking the outer shape and the inner pattern separately?\n\nYou can also type the question number to ask me for help, too."},
  {id:3, time: 12, hint:"If I were you, I’d look at both the border and the center, and how they change across the row—I have a feeling the inner shape might be a solid circle."},
  {id:4, time: 10, hint:"This one’s a bit easier. I think you can focus on how the black section moves and flips."},
  {id:5, time: 11, hint:"Try imagining the first two shapes in each row combined?"},
  {id:6, time: 14, hint:"You’ll handle this one just fine. It’s a simple one!"},
  {id:7, time: 13, hint:"I feel like you could try overlaying the first two shapes in each row and see what cancels out."},
  {id:8, time: 10, hint:"It might help to look at how the black area changes across each row~"},
  {id:9, time: 12, hint:"I think for this one, you can look at each column—notice how the inner shape in the first and third match, while the outer shape in the second and third match."},
  {id:10, time: 11, hint:"The last one! Please try tracking the top and bottom parts separately."},];

  

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
};

type TimerHandle = ReturnType<typeof setTimeout> | ReturnType<typeof setInterval> | null;

export default function Home() {
  const [current, setCurrent] = useState<number>(0);
  const [score, setScore] = useState<number>(0);
  const [timeLeft, setTimeLeft] = useState<number>(90);
  const [totalTime, setTotalTime] = useState<number>(0);
  const [experimentStartTime, setExperimentStartTime] = useState<number | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [isCorrectSelection, setIsCorrectSelection] = useState<boolean | null>(null);
  const [started, setStarted] = useState<boolean>(false);
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
  const hintTimerRef = useRef<TimerHandle>(null);

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
  const pendingRedirectRef = useRef(false);
  const wrongSinceLastPromptRef = useRef(0);
  const encouragementCountRef = useRef(0);
  const receivedHintRef = useRef(false);
  const lastShortPromptIndexRef = useRef<number | null>(null);
  const usedEncouragementsRef = useRef<string[]>([]);
  const [rulesView, setRulesView] = useState<"choice" | "text" | "video">("choice");
  const [videoReady, setVideoReady] = useState(false);
  const videoReadyTimerRef = useRef<TimerHandle>(null);
  
  function appendChatLog(
    role: "user" | "assistant",
    text: string
  ) {
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
    clearTimer(hintTimerRef);

    advanceRef.current = setTimeout(() => {
      setSelectedIndex(null);
      setIsCorrectSelection(null);
    
      const nextQuestion = current + 1;
    
      setCurrent((prev) =>
        prev >= questions.length - 1 ? questions.length : prev + 1
      );
    
      // 👇 在这里直接判断
      if (pendingWrongPromptQuestionRef.current === nextQuestion) {
        pendingWrongPromptQuestionRef.current = null;
    
        let promptText;

        const promptIndex = assistantTriggerCountRef.current - 1;
        lastShortPromptIndexRef.current = promptIndex;
        
        promptText = shortHelpPromptTexts[promptIndex];
        setMessages((prev) => [...prev, { sender: "bot", text: promptText }]);
    
        appendChatLog("assistant", promptText);
      }
    
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
    wrongAnswerCountRef.current += 1;
    wrongSinceLastPromptRef.current += 1;
    
    const neededWrongCount = assistantTriggerCountRef.current === 0 ? 1 : 2;
    
    if (
      assistantTriggerCountRef.current < shortHelpPromptTexts.length &&
      wrongSinceLastPromptRef.current >= neededWrongCount
    ) {
      pendingWrongPromptQuestionRef.current = current + 1;
      assistantTriggerCountRef.current += 1;
      wrongSinceLastPromptRef.current = 0;
    }
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
        if (receivedHintRef.current) {
        const available = encouragementMessages.filter(
          (msg) => !usedEncouragementsRef.current.includes(msg)
        );
        const shouldEncourage = encouragementCountRef.current < 2 || Math.random() < 0.4;

        if (available.length > 0 && shouldEncourage) {
          const encouragement = available[Math.floor(Math.random() * available.length)];
          setMessages((prev) => [...prev, { sender: "bot", text: encouragement }]);
          appendChatLog("assistant", encouragement);
          usedEncouragementsRef.current.push(encouragement);
          encouragementCountRef.current += 1;
        }
        receivedHintRef.current = false;
      }
    } 
    else {
      wrongAnswerCountRef.current += 1;
      wrongSinceLastPromptRef.current += 1;
    
      const neededWrongCount = assistantTriggerCountRef.current === 0 ? 1 : 2;
    
      if (
        assistantTriggerCountRef.current < shortHelpPromptTexts.length &&
        wrongSinceLastPromptRef.current >= neededWrongCount
      ) {
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

  function buildHintText(question: { id: number; correct: number }): string {
    const correctIndex = question.correct;
    const allIndices = [0, 1, 2, 3, 4, 5];
    const wrongIndices = allIndices.filter((i) => i !== correctIndex);  
    for (let i = wrongIndices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [wrongIndices[i], wrongIndices[j]] = [wrongIndices[j], wrongIndices[i]];
    }
    const wrongPick = wrongIndices[0];
    const pair = [correctIndex, wrongPick].sort(() => Math.random() - 0.5);
    const letters = pair.map((i) => String.fromCharCode(65 + i));
    const responses = [
      `Hmm, I'd focus on ${letters[0]} and ${letters[1]}. The answer is one of these two.`,
      `The correct answer is either ${letters[0]} or ${letters[1]}. Take your pick.`,
      `I've narrowed it down for you: ${letters[0]} or ${letters[1]}. One of them is right.`,
      `Look at ${letters[0]} and ${letters[1]} more carefully. The correct answer is hiding in there.`,
      `If I were you, I'd choose between ${letters[0]} and ${letters[1]}. That's where the answer is.`,
    ];
    return responses[Math.floor(Math.random() * responses.length)];
  }

  function generateReply(message: string, currentQuestionId: number): { text: string; triggerIndex: 4 | 5 } {
    const text = message.trim().toLowerCase();
    const normalized = text.replace(/[^a-z]/g, "");
    const positiveHelpReplies = [
      "yes",
      "yeah",
      "yep",
      "yup",
      "sure",
      "ok",
      "okay",
      "pls",
      "please",
    ];
    
    if (
      lastShortPromptIndexRef.current !== null &&
      lastShortPromptIndexRef.current >=3 &&
      positiveHelpReplies.includes(normalized)
    ) {
      lastShortPromptIndexRef.current = null;
    
      const currentQ = questions.find((q) => q.id === currentQuestionId);
      if (!currentQ) {
        return { text: "I couldn't find the current question.", triggerIndex: 5 };
      }
    
      return { text: buildHintText(currentQ), triggerIndex: 4 };
    }

    // yes — follow up on a pending redirect
    if (pendingRedirectRef.current && ["yes", "yeah", "yep", "yup", "sure"].includes(normalized)) {
      pendingRedirectRef.current = false;
      const currentQ = questions.find((q) => q.id === currentQuestionId);
      if (!currentQ) return { text: "I couldn't find the current question.", triggerIndex: 5 };
      return { text: buildHintText(currentQ), triggerIndex: 4 };
    }

    pendingRedirectRef.current = false;

    // why
    if (text === "why") {
      const responses = [
        "There is really no extra time for 'why.' Let’s move~",
        "Let’s focus on narrowing it down first—we can come back to the “why” after the test.",
      ];
      return { text: responses[Math.floor(Math.random() * responses.length)], triggerIndex: 5 };
    }
    // no / no need / nope — dismissal
    if (
      normalized === "no" ||
      normalized === "nope" ||
      normalized === "nah" ||
      normalized === "stop" ||
      normalized === "i'm good" ||
      normalized === "i am good" ||
      normalized.startsWith("noneed") ||
      normalized.startsWith("nothanks") ||
      normalized.startsWith("nothank")
    ) {
      const responses = ["Okay.", "No problem.", "Alright.", "Sure."];
      return { text: responses[Math.floor(Math.random() * responses.length)], triggerIndex: 5 };
    }

    if (normalized === "thankyou" || normalized === "thanku" || normalized === "thanks" || normalized === "thank") {
      return { text: "You are welcome!", triggerIndex: 5 };
    }
    
    // ok / okay / got it / alright — light acknowledgement
    if (["ok", "okay", "alright", "gotit", "noted", "sure"].includes(normalized)) {
      const responses = ["Got it.", "Alright.", "Sure.", "Noted."];
      return { text: responses[Math.floor(Math.random() * responses.length)], triggerIndex: 5 };
    }

    // hint / clue / tip — give hint for current question
    if (["hint", "clue", "tip"].some((kw) => text.includes(kw)) || text === "help me" || normalized === "help") {
      const currentQ = questions.find((q) => q.id === currentQuestionId);
      if (!currentQ) return { text: "I couldn't find the current question.", triggerIndex: 5 };
      return { text: buildHintText(currentQ), triggerIndex: 4 };
    }
  
    const questionNumber = parseQuestionNumber(message);
  
    if (questionNumber) {
      const question = questions.find((q) => q.id === questionNumber);
      if (!question) return { text: "I couldn't find that question number.", triggerIndex: 5 };
  
      const hintText = buildHintText(question);

      if (questionNumber !== currentQuestionId) {
        pendingRedirectRef.current = true;
        return { text: `${hintText}\n\nNote: you are currently on Question ${currentQuestionId}. Were you asking about this one instead?`, triggerIndex: 4 };
      }
      return { text: hintText, triggerIndex: 4 };
    }
    return { text: "Type a question number (e.g., 1, q1, 1st, or first) to get help.", triggerIndex: 5 };
  }
  function sendMessage() {
    const text = input.trim();
    if (!text) return;
    const currentQuestionId = questions[current]?.id ?? current + 1;
    const userMessage: Message = { sender: "user", text };
    const { text: botText, triggerIndex } = generateReply(text, currentQuestionId);
    if (triggerIndex === 4) {
      receivedHintRef.current = true;
    }
    appendChatLog("user", text);
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
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);
  
  useEffect(() => {
    if (rulesView !== "video") {
      setVideoReady(false);
      clearTimer(videoReadyTimerRef);
      return;
    }
    videoReadyTimerRef.current = setTimeout(() => setVideoReady(true), 47000);
    return () => clearTimer(videoReadyTimerRef);
  }, [rulesView]);


  useEffect(() => {
    if (!started || current >= questions.length) return;

    clearTimer(countdownRef);
    clearTimer(advanceRef);
    clearTimer(answerTimeoutRef);

    answerLockRef.current = false;
    advanceLockRef.current = false;

    setTimeLeft(90);
    questionStartTimeRef.current = Date.now();
    setSelectedIndex(null);
    setIsCorrectSelection(null);

    initCurrentTrial();
    clearTimer(hintTimerRef);
    const hintEntry = commu.find((c) => c.id === questions[current].id);
    if (hintEntry) {
      hintTimerRef.current = setTimeout(() => {
        setMessages((prev) => [...prev, { sender: "bot", text: hintEntry.hint }]);
        appendChatLog("assistant", hintEntry.hint);
        receivedHintRef.current = true;  
      }, hintEntry.time * 1000);
    }
    countdownRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearTimer(countdownRef);
          handleTimeout();
          return 90;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      clearTimer(countdownRef);
      clearTimer(advanceRef);
      clearTimer(answerTimeoutRef);
      clearTimer(hintTimerRef);
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
    const handleStart = () => {
      pendingWrongPromptQuestionRef.current = null;
      wrongAnswerCountRef.current = 0;
      assistantTriggerCountRef.current = 0;
      wrongSinceLastPromptRef.current = 0;
      lastShortPromptIndexRef.current = null;
      setMessages([{ sender: "bot", text: originalHelpPromptText }]);
      appendChatLog("assistant", originalHelpPromptText);
      setInput("");
      setStarted(true);
      setExperimentStartTime(Date.now());
    };
  
    const backButton = (
      <button
        onClick={() => setRulesView("choice")}
        className="absolute top-7 left-8 flex items-center gap-2 text-xs tracking-[0.2em] text-cyan-400/50 hover:text-cyan-400 border border-cyan-400/20 hover:border-cyan-400/60 px-4 py-2 rounded-xl transition-all duration-300"
      >
        ← BACK
      </button>
    );
  
    // ── Choice screen ──────────────────────────────────────────────
    if (rulesView === "choice") {
      return (
        <div className="h-screen bg-black flex overflow-hidden relative select-none">
  
          {/* Title */}
          <div className="absolute top-8 left-0 right-0 flex justify-center z-10 pointer-events-none">
            <p className="text-base font-bold tracking-normal text-white/30">INSTRUCTIONS</p>
          </div>
  
          {/* Left — Text */}
          <div
            onClick={() => setRulesView("text")}
            className="w-1/2 h-full relative cursor-pointer group overflow-hidden"
          >
            {/* blurred text preview */}
            <div className="absolute inset-0 flex flex-col justify-center px-14 py-20 gap-4 blur-md opacity-30 group-hover:opacity-50 group-hover:blur-sm transition-all duration-700 pointer-events-none">
              {["01", "02", "03", "04", "05"].map((n, i) => (
                <div key={n} className="flex gap-4 items-start">
                  <span className="text-cyan-400 font-bold text-sm">{n}</span>
                  <div className="flex flex-col gap-1.5 flex-1">
                    <div className="h-2 bg-white/60 rounded-full w-full" />
                    {i % 2 === 0 && <div className="h-2 bg-white/40 rounded-full w-3/4" />}
                  </div>
                </div>
              ))}
            </div>
  
            {/* overlay */}
            <div className="absolute inset-0 bg-black/70 group-hover:bg-black/40 transition-all duration-500" />
  
            {/* label */}
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
              <span className="text-5xl font-bold tracking-wide text-white/80 group-hover:text-cyan-400 transition-colors duration-400">Text</span>
              <span className="text-lg tracking-widest text-gray-500 group-hover:text-gray-300 transition-colors duration-400">Click to read the text instructions.</span>
            </div>
          </div>
  
          {/* Divider */}
          <div className="w-px bg-gradient-to-b from-transparent via-cyan-400/40 to-transparent self-stretch" />
  
          {/* Right — Video */}
          <div
            onClick={() => setRulesView("video")}
            className="w-1/2 h-full relative cursor-pointer group overflow-hidden"
          >
            {/* blurred video preview */}
            <video
              src="/videos/rules.mp4"
              muted
              playsInline
              autoPlay
              loop
              className="absolute inset-0 w-full h-full object-cover blur-lg opacity-25 group-hover:opacity-45 group-hover:blur-md transition-all duration-700 pointer-events-none"
            />
  
            {/* overlay */}
            <div className="absolute inset-0 bg-black/70 group-hover:bg-black/40 transition-all duration-500" />
  
            {/* label */}
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
              <span className="text-5xl font-bold tracking-wide text-white/80 group-hover:text-cyan-400 transition-colors duration-400">video</span>
              <span className="text-lg tracking-widest text-gray-500 group-hover:text-gray-300 transition-colors duration-400">Click to watch the video instructions.</span>
            </div>
          </div>
        </div>
      );
    }
  
    // ── Text view ──────────────────────────────────────────────────
    if (rulesView === "text") {
      return (
        <div className="h-screen bg-black flex items-center justify-center relative">
          {backButton}
  
          <div className="max-w-lg w-full flex flex-col gap-10 px-8">
            <h1 className="text-3xl font-bold tracking-[0.3em] text-white text-center">INSTRUCTIONS</h1>
            <div className="flex flex-col gap-6">
              {[
                { n: "01", text: "There will be 10 matrix reasoning problems. You will have 90 seconds for each question. Each correct answer is worth 1 point." },
                { n: "02", text: "In the question area, the question number appears in the top-left corner, and the countdown timer and your score appear in the top-right corner."}, 
                { n: "03", text: "An assistant panel is located on the left side of the screen. You can use it if you need help with a question. It can narrow the choices down to two options, one of which is correct." },
                { n: "04", text: "Immediate feedback is provided after each selection: a green check mark indicates a correct answer, and a red cross indicates an incorrect one." },
                { n: "05", text: "You and the assistant will work together as a team. Please solve as many problems as you can." },
              ].map(({ n, text }) => (
                <div key={n} className="flex gap-5 items-start">
                  <span className="text-cyan-400 font-bold text-sm tracking-widest pt-0.5 w-6 shrink-0">{n}</span>
                  <p className="text-gray-300 leading-relaxed text-sm">{text}</p>
                </div>
              ))}
            </div>
  
            <div className="flex flex-col items-center gap-3">
              {!showStartButton && <p className="text-gray-600 animate-pulse text-xs tracking-widest">PREPARING...</p>}
              {showStartButton && (
                <button
                  onClick={handleStart}
                  className="px-10 py-4 bg-black text-cyan-400 rounded-2xl border border-cyan-400 shadow-[0_0_20px_rgba(0,255,255,0.2)] tracking-widest text-sm hover:bg-cyan-400 hover:text-black transition-all duration-300"
                >
                  READY
                </button>
              )}
            </div>
          </div>
        </div>
      );
    }
  
    // ── Video view ─────────────────────────────────────────────────
    return (
      <div className="h-screen bg-black flex flex-col items-center justify-center gap-8 relative">
        {backButton}
  
        <video
          src="/videos/rules.mp4"
          controls
          style={{ maxHeight: "70vh", maxWidth: "85vw", width: "auto", height: "auto" }}
          className="rounded-2xl shadow-[0_0_40px_rgba(0,0,0,0.8)]"
        />
  
        <div className="flex flex-col items-center gap-3 h-14">
          {!videoReady && (
            <p className="text-gray-600 animate-pulse text-xs tracking-widest">WATCH THE VIDEO TO CONTINUE...</p>
          )}
          {videoReady && (
            <button
              onClick={handleStart}
              className="px-10 py-4 bg-black text-cyan-400 rounded-2xl border border-cyan-400 shadow-[0_0_20px_rgba(0,255,255,0.2)] tracking-widest text-sm hover:bg-cyan-400 hover:text-black transition-all duration-300"
            >
              READY
            </button>
          )}
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
      <div className="h-screen flex">
        {/* 左侧 1/4 — 常驻 Assistant 面板 */}
        <div className="w-1/4 h-full bg-white border-r border-gray-200 flex flex-col">
          <div className="px-6 py-4 border-b">
            <p className="text-xs tracking-widest text-black font-semibold">ASSISTANT</p>
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
  
        {/* 右侧 3/4 — 题目区域 */}
        <div className="w-3/4 h-full flex flex-col items-center justify-center relative">
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
                    ${selectedIndex === index ? "ring-4 ring-cyan-400 shadow-[0_0_20px_rgba(0,255,255,0.9)] scale-110" : ""}
                    ${selectedIndex === null ? "cursor-pointer hover:scale-105" : ""}
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
        </div>
      </div>
    );
}
